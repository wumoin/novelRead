import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { logger } from '../logger';
import { decodeBuffer } from '../parser/encoding';
import { guessTitleAndAuthor, parseChapters } from '../parser/chapterParser';
import type { NovelRecord, ReaderSettings, ReaderTheme } from '../types';
import type { NovelStore } from '../storage/NovelStore';

const THEMES: readonly ReaderTheme[] = ['auto', 'light', 'sepia', 'dark'];

/** 读取用户在设置里配置的默认阅读偏好，用于新建小说配置记录。 */
export function readDefaultSettings(): ReaderSettings {
  const config = vscode.workspace.getConfiguration('novelRead.defaults');
  const theme = config.get<string>('theme', 'auto');
  return {
    fontSize: clamp(config.get<number>('fontSize', 16), 10, 40),
    lineHeight: clamp(config.get<number>('lineHeight', 1.8), 1, 3),
    fontFamily: '',
    theme: THEMES.includes(theme as ReaderTheme) ? (theme as ReaderTheme) : 'auto',
    maxWidth: clamp(config.get<number>('maxWidth', 760), 320, 4000),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/** 弹文件选择框并导入小说；用户取消或失败时返回 undefined。 */
export async function importNovel(store: NovelStore): Promise<NovelRecord | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFiles: true,
    canSelectFolders: false,
    openLabel: '导入到书架',
    filters: {
      小说文本: ['txt'],
      所有文件: ['*'],
    },
  });

  const sourceUri = picked?.[0];
  if (!sourceUri) {
    return undefined;
  }

  const existing = store.list().find((item) => item.sourcePath === sourceUri.fsPath);
  if (existing) {
    const choice = await vscode.window.showInformationMessage(
      `《${existing.title}》已经在书架里了。`,
      '直接打开',
      '重新导入',
    );
    if (choice === '重新导入') {
      await store.remove(existing.id);
    } else {
      return existing;
    }
  }

  try {
    return await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: '正在导入小说…' },
      () => buildRecord(sourceUri, store),
    );
  } catch (error) {
    logger.error('导入小说失败', error);
    void vscode.window.showErrorMessage(
      `导入失败：${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

async function buildRecord(sourceUri: vscode.Uri, store: NovelStore): Promise<NovelRecord> {
  const bytes = await vscode.workspace.fs.readFile(sourceUri);
  const { text, encoding } = decodeBuffer(bytes);
  const chapters = parseChapters(text);
  const fileName = path.basename(sourceUri.fsPath);
  const { title, author } = guessTitleAndAuthor(fileName);
  const now = Date.now();
  const id = randomUUID();

  // 先把字节原样复制进全局存储目录。之后阅读、定位、删除都只认这个副本，
  // 用户移动或删掉原文件都不影响书架。
  const storedFile = await store.copyIntoStorage(id, bytes);

  const record: NovelRecord = {
    id,
    title,
    author,
    sourcePath: sourceUri.fsPath,
    storedFile,
    fileSize: bytes.byteLength,
    encoding,
    chapters,
    createdAt: now,
    updatedAt: now,
    lastReadAt: 0,
    progress: { chapterIndex: 0, scrollRatio: 0 },
    settings: readDefaultSettings(),
    finished: false,
  };

  await store.add(record);
  logger.info(`已导入《${title}》：${chapters.length} 章，编码 ${encoding}，副本 ${storedFile}`);

  void vscode.window.showInformationMessage(
    `已导入《${title}》，共 ${chapters.length} 章（编码 ${encoding}）。`,
  );
  return record;
}
