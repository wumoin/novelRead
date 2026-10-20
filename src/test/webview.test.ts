import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { JSDOM } from 'jsdom';
import { renderWebviewHtml } from '../reader/webviewTemplate';

const MEDIA_DIR = path.join(__dirname, '..', '..', 'media');

function readCss(): string {
  return fs.readFileSync(path.join(MEDIA_DIR, 'reader.css'), 'utf8');
}

function renderTestHtml(): string {
  const css = readCss();
  return renderWebviewHtml({
    csp: "default-src 'none'",
    styleUri: 'reader.css',
    scriptUri: 'reader.js',
    nonce: 'test-nonce',
  }).replace(/<link rel="stylesheet"[^>]*>/, `<style>${css}</style>`);
}

function buildDom(): JSDOM {
  return new JSDOM(renderTestHtml(), { pretendToBeVisual: true });
}

/**
 * 收集模板里所有带 hidden 属性的元素的 class。
 * 这些元素一旦有 display 规则，就会和 hidden 打架。
 */
function hiddenBearingClasses(html: string): Set<string> {
  const classes = new Set<string>();
  for (const match of html.matchAll(/<\w+([^>]*\bhidden\b[^>]*)>/g)) {
    const classAttr = (match[1].match(/class="([^"]+)"/) ?? [])[1] ?? '';
    for (const name of classAttr.split(/\s+/)) {
      if (name) {
        classes.add(name);
      }
    }
  }
  // #shelf-view 不带 hidden 属性，但 reader.js 会动态设置它
  classes.add('shelf');
  return classes;
}

/** 找出 CSS 里给这些 class 设置了 display 的规则。 */
function classesWithDisplayRules(css: string, classes: Set<string>): string[] {
  const found: string[] = [];
  for (const match of css.matchAll(/\.([a-z0-9-]+)\s*\{([^}]*)\}/gi)) {
    if (classes.has(match[1]) && /(^|;|\s)display\s*:/.test(match[2])) {
      found.push(match[1]);
    }
  }
  return found;
}

interface ReaderHarness {
  dom: JSDOM;
  /** Webview 通过 postMessage 发给扩展的消息。 */
  posted: Array<Record<string, unknown>>;
  /** 模拟扩展下发消息。 */
  send(message: unknown): void;
  el(id: string): HTMLElement;
}

/**
 * 在 jsdom 里真实加载 media/reader.js，并桩掉 acquireVsCodeApi。
 * 这样可以像用户一样点击按钮、断言视图切换，而不只是静态检查。
 */
function loadReader(): ReaderHarness {
  const dom = new JSDOM(renderTestHtml(), { runScripts: 'outside-only', pretendToBeVisual: true });
  const posted: Array<Record<string, unknown>> = [];

  (dom.window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
    postMessage: (message: Record<string, unknown>) => {
      posted.push(message);
    },
  });

  dom.window.eval(fs.readFileSync(path.join(MEDIA_DIR, 'reader.js'), 'utf8'));

  return {
    dom,
    posted,
    send(message: unknown) {
      dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: message }));
    },
    el(id: string) {
      const element = dom.window.document.getElementById(id);
      assert.ok(element, `找不到 #${id}`);
      return element as HTMLElement;
    },
  };
}

const NOVEL = {
  id: 'novel-1',
  title: '示例小说',
  sourcePath: 'D:/novels/示例小说.txt',
  totalChapters: 3,
  chapterIndex: 0,
  chapterTitle: '第一章',
  percent: 0,
  createdAt: 1,
  lastReadAt: 1,
  finished: false,
};

const SETTINGS = {
  fontSize: 16,
  lineHeight: 1.8,
  fontFamily: '',
  theme: 'auto',
  maxWidth: 760,
};

const CHAPTER_TITLES = ['第一章 起风了', '第二章 来客', '第三章 旧书'];

/** 走一遍「扩展下发配置 → 书架 → 打开小说」的握手流程。 */
function openNovel(harness: ReaderHarness, chapterIndex = 0): void {
  harness.send({ type: 'readerConfig', autoSaveProgress: true, progressDelay: 800 });
  harness.send({ type: 'shelf', novels: [NOVEL] });
  harness.send({
    type: 'novelOpened',
    novel: NOVEL,
    settings: SETTINGS,
    chapters: CHAPTER_TITLES,
    chapter: {
      novelId: NOVEL.id,
      chapterIndex,
      title: CHAPTER_TITLES[chapterIndex],
      content: '正文第一段\n正文第二段',
      totalChapters: CHAPTER_TITLES.length,
      scrollRatio: 0,
    },
  });
}

