import * as vscode from 'vscode';
import { renderWebviewHtml } from './webviewTemplate';

const NONCE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function createNonce(): string {
  let out = '';
  for (let i = 0; i < 32; i += 1) {
    out += NONCE_CHARS.charAt(Math.floor(Math.random() * NONCE_CHARS.length));
  }
  return out;
}

/** 把 media/ 下的资源解析成 Webview 可访问的 URI，并渲染出完整 HTML。 */
export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'reader.css'),
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'reader.js'),
  );
  const nonce = createNonce();

  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return renderWebviewHtml({
    csp,
    styleUri: styleUri.toString(),
    scriptUri: scriptUri.toString(),
    nonce,
  });
}
