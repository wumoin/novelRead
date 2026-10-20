/** 阅读主题。auto 表示跟随 VS Code 当前配色。 */
export type ReaderTheme = 'auto' | 'light' | 'sepia' | 'dark';

/** 章节元信息。正文不常驻内存，按偏移量从全文切片。 */
export interface ChapterMeta {
  /** 章节序号，从 0 开始。 */
  index: number;
  /** 章节标题，例如「第三章 风起」。 */
  title: string;
  /** 标题行在全文中的起始偏移。 */
  start: number;
  /** 正文起始偏移（标题行之后）。 */
  contentStart: number;
  /** 章节结束偏移（不含）。 */
  end: number;
}

/** 阅读进度。 */
export interface ReadingProgress {
  /** 当前章节下标。 */
  chapterIndex: number;
  /** 章节内的滚动比例，0~1。 */
  scrollRatio: number;
  /** 章节内字符偏移，用于比滚动比例更精确的定位（可选）。 */
  charOffset?: number;
}

/** 单本书的阅读偏好，与其它书互不影响。 */
export interface ReaderSettings {
  /** 正文字号（px）。 */
  fontSize: number;
  /** 行高倍数。 */
  lineHeight: number;
  /** 正文字体族，留空表示跟随编辑器字体。 */
  fontFamily: string;
  /** 阅读主题。 */
  theme: ReaderTheme;
  /** 正文最大宽度（px）。 */
  maxWidth: number;
}

/**
 * 每导入一本小说生成一条配置记录。
 * 这是书架持久化的核心单元，同时承载「书本身」和「读到哪儿」两类信息。
 */
export interface NovelRecord {
  /** 记录 ID，导入时生成的 uuid。 */
  id: string;
  /** 书名，默认取文件名（去掉扩展名）。 */
  title: string;
  /** 作者，目前从文件名中的 `作者：xxx` 猜测，可能为空。 */
  author?: string;
  /**
   * 导入时原始文件的绝对路径。仅作记录/展示用 —— 原文件之后可能被移动或删除，
   * 阅读时一律走 `storedFile` 指向的副本。
   */
  sourcePath: string;
  /**
   * 副本文件名（相对 `<globalStorage>/novels/`）。
   * 导入时把原文件字节原样复制过去，之后所有读取都只认这个副本。
   */
  storedFile: string;
  /** 文件大小（字节）。 */
  fileSize: number;
  /** 探测到的文件编码。 */
  encoding: string;
  /** 章节索引表。 */
  chapters: ChapterMeta[];
  /** 建档时间。 */
  createdAt: number;
  /** 记录最后修改时间。 */
  updatedAt: number;
  /** 上次阅读时间，为 0 表示从未打开。 */
  lastReadAt: number;
  /** 阅读进度。 */
  progress: ReadingProgress;
  /** 本书的阅读偏好。 */
  settings: ReaderSettings;
  /** 是否已读完。 */
  finished: boolean;
}

/** 发送给 Webview 的书架条目（去掉章节表等大字段）。 */
export interface NovelSummary {
  id: string;
  title: string;
  author?: string;
  sourcePath: string;
  totalChapters: number;
  chapterIndex: number;
  chapterTitle: string;
  /** 总进度 0~1。 */
  percent: number;
  createdAt: number;
  lastReadAt: number;
  finished: boolean;
}

/** 书架的持久化格式。 */
export interface ShelfFile {
  version: number;
  novels: NovelRecord[];
}