suite('阅读器交互', () => {
  test('打开小说后切到阅读视图', () => {
    const harness = loadReader();
    openNovel(harness);

    assert.strictEqual(harness.el('reader-view').hidden, false, '阅读视图应显示');
    assert.strictEqual(harness.el('shelf-view').hidden, true, '书架视图应隐藏');
    assert.strictEqual(harness.el('chapter-title').textContent, CHAPTER_TITLES[0]);
  });

  test('点击「返回书架」能真的切回书架', () => {
    const harness = loadReader();
    openNovel(harness);

    harness.el('btn-shelf').click();

    assert.ok(
      harness.posted.some((message) => message.type === 'closeNovel'),
      '应该向扩展发送 closeNovel',
    );
    assert.strictEqual(harness.el('shelf-view').hidden, false, '书架视图应显示');
    assert.strictEqual(harness.el('reader-view').hidden, true, '阅读视图应隐藏');
  });

  test('当前小说被移出书架后退回书架视图', () => {
    const harness = loadReader();
    openNovel(harness);
    assert.strictEqual(harness.el('reader-view').hidden, false);

    harness.send({ type: 'shelf', novels: [] });

    assert.strictEqual(harness.el('shelf-view').hidden, false);
    assert.strictEqual(harness.el('reader-view').hidden, true);
  });

  test('点击「目录」列出全部章节', () => {
    const harness = loadReader();
    openNovel(harness);

    harness.el('btn-toc').click();

    assert.strictEqual(harness.el('toc-overlay').hidden, false, '目录浮层应展开');
    const items = harness.dom.window.document.querySelectorAll('#toc-list .toc-item');
    assert.strictEqual(items.length, CHAPTER_TITLES.length);
    assert.strictEqual(items[0].textContent, `1. ${CHAPTER_TITLES[0]}`);
  });

  test('重复打开目录复用已渲染的节点，不重建', () => {
    const harness = loadReader();
    openNovel(harness);

    harness.el('btn-toc').click();
    const first = harness.dom.window.document.querySelector('#toc-list .toc-item');

    harness.el('btn-toc-close').click();
    harness.el('btn-toc').click();

    assert.strictEqual(
      harness.dom.window.document.querySelector('#toc-list .toc-item'),
      first,
      '同样的书 + 同样的筛选词不应重建 DOM',
    );
  });

  test('点击目录里的章节会请求对应章节', () => {
    const harness = loadReader();
    openNovel(harness);

    harness.el('btn-toc').click();
    const items = harness.dom.window.document.querySelectorAll('#toc-list .toc-item');
    (items[2] as HTMLElement).click();

    assert.ok(
      harness.posted.some(
        (message) => message.type === 'requestChapter' && message.chapterIndex === 2,
      ),
      '应该请求第 3 章',
    );
    assert.strictEqual(harness.el('toc-overlay').hidden, true, '跳转后目录应关闭');
  });

  test('目录筛选支持按标题过滤', () => {
    const harness = loadReader();
    openNovel(harness);
    harness.el('btn-toc').click();

    const filter = harness.el('toc-filter') as HTMLInputElement;
    filter.value = '来客';
    filter.dispatchEvent(new harness.dom.window.Event('input'));

    // 输入有 120ms 防抖，这里直接驱动渲染
    harness.dom.window.eval('void 0');
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const items = harness.dom.window.document.querySelectorAll('#toc-list .toc-item');
        assert.strictEqual(items.length, 1, '应只剩匹配「来客」的一章');
        assert.strictEqual(items[0].textContent, `2. ${CHAPTER_TITLES[1]}`);
        resolve();
      }, 250);
    });
  });
});

suite('Webview 布局回归', () => {
  /*
   * 这个测试盯的是一个真实踩过的坑：hidden 属性靠 UA 样式表的
   * `[hidden] { display: none }` 生效，而作者样式表优先级高于 UA 样式表。
   * 只要有人给带 hidden 的元素写上 display:flex 又不兜底，hidden 就会静默失效 ——
   * 表现为目录浮层永久盖住正文、书架和阅读视图同时并排显示。
   *
   * 注意：jsdom 的层叠实现和真实浏览器不一致（它让 UA 的 [hidden] 赢了作者样式），
   * 所以这里**不能**靠 getComputedStyle 验证，只能静态检查规则本身。
   */
  test('带 hidden 的元素必须存在 [hidden] 兜底规则', () => {
    const css = readCss();
    const html = renderTestHtml();

    const atRisk = classesWithDisplayRules(css, hiddenBearingClasses(html));
    assert.ok(
      atRisk.length > 0,
      '预期至少有一个带 hidden 的元素设置了 display —— 没有的话这个测试就失去意义了，请检查选择器解析',
    );

    assert.match(
      css,
      /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/,
      `这些类设置了 display 且元素带 hidden：${atRisk.join(', ')}。` +
        '必须在 reader.css 里保留 `[hidden] { display: none !important; }` 兜底，' +
        '否则作者样式会压掉 UA 的 [hidden] 规则，元素根本藏不住。',
    );
  });

  test('兜底规则没有被别的 !important 反压', () => {
    const css = readCss();
    const importantDisplays = [...css.matchAll(/([^{}]+)\{([^}]*display\s*:[^;}]*!important[^}]*)\}/g)]
      .map((match) => match[1].trim())
      .filter((selector) => !selector.includes('[hidden]'));

    assert.deepStrictEqual(
      importantDisplays,
      [],
      '出现了别的 display:...!important 规则，它可能压过 [hidden] 兜底规则',
    );
  });

  test('目录浮层展开时盖在正文之上', () => {
    const dom = buildDom();
    const overlay = dom.window.document.getElementById('toc-overlay') as HTMLElement;
    assert.ok(overlay);

    overlay.hidden = false;
    const style = dom.window.getComputedStyle(overlay);
    assert.strictEqual(style.position, 'absolute', '目录浮层需要绝对定位才能覆盖正文');
    assert.ok(Number(style.zIndex) > 0, `z-index 应大于 0，实际是 ${style.zIndex}`);
  });

  test('模板结构完整，关键元素都在', () => {
    const dom = buildDom();
    for (const id of [
      'shelf-view',
      'shelf-list',
      'btn-import',
      'reader-view',
      'chapter-title',
      'chapter-body',
      'btn-toc',
      'toc-overlay',
      'toc-filter',
      'toc-list',
      'toc-empty',
      'toast',
    ]) {
      assert.ok(dom.window.document.getElementById(id), `模板缺少 #${id}`);
    }
  });

  test('CSP 与 nonce 被正确注入', () => {
    const html = renderTestHtml();
    assert.ok(html.includes("content=\"default-src 'none'\""));
    assert.ok(html.includes('nonce="test-nonce"'));
    assert.ok(html.includes('src="reader.js"'));
  });
});
