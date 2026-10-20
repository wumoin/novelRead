import * as vscode from 'vscode';
import { Commands } from '../constants';
import { importNovel } from '../importer/novelImporter';
import type { NovelReaderViewProvider } from '../reader/NovelReaderViewProvider';
import type { NovelStore } from '../storage/NovelStore';

/** 注册扩展对外暴露的全部命令。 */
export function registerCommands(
  store: NovelStore,
  provider: NovelReaderViewProvider,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(Commands.openReader, async () => {
      await provider.reveal();
    }),

    vscode.commands.registerCommand(Commands.importNovel, async () => {
      await provider.reveal();
      const record = await importNovel(store);
      if (record) {
        await provider.openNovel(record.id);
      }
    }),

    vscode.commands.registerCommand(Commands.refreshShelf, async () => {
      await store.initialize();
      await provider.refresh();
    }),
  ];
}
