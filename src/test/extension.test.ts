import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { EXTENSION_ID, READER_VIEW_ID } from '../constants';

suite('novelRead 扩展', () => {
  test('扩展可以被解析到', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `找不到扩展 ${EXTENSION_ID}`);
  });

  test('激活后注册了全部命令', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension);
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'novelRead.importNovel',
      'novelRead.openReader',
      'novelRead.refreshShelf',
    ]) {
      assert.ok(commands.includes(command), `命令未注册：${command}`);
    }
  });

  test('阅读器视图 ID 与 package.json 声明一致', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension);
    const views = extension.packageJSON?.contributes?.views?.['novelRead'] ?? [];
    const ids = views.map((view: { id: string }) => view.id);
    assert.ok(ids.includes(READER_VIEW_ID), `views 中缺少 ${READER_VIEW_ID}`);
  });
});
