import type { NovelSummary, ReaderSettings, ReadingProgress } from '../types';

/** 一章的完整载荷。正文按章传输，避免一次性把整本书塞进 Webview。 */
export interface ChapterPayload {
  novelId: string;
  chapterIndex: number;
  title: string;
  content: string;
  totalChapters: number;
  /** 打开该章时要恢复到的滚动位置，0~1。 */
  scrollRatio: number;
}

/** Webview → 扩展。 */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'importNovel' }
  | { type: 'openNovel'; novelId: string }
  | { type: 'closeNovel' }
  | { type: 'removeNovel'; novelId: string }
  | { type: 'revealStoredFile'; novelId: string }
  | { type: 'requestChapter'; novelId: string; chapterIndex: number }
  | { type: 'saveProgress'; novelId: string; progress: ReadingProgress }
  | { type: 'updateSettings'; novelId: string; settings: Partial<ReaderSettings> };

/** 扩展 → Webview。 */
export type HostMessage =
  /** Webview 就绪后下发的阅读器运行时配置。 */
  | { type: 'readerConfig'; autoSaveProgress: boolean; progressDelay: number }
  | { type: 'shelf'; novels: NovelSummary[] }
  | {
      type: 'novelOpened';
      novel: NovelSummary;
      settings: ReaderSettings;
      chapter: ChapterPayload;
      /** 全部章节标题，供目录跳转使用。 */
      chapters: string[];
    }
  | { type: 'chapter'; chapter: ChapterPayload }
  | { type: 'settings'; settings: ReaderSettings }
  | { type: 'toast'; level: 'info' | 'warn' | 'error'; message: string };
