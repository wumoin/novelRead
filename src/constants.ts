/** 扩展的唯一标识，与 package.json 的 publisher.name 保持一致。 */
export const EXTENSION_ID = 'wumoin.novelread';

/** 底部面板容器 ID，对应 package.json 的 viewsContainers.panel[].id。 */
export const VIEW_CONTAINER_ID = 'novelRead';

/** 阅读器 Webview 视图 ID。 */
export const READER_VIEW_ID = 'novelRead.readerView';

/** 书架数据文件的格式版本，用于将来做迁移。 */
export const STORAGE_VERSION = 1;

/** 书架数据文件名（存放在扩展的 globalStorage 目录下）。 */
export const STORAGE_FILE = 'novels.json';

/**
 * 小说副本目录（相对 globalStorage）。
 * 导入时把原文件复制到这里，之后阅读只读副本，删掉原文件不影响书架。
 */
export const NOVELS_DIR = 'novels';

/** 阅读器同时缓存的正文数量，避免频繁重读大文件。 */
export const TEXT_CACHE_SIZE = 2;

/** 所有对外暴露的命令 ID。 */
export const Commands = {
  importNovel: 'novelRead.importNovel',
  openReader: 'novelRead.openReader',
  refreshShelf: 'novelRead.refreshShelf',
} as const;

export type CommandId = (typeof Commands)[keyof typeof Commands];
