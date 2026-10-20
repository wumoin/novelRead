import * as vscode from 'vscode';
import { READER_VIEW_ID, TEXT_CACHE_SIZE } from '../constants';
import { logger } from '../logger';
import { decodeBuffer } from '../parser/encoding';
import { getChapterContent } from '../parser/chapterParser';
import { importNovel } from '../importer/novelImporter';
import type { NovelRecord, NovelSummary, ReaderSettings } from '../types';
import type { NovelStore } from '../storage/NovelStore';
import { getWebviewHtml } from './webviewHtml';
import type { ChapterPayload, HostMessage, WebviewMessage } from './messages';

/**
 * 底部面板里的阅读器 Webview 视图。
 *
 * 视图在用户第一次展开面板时才创建，所以所有主动推送（例如导入完成后刷新书架）
 * 都要先判断 `this.view` 是否存在；`pendingOpenId` 用来记住「视图还没建好时
 * 用户想打开哪本书」。
 */
export class NovelReaderViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = READER_VIEW_ID;

  private view: vscode.WebviewView | undefined;
  /** 记录 Webview 是否已经发过 ready，避免往未就绪的页面推消息。 */
  private webviewReady = false;
  private pendingOpenId: string | null = null;
  /** novelId → 解码后的全文，LRU 上限 TEXT_CACHE_SIZE 本。 */
  private readonly textCache = new Map<string, string>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: NovelStore,
  ) {
    context.subscriptions.push(
      this.store.onDidChange(() => {
        void this.pushShelf();
      }),
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.webviewReady = false;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    };
    view.webview.html = getWebviewHtml(view.webview, this.context.extensionUri);

    view.webview.onDidReceiveMessage(
      (message: WebviewMessage) => void this.handleMessage(message),
      undefined,
      this.context.subscriptions,
    );

    view.onDidDispose(() => {
      this.view = undefined;
      this.webviewReady = false;
    }, undefined, this.context.subscriptions);
  }

  /** 聚焦底部面板的阅读器视图，必要时会创建它。 */
  async reveal(): Promise<void> {
    await vscode.commands.executeCommand(`${NovelReaderViewProvider.viewType}.focus`);
  }

  /** 让 Webview 重新拉取书架。 */
  async refresh(): Promise<void> {
    await this.pushShelf();
  }

  /** 打开指定小说；视图还没建好时会记下来，等 Webview ready 后再执行。 */
  async openNovel(novelId: string): Promise<void> {
    if (!this.view || !this.webviewReady) {
      this.pendingOpenId = novelId;
      await this.pushShelf();
      return;
    }
    await this.sendNovel(novelId);
  }

  // ---------------------------------------------------------------- 消息处理

  private async handleMessage(message: WebviewMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
          this.webviewReady = true;
          this.pushReaderConfig();
          await this.pushShelf();
          if (this.pendingOpenId) {
            const id = this.pendingOpenId;
            this.pendingOpenId = null;
            await this.sendNovel(id);
          }
          break;

        case 'importNovel': {
          const record = await importNovel(this.store);
          if (record) {
            await this.sendNovel(record.id);
          }
          break;
        }

        case 'openNovel':
          this.pendingOpenId = null;
          await this.sendNovel(message.novelId);
          break;

        case 'closeNovel':
          this.pendingOpenId = null;
          await this.pushShelf();
          break;

        case 'revealStoredFile': {
          const record = this.store.get(message.novelId);
          if (record) {
            await vscode.commands.executeCommand(
              'revealFileInOS',
              this.store.storedFileUri(record),
            );
          }
          break;
        }

        case 'removeNovel': {
          const record = this.store.get(message.novelId);
          if (!record) {
            break;
          }
          const confirmed = await vscode.window.showWarningMessage(
            `确定要把《${record.title}》移出书架吗？（不会删除原文件）`,
            { modal: true },
            '移出书架',
          );
          if (confirmed === '移出书架') {
            this.textCache.delete(record.id);
            await this.store.remove(record.id);
          }
          break;
        }

        case 'requestChapter':
          await this.sendChapter(message.novelId, message.chapterIndex);
          break;

        case 'saveProgress': {
          const config = vscode.workspace.getConfiguration('novelRead.reader');
          if (!config.get<boolean>('autoSaveProgress', true)) {
            break;
          }
          const record = this.store.get(message.novelId);
          if (!record) {
            break;
          }
          const chapterIndex = clampIndex(
            message.progress.chapterIndex,
            record.chapters.length,
          );
          const finished =
            chapterIndex >= record.chapters.length - 1 && message.progress.scrollRatio >= 0.98;
          // 静默写入：这是滚动时的高频调用，不该触发书架重渲染
          await this.store.saveProgress(record.id, { ...message.progress, chapterIndex }, finished);
          break;
        }

        case 'updateSettings': {
          const record = this.store.get(message.novelId);
          if (!record) {
            break;
          }
          const settings: ReaderSettings = { ...record.settings, ...message.settings };
          const updated = await this.store.update(record.id, { settings });
          if (updated) {
            this.post({ type: 'settings', settings: updated.settings });
          }
          break;
        }

        default: {
          const never: never = message;
          logger.warn(`收到未知消息：${JSON.stringify(never)}`);
        }
      }
    } catch (error) {
      logger.error(`处理消息 ${message.type} 失败`, error);
      this.post({
        type: 'toast',
        level: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ---------------------------------------------------------------- 推送

  /** 把阅读器运行时配置（是否记录进度、上报防抖间隔）下发给 Webview。 */
  private pushReaderConfig(): void {
    const config = vscode.workspace.getConfiguration('novelRead.reader');
    this.post({
      type: 'readerConfig',
      autoSaveProgress: config.get<boolean>('autoSaveProgress', true),
      progressDelay: config.get<number>('progressSaveDelay', 800),
    });
  }

  private async pushShelf(): Promise<void> {
    if (!this.view || !this.webviewReady) {
      return;
    }
    this.post({
      type: 'shelf',
      novels: this.store.list().map(toSummary),
    });
  }

  private async sendNovel(novelId: string): Promise<void> {
    const record = this.store.get(novelId);
    if (!record) {
      this.post({ type: 'toast', level: 'warn', message: '这本书已经不在书架上了。' });
      await this.pushShelf();
      return;
    }

    const chapterIndex = clampIndex(record.progress.chapterIndex, record.chapters.length);
    try {
      const chapter = await this.buildChapterPayload(record, chapterIndex, record.progress.scrollRatio);
      this.post({
        type: 'novelOpened',
        novel: toSummary(record),
        settings: record.settings,
        chapter,
        chapters: record.chapters.map((item) => item.title),
      });
    } catch (error) {
      logger.error('打开小说失败', error);
      this.post({
        type: 'toast',
        level: 'error',
        message: `打开失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async sendChapter(novelId: string, chapterIndex: number): Promise<void> {
    const record = this.store.get(novelId);
    if (!record) {
      return;
    }
    const index = clampIndex(chapterIndex, record.chapters.length);
    try {
      // 切章时把新章节的起始位置写回进度，避免用户直接关掉面板导致记录丢失。
      const chapter = await this.buildChapterPayload(record, index, 0);
      this.post({ type: 'chapter', chapter });
      await this.store.saveProgress(
        record.id,
        { chapterIndex: index, scrollRatio: 0 },
        index >= record.chapters.length - 1 && record.finished,
      );
    } catch (error) {
      logger.error('加载章节失败', error);
      this.post({
        type: 'toast',
        level: 'error',
        message: `加载章节失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async buildChapterPayload(
    record: NovelRecord,
    chapterIndex: number,
    scrollRatio: number,
  ): Promise<ChapterPayload> {
    const text = await this.getFullText(record);
    const chapter = record.chapters[chapterIndex];
    return {
      novelId: record.id,
      chapterIndex,
      title: chapter.title,
      content: getChapterContent(text, chapter),
      totalChapters: record.chapters.length,
      scrollRatio,
    };
  }

  /** 读取并解码整本小说，按最近使用缓存。 */
  private async getFullText(record: NovelRecord): Promise<string> {
    const cached = this.textCache.get(record.id);
    if (cached !== undefined) {
      // 重新插入以刷新 LRU 顺序
      this.textCache.delete(record.id);
      this.textCache.set(record.id, cached);
      return cached;
    }

    let bytes: Uint8Array;
    try {
      // 只读全局存储目录里的副本，原文件在不在都无所谓。
      bytes = await vscode.workspace.fs.readFile(this.store.storedFileUri(record));
    } catch {
      throw new Error('这本书的存储副本丢失了，请重新导入。');
    }

    const { text, encoding } = decodeBuffer(bytes, record.encoding);
    if (encoding !== record.encoding) {
      logger.warn(`《${record.title}》编码由 ${record.encoding} 变为 ${encoding}`);
      await this.store.update(record.id, { encoding }, { silent: true });
    }

    while (this.textCache.size >= TEXT_CACHE_SIZE) {
      const oldest = this.textCache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.textCache.delete(oldest);
    }
    this.textCache.set(record.id, text);
    return text;
  }

  private post(message: HostMessage): void {
    void this.view?.webview.postMessage(message);
  }
}

function clampIndex(index: number, total: number): number {
  if (!Number.isInteger(index) || index < 0) {
    return 0;
  }
  return Math.min(index, Math.max(total - 1, 0));
}

/** NovelRecord → 发给 Webview 的精简结构（去掉章节表等大字段）。 */
export function toSummary(record: NovelRecord): NovelSummary {
  const total = record.chapters.length;
  const chapterIndex = clampIndex(record.progress.chapterIndex, total);
  const percent = total === 0 ? 0 : (chapterIndex + record.progress.scrollRatio) / total;
  return {
    id: record.id,
    title: record.title,
    author: record.author,
    sourcePath: record.sourcePath,
    totalChapters: total,
    chapterIndex,
    chapterTitle: record.chapters[chapterIndex]?.title ?? '',
    percent: Math.min(Math.max(percent, 0), 1),
    createdAt: record.createdAt,
    lastReadAt: record.lastReadAt,
    finished: record.finished,
  };
}
