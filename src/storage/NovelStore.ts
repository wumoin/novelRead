import * as vscode from 'vscode';
import { NOVELS_DIR, STORAGE_FILE, STORAGE_VERSION } from '../constants';
import { logger } from '../logger';
import type { NovelRecord, ReadingProgress, ShelfFile } from '../types';

/** 写入磁盘的防抖间隔（毫秒）。 */
const FLUSH_DELAY = 300;

/**
 * 书架存储：内存里保存所有小说配置记录，变更后防抖落盘到
 * `<globalStorage>/novels.json`。
 *
 * 之所以不用 `globalState`（Memento），是因为章节索引表会让单条记录变得很大，
 * 而 Memento 适合放小而稀疏的数据；独立 JSON 文件也方便用户自己查看/备份。
 */
export class NovelStore implements vscode.Disposable {
  private readonly fileUri: vscode.Uri;
  /** 小说副本所在目录：`<globalStorage>/novels/`。 */
  private readonly novelsDirUri: vscode.Uri;
  private readonly records = new Map<string, NovelRecord>();
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private droppedOnLoad = 0;

  /** 书架内容发生变化时触发。 */
  readonly onDidChange: vscode.Event<void> = this.onDidChangeEmitter.event;

  /** 上次 initialize 时因格式过旧被丢弃的记录条数。 */
  get droppedRecords(): number {
    return this.droppedOnLoad;
  }

  constructor(private readonly context: vscode.ExtensionContext) {
    this.fileUri = vscode.Uri.joinPath(context.globalStorageUri, STORAGE_FILE);
    this.novelsDirUri = vscode.Uri.joinPath(context.globalStorageUri, NOVELS_DIR);
  }

  /** 某个小说副本的完整位置。阅读、定位、删除都走这里。 */
  storedFileUri(record: NovelRecord): vscode.Uri {
    if (!record.storedFile) {
      // 旧格式记录没有副本，直接给出可读的错误而不是让 joinPath 抛异常
      throw new Error('这条记录缺少存储副本，请把小说重新导入一次。');
    }
    return vscode.Uri.joinPath(this.novelsDirUri, record.storedFile);
  }

  /**
   * 把小说原始字节复制进全局存储目录，返回副本文件名。
   * 用记录 id 当文件名，避免重名和中文文件名的编码坑。
   */
  async copyIntoStorage(id: string, bytes: Uint8Array): Promise<string> {
    const storedFile = `${id}.txt`;
    await vscode.workspace.fs.createDirectory(this.novelsDirUri);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(this.novelsDirUri, storedFile),
      bytes,
    );
    return storedFile;
  }

  /** 删掉某个小说的副本文件。副本不存在时静默跳过。 */
  private async deleteStoredFile(record: NovelRecord): Promise<void> {
    if (!record.storedFile) {
      return;
    }
    try {
      await vscode.workspace.fs.delete(this.storedFileUri(record));
    } catch {
      logger.warn(`副本文件不存在或删除失败：${record.storedFile}`);
    }
  }

  /** 从磁盘载入书架。重复调用是安全的。 */
  async initialize(): Promise<void> {
    this.records.clear();
    this.droppedOnLoad = 0;
    try {
      const bytes = await vscode.workspace.fs.readFile(this.fileUri);
      const raw = new TextDecoder('utf-8').decode(bytes);
      const parsed = JSON.parse(raw) as Partial<ShelfFile>;
      for (const novel of parsed.novels ?? []) {
        if (!novel || typeof novel.id !== 'string') {
          continue;
        }
        // 早期版本直接引用原文件、没有 storedFile，这类记录读不出正文，只能丢弃。
        if (typeof novel.storedFile !== 'string' || !novel.storedFile) {
          this.droppedOnLoad += 1;
          continue;
        }
        this.records.set(novel.id, novel);
      }
      if (this.droppedOnLoad > 0) {
        logger.warn(`丢弃了 ${this.droppedOnLoad} 条旧格式记录（缺少存储副本），需要重新导入`);
      }
      logger.info(`已载入书架：${this.records.size} 本`);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'FileNotFound' || error instanceof SyntaxError) {
        logger.info('未找到书架文件，按空书架启动');
      } else {
        logger.error('载入书架失败，按空书架启动', error);
      }
    }
  }

  /** 所有小说，按「最近阅读」倒序；从未读过的排在后面。 */
  list(): NovelRecord[] {
    return [...this.records.values()].sort((a, b) => {
      const left = a.lastReadAt || a.createdAt;
      const right = b.lastReadAt || b.createdAt;
      return right - left;
    });
  }

  get(id: string): NovelRecord | undefined {
    return this.records.get(id);
  }

  has(id: string): boolean {
    return this.records.has(id);
  }

  /** 新增一条小说配置记录。 */
  async add(record: NovelRecord): Promise<void> {
    this.records.set(record.id, record);
    this.markDirty();
    this.onDidChangeEmitter.fire();
    await this.flush();
  }

  /**
   * 就地合并更新一条记录。返回更新后的记录。
   *
   * 注意这里**不**主动 flush：滚动时每停一次就会调一次，直接落盘意味着反复重写
   * 整个书架文件（几 MB）。交给 markDirty 的防抖即可。
   *
   * `silent` 用于进度这类高频但不需要刷新书架的更新 —— 不发 onDidChange，
   * 免得 Webview 每滚动一次就重建整个书架 DOM。
   */
  async update(
    id: string,
    patch: Partial<NovelRecord>,
    options: { silent?: boolean } = {},
  ): Promise<NovelRecord | undefined> {
    const current = this.records.get(id);
    if (!current) {
      logger.warn(`更新失败，找不到记录：${id}`);
      return undefined;
    }
    const next: NovelRecord = { ...current, ...patch, id: current.id, updatedAt: Date.now() };
    this.records.set(id, next);
    this.markDirty();
    if (!options.silent) {
      this.onDidChangeEmitter.fire();
    }
    return next;
  }

  /** 更新阅读进度，并顺带刷新「最近阅读时间」。高频调用，静默处理。 */
  async saveProgress(
    id: string,
    progress: ReadingProgress,
    finished?: boolean,
  ): Promise<void> {
    await this.update(
      id,
      {
        progress,
        lastReadAt: Date.now(),
        ...(finished === undefined ? {} : { finished }),
      },
      { silent: true },
    );
  }

  /** 删除一条记录，连同它在全局存储目录里的副本。 */
  async remove(id: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record || !this.records.delete(id)) {
      return false;
    }
    await this.deleteStoredFile(record);
    this.markDirty();
    this.onDidChangeEmitter.fire();
    await this.flush();
    return true;
  }

  /** 立即落盘，取消待执行的防抖写入。 */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (!this.dirty) {
      return;
    }
    this.dirty = false;
    const payload: ShelfFile = {
      version: STORAGE_VERSION,
      novels: [...this.records.values()],
    };
    try {
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
      // 紧凑输出：书架里存着每本书的完整章节索引，美化缩进会让文件大 40% 以上
      const data = new TextEncoder().encode(JSON.stringify(payload));
      await vscode.workspace.fs.writeFile(this.fileUri, data);
    } catch (error) {
      this.dirty = true;
      logger.error('写入书架文件失败', error);
    }
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.onDidChangeEmitter.dispose();
    // 把还在防抖窗口里的改动补写一次，尽量不丢进度
    void this.flush();
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, FLUSH_DELAY);
  }
}
