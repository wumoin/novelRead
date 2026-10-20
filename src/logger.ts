import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

/** 写入「输出」面板的简单日志器。activate 之前调用是安全的（会静默丢弃）。 */
export const logger = {
  init(context: vscode.ExtensionContext): void {
    if (channel) {
      return;
    }
    channel = vscode.window.createOutputChannel('novelRead');
    context.subscriptions.push(channel);
  },

  info(message: string): void {
    channel?.appendLine(`[INFO ] ${message}`);
  },

  warn(message: string): void {
    channel?.appendLine(`[WARN ] ${message}`);
  },

  error(message: string, error?: unknown): void {
    let detail = '';
    if (error instanceof Error) {
      detail = `\n${error.stack ?? error.message}`;
    } else if (error !== undefined) {
      detail = `\n${String(error)}`;
    }
    channel?.appendLine(`[ERROR] ${message}${detail}`);
  },

  show(): void {
    channel?.show(true);
  },
};
