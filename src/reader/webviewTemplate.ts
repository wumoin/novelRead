/** 渲染 Webview HTML 所需的资源地址与安全策略。 */
export interface WebviewAssets {
  /** Content-Security-Policy 字符串。 */
  csp: string;
  /** reader.css 的 webview URI。 */
  styleUri: string;
  /** reader.js 的 webview URI。 */
  scriptUri: string;
  /** 脚本 nonce。 */
  nonce: string;
}

/**
 * 生成阅读器 Webview 的 HTML 外壳。行为在 media/reader.js，样式在 media/reader.css。
 *
 * 这里刻意不 import vscode —— 保持纯函数，普通 Node 环境下就能拿它渲染出真实 DOM
 * 做回归测试（见 src/test/webview.test.ts）。
 */
export function renderWebviewHtml(assets: WebviewAssets): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${assets.csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${assets.styleUri}" />
  <title>小说阅读器</title>
</head>
<body>
  <div class="app">
    <header class="toolbar">
      <button id="btn-shelf" class="tool-btn" type="button" title="返回书架" hidden>← 书架</button>
      <span id="toolbar-title" class="toolbar-title">书架</span>
      <span class="spacer"></span>
      <span id="toolbar-meta" class="meta"></span>
      <span class="spacer"></span>
      <div id="reader-tools" class="reader-tools" hidden>
        <button id="btn-toc" class="tool-btn" type="button" title="章节目录（g）">☰ 目录</button>
        <button id="btn-font-dec" class="tool-btn" type="button" title="减小字号">A－</button>
        <button id="btn-font-inc" class="tool-btn" type="button" title="增大字号">A＋</button>
        <select id="theme-select" class="tool-select" title="阅读主题">
          <option value="auto">跟随主题</option>
          <option value="light">明亮</option>
          <option value="sepia">护眼</option>
          <option value="dark">暗色</option>
        </select>
        <button id="btn-prev" class="tool-btn" type="button" title="上一章（←）">← 上一章</button>
        <button id="btn-next" class="tool-btn" type="button" title="下一章（→）">下一章 →</button>
      </div>
    </header>

    <main class="body">
      <section id="shelf-view" class="shelf">
        <div class="shelf-head">
          <button id="btn-import" class="primary-btn" type="button">＋ 导入小说</button>
          <span id="shelf-count" class="meta"></span>
        </div>
        <ul id="shelf-list" class="shelf-list"></ul>
        <p id="shelf-empty" class="empty">
          书架还是空的。<br />点上面的「导入小说」挑一个 txt 文件吧。
        </p>
      </section>

      <section id="reader-view" class="reader" hidden>
        <h2 id="chapter-title" class="chapter-title"></h2>
        <div id="chapter-body" class="chapter-body" tabindex="0"></div>

        <div id="toc-overlay" class="toc-overlay" hidden>
          <div class="toc-head">
            <input
              id="toc-filter"
              class="toc-filter"
              type="text"
              placeholder="筛选章节标题；输入章节号后回车可直接跳转"
            />
            <span id="toc-count" class="meta"></span>
            <button id="btn-toc-close" class="tool-btn" type="button" title="关闭（Esc）">✕</button>
          </div>
          <ul id="toc-list" class="toc-list"></ul>
          <p id="toc-empty" class="empty" hidden>没有匹配的章节。</p>
        </div>
      </section>
    </main>
  </div>

  <div id="toast" class="toast" hidden></div>

  <script nonce="${assets.nonce}" src="${assets.scriptUri}"></script>
</body>
</html>`;
}
