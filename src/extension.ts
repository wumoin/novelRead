import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { logger } from './logger';
import { NovelReaderViewProvider } from './reader/NovelReaderViewProvider';
import { NovelStore } from './storage/NovelStore';

let store: NovelStore | undefined;

export function activate(context: vscode.ExtensionContext): void {
  logger.init(context);
  logger.info('novelRead 正在激活…');

  const novelStore = new NovelStore(context);
  store = novelStore;
  const provider = new NovelReaderViewProvider(context, novelStore);

  context.subscriptions.push(
    novelStore,
    vscode.window.registerWebviewViewProvider(NovelReaderViewProvider.viewType, provider, {
      // 底部面板经常被折叠/切走，保留上下文免得每次展开都重新渲染。
      webviewOptions: { retainContextWhenHidden: true },
    }),
    ...registerCommands(novelStore, provider),
  );

  void novelStore
    .initialize()
    .then(() => {
      if (novelStore.droppedRecords > 0) {
        void vscode.window.showWarningMessage(
          `novelRead：有 ${novelStore.droppedRecords} 条书架记录来自旧版本（没有存储副本），` +
            '已从书架移除，请重新导入对应的小说。',
        );
      }
      return provider.refresh();
    })
    .then(() => logger.info(`novelRead 已就绪，书架共 ${novelStore.list().length} 本`))
    .then(undefined, (error: unknown) => logger.error('激活过程中出错', error));
}

export function deactivate(): Thenable<void> | undefined {
  // 把还在防抖窗口里的阅读进度补写一次
  return store?.flush();
}
