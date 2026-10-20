// novelRead 阅读器 Webview 前端。只负责渲染与交互，所有数据都来自扩展侧。
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  const el = {
    btnShelf: document.getElementById('btn-shelf'),
    toolbarTitle: document.getElementById('toolbar-title'),
    toolbarMeta: document.getElementById('toolbar-meta'),
    readerTools: document.getElementById('reader-tools'),
    btnToc: document.getElementById('btn-toc'),
    btnFontDec: document.getElementById('btn-font-dec'),
    btnFontInc: document.getElementById('btn-font-inc'),
    themeSelect: document.getElementById('theme-select'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    shelfView: document.getElementById('shelf-view'),
    shelfList: document.getElementById('shelf-list'),
    shelfCount: document.getElementById('shelf-count'),
    shelfEmpty: document.getElementById('shelf-empty'),
    btnImport: document.getElementById('btn-import'),
    readerView: document.getElementById('reader-view'),
    chapterTitle: document.getElementById('chapter-title'),
    chapterBody: document.getElementById('chapter-body'),
    tocOverlay: document.getElementById('toc-overlay'),
    tocFilter: document.getElementById('toc-filter'),
    tocCount: document.getElementById('toc-count'),
    tocList: document.getElementById('toc-list'),
    tocEmpty: document.getElementById('toc-empty'),
    btnTocClose: document.getElementById('btn-toc-close'),
    toast: document.getElementById('toast'),
  };

  const MIN_FONT_SIZE = 10;
  const MAX_FONT_SIZE = 40;

  const state = {
    novels: [],
    novel: null,
    settings: null,
    chapterIndex: 0,
    totalChapters: 0,
    /** 全部章节标题，打开书时由扩展侧一次性下发。 */
    chapterTitles: [],
    /** 滚动停止后延迟多久上报进度，由扩展侧配置下发。 */
    progressDelay: 800,
    autoSave: true,
    saveTimer: 0,
    toastTimer: 0,
    /** 程序化恢复滚动位置时置位，避免把恢复动作当成用户滚动。 */
    restoringScroll: false,
  };

  /** 目录浮层的状态。 */
  const toc = {
    open: false,
    filter: '',
    renderTimer: 0,
    /** 已渲染内容对应的 `书名::筛选词`。命中就跳过重建，避免每次打开都全量重排。 */
    renderedKey: null,
  };

  function post(message) {
    vscode.postMessage(message);
  }

  // -------------------------------------------------------------- 工具函数

  function formatTime(timestamp) {
    if (!timestamp) {
      return '未读';
    }
    const date = new Date(timestamp);
    const pad = (value) => String(value).padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  }

  function formatPercent(ratio) {
    return `${Math.round(ratio * 100)}%`;
  }

  function showToast(message, level) {
    el.toast.textContent = message;
    el.toast.dataset.level = level || 'info';
    el.toast.hidden = false;
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      el.toast.hidden = true;
    }, 3200);
  }

  // -------------------------------------------------------------- 视图切换

  function showShelf() {
    closeToc();
    state.novel = null;
    state.chapterTitles = [];
    el.shelfView.hidden = false;
    el.readerView.hidden = true;
    el.btnShelf.hidden = true;
    el.readerTools.hidden = true;
    el.toolbarTitle.textContent = '书架';
    el.toolbarMeta.textContent = state.novels.length ? `${state.novels.length} 本` : '';
  }

  function showReader() {
    el.shelfView.hidden = true;
    el.readerView.hidden = false;
    el.btnShelf.hidden = false;
    el.readerTools.hidden = false;
  }

  // -------------------------------------------------------------- 书架渲染

  function renderShelf() {
    el.shelfList.textContent = '';
    el.shelfCount.textContent = state.novels.length ? `共 ${state.novels.length} 本` : '';
    el.shelfEmpty.hidden = state.novels.length > 0;

    const fragment = document.createDocumentFragment();
    for (const novel of state.novels) {
      fragment.appendChild(buildShelfItem(novel));
    }
    el.shelfList.appendChild(fragment);

    if (!state.novel) {
      showShelf();
    }
  }

  function buildShelfItem(novel) {
    const item = document.createElement('li');
    item.className = 'shelf-item';
    item.tabIndex = 0;
    item.title = `导入自：${novel.sourcePath}`;

    const main = document.createElement('div');
    main.className = 'shelf-item-main';

    const title = document.createElement('span');
    title.className = 'shelf-item-title';
    title.textContent = novel.finished ? `✓ ${novel.title}` : novel.title;

    const sub = document.createElement('span');
    sub.className = 'shelf-item-sub';
    sub.textContent =
      `${novel.chapterTitle || '未开始'} · ${novel.chapterIndex + 1}/${novel.totalChapters} 章` +
      ` · ${formatPercent(novel.percent)} · ${formatTime(novel.lastReadAt)}`;

    main.append(title, sub);

    const progress = document.createElement('div');
    progress.className = 'shelf-progress';
    const bar = document.createElement('i');
    bar.style.width = formatPercent(novel.percent);
    progress.appendChild(bar);

    const actions = document.createElement('div');
    actions.className = 'shelf-item-actions';
    const btnReveal = document.createElement('button');
    btnReveal.type = 'button';
    btnReveal.className = 'tool-btn';
    btnReveal.textContent = '定位';
    btnReveal.title = '在文件管理器中显示存储的副本';
    btnReveal.addEventListener('click', (event) => {
      event.stopPropagation();
      post({ type: 'revealStoredFile', novelId: novel.id });
    });

    const btnRemove = document.createElement('button');
    btnRemove.type = 'button';
    btnRemove.className = 'tool-btn';
    btnRemove.textContent = '移除';
    btnRemove.title = '从书架移除（不删除原文件）';
    btnRemove.addEventListener('click', (event) => {
      event.stopPropagation();
      post({ type: 'removeNovel', novelId: novel.id });
    });

    actions.append(btnReveal, btnRemove);

    item.append(main, progress, actions);
    item.addEventListener('click', () => post({ type: 'openNovel', novelId: novel.id }));
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        post({ type: 'openNovel', novelId: novel.id });
      }
    });
    return item;
  }

  // -------------------------------------------------------------- 正文渲染

  function renderChapter(chapter) {
    state.chapterIndex = chapter.chapterIndex;
    state.totalChapters = chapter.totalChapters;

    el.chapterTitle.textContent = chapter.title;
    el.chapterBody.textContent = '';

    const fragment = document.createDocumentFragment();
    for (const line of chapter.content.split(/\r?\n/)) {
      const text = line.trim();
      if (!text) {
        continue;
      }
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      fragment.appendChild(paragraph);
    }
    if (!fragment.childElementCount) {
      const empty = document.createElement('p');
      empty.textContent = '（本章没有正文）';
      empty.style.textIndent = '0';
      empty.style.opacity = '0.6';
      fragment.appendChild(empty);
    }
    el.chapterBody.appendChild(fragment);

    updateReaderMeta();
    restoreScroll(chapter.scrollRatio);
    syncTocCurrent();
  }

  function updateReaderMeta() {
    if (!state.novel) {
      return;
    }
    el.toolbarTitle.textContent = state.novel.title;
    el.toolbarMeta.textContent = `${state.chapterIndex + 1}/${state.totalChapters} 章`;
    el.btnPrev.disabled = state.chapterIndex <= 0;
    el.btnNext.disabled = state.chapterIndex >= state.totalChapters - 1;
  }

  function currentScrollRatio() {
    const max = el.chapterBody.scrollHeight - el.chapterBody.clientHeight;
    if (max <= 0) {
      return 0;
    }
    return Math.min(Math.max(el.chapterBody.scrollTop / max, 0), 1);
  }

  function restoreScroll(ratio) {
    const max = el.chapterBody.scrollHeight - el.chapterBody.clientHeight;
    state.restoringScroll = true;
    el.chapterBody.scrollTop = max > 0 ? ratio * max : 0;
    // 等布局稳定后再解除标记，否则浏览器补发的 scroll 事件会被当成用户滚动。
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        state.restoringScroll = false;
      });
    });
  }

  function applySettings(settings) {
    state.settings = settings;
    el.readerView.dataset.theme = settings.theme;
    el.readerView.style.setProperty('--nr-font-size', `${settings.fontSize}px`);
    el.readerView.style.setProperty('--nr-line-height', String(settings.lineHeight));
    el.readerView.style.setProperty('--nr-max-width', `${settings.maxWidth}px`);
    if (settings.fontFamily) {
      el.readerView.style.setProperty('--nr-font-family', settings.fontFamily);
    } else {
      el.readerView.style.removeProperty('--nr-font-family');
    }
    el.themeSelect.value = settings.theme;
  }

  function patchSettings(patch) {
    if (!state.settings || !state.novel) {
      return;
    }
    applySettings({ ...state.settings, ...patch });
    post({ type: 'updateSettings', novelId: state.novel.id, settings: patch });
  }

  // -------------------------------------------------------------- 进度上报

  function reportProgress(immediate) {
    if (!state.novel || !state.autoSave) {
      return;
    }
    window.clearTimeout(state.saveTimer);
    const send = () => {
      if (!state.novel) {
        return;
      }
      post({
        type: 'saveProgress',
        novelId: state.novel.id,
        progress: { chapterIndex: state.chapterIndex, scrollRatio: currentScrollRatio() },
      });
    };
    if (immediate) {
      send();
    } else {
      state.saveTimer = window.setTimeout(send, state.progressDelay);
    }
  }

  function goToChapter(index) {
    if (!state.novel || index < 0 || index >= state.totalChapters || index === state.chapterIndex) {
      return;
    }
    reportProgress(true);
    post({ type: 'requestChapter', novelId: state.novel.id, chapterIndex: index });
  }

  // -------------------------------------------------------------- 目录跳转

  function renderToc() {
    const titles = state.chapterTitles;
    const keyword = toc.filter.trim().toLowerCase();

    // 同样的书 + 同样的筛选词已经渲染过了就直接复用，
    // 打开目录、切回目录都不必再重建几千个节点。
    const key = `${state.novel ? state.novel.id : ''}::${keyword}`;
    if (toc.renderedKey === key) {
      return;
    }
    toc.renderedKey = key;

    el.tocList.textContent = '';
    const fragment = document.createDocumentFragment();
    let shown = 0;

    for (let index = 0; index < titles.length; index += 1) {
      const title = titles[index];
      if (keyword && !title.toLowerCase().includes(keyword)) {
        continue;
      }
      const item = document.createElement('li');
      item.className = 'toc-item';
      item.dataset.index = String(index);
      item.title = title;
      item.textContent = `${index + 1}. ${title}`;
      if (index === state.chapterIndex) {
        item.classList.add('is-current');
      }
      item.addEventListener('click', () => {
        closeToc();
        goToChapter(index);
      });
      fragment.appendChild(item);
      shown += 1;
    }

    el.tocList.appendChild(fragment);
    el.tocEmpty.hidden = shown > 0;
    el.tocCount.textContent = keyword
      ? `${shown}/${titles.length} 章`
      : `共 ${titles.length} 章`;
  }

  function scheduleRenderToc() {
    window.clearTimeout(toc.renderTimer);
    toc.renderTimer = window.setTimeout(renderToc, 120);
  }

  /** 章节切换后只挪高亮，不重建整个列表（大长篇有几千条）。 */
  function syncTocCurrent() {
    if (!toc.open) {
      return;
    }
    const previous = el.tocList.querySelector('.toc-item.is-current');
    if (previous) {
      previous.classList.remove('is-current');
    }
    const next = el.tocList.querySelector(`.toc-item[data-index="${state.chapterIndex}"]`);
    if (next) {
      next.classList.add('is-current');
      // 用 scrollTop 而不是 scrollIntoView：后者会连带滚动所有可滚动祖先，
      // 在 VS Code 面板里容易把整个视图带跑。
      const max = el.tocList.scrollHeight - el.tocList.clientHeight;
      el.tocList.scrollTop = Math.max(0, Math.min(next.offsetTop - el.tocList.clientHeight / 3, max));
    }
  }

  function openToc() {
    if (!state.novel) {
      return;
    }
    toc.open = true;
    toc.filter = '';
    el.tocFilter.value = '';
    el.tocOverlay.hidden = false;
    renderToc();
    el.tocFilter.focus();
    syncTocCurrent();
  }

  function closeToc() {
    if (!toc.open) {
      return;
    }
    toc.open = false;
    el.tocOverlay.hidden = true;
    el.chapterBody.focus();
  }

  /** 目录输入框回车：纯数字当章节号跳转，否则跳到筛选结果的第一条。 */
  function submitTocFilter() {
    const value = el.tocFilter.value.trim();
    if (/^\d+$/.test(value)) {
      const index = Number(value) - 1;
      if (index >= 0 && index < state.chapterTitles.length) {
        closeToc();
        goToChapter(index);
      } else {
        showToast(`没有第 ${value} 章`, 'warn');
      }
      return;
    }
    const first = el.tocList.querySelector('.toc-item');
    if (first) {
      closeToc();
      goToChapter(Number(first.dataset.index));
    } else {
      showToast('没有匹配的章节', 'warn');
    }
  }

  // -------------------------------------------------------------- 事件绑定

  el.btnImport.addEventListener('click', () => post({ type: 'importNovel' }));
  el.btnShelf.addEventListener('click', () => {
    // 先落一次进度 —— showShelf 会把 state.novel 清掉
    reportProgress(true);
    showShelf();
    post({ type: 'closeNovel' });
  });
  el.btnPrev.addEventListener('click', () => goToChapter(state.chapterIndex - 1));
  el.btnNext.addEventListener('click', () => goToChapter(state.chapterIndex + 1));
  el.btnFontDec.addEventListener('click', () => {
    if (state.settings) {
      patchSettings({
        fontSize: Math.max(state.settings.fontSize - 1, MIN_FONT_SIZE),
      });
    }
  });
  el.btnFontInc.addEventListener('click', () => {
    if (state.settings) {
      patchSettings({
        fontSize: Math.min(state.settings.fontSize + 1, MAX_FONT_SIZE),
      });
    }
  });
  el.themeSelect.addEventListener('change', () => patchSettings({ theme: el.themeSelect.value }));

  el.btnToc.addEventListener('click', openToc);
  el.btnTocClose.addEventListener('click', closeToc);
  el.tocFilter.addEventListener('input', () => {
    toc.filter = el.tocFilter.value;
    scheduleRenderToc();
  });
  el.tocFilter.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitTocFilter();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeToc();
    }
  });

  el.chapterBody.addEventListener('scroll', () => {
    if (state.restoringScroll) {
      return;
    }
    reportProgress(false);
  });

  document.addEventListener('keydown', (event) => {
    // 目录输入框有自己的按键处理，别在这里抢
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) {
      return;
    }
    if (el.readerView.hidden) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      goToChapter(state.chapterIndex - 1);
    } else if (event.key === 'ArrowRight') {
      goToChapter(state.chapterIndex + 1);
    } else if (event.key === 'g' || event.key === 'G') {
      openToc();
    } else if (event.key === 'Escape' && toc.open) {
      closeToc();
    }
  });

  // 关掉面板/切换视图时尽量把进度落一次盘。
  window.addEventListener('blur', () => reportProgress(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      reportProgress(true);
    }
  });

  // -------------------------------------------------------------- 消息入口

  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'readerConfig':
        state.autoSave = message.autoSaveProgress;
        state.progressDelay = message.progressDelay;
        break;

      case 'shelf':
        state.novels = message.novels;
        // 正在读的这本被移出书架了，退回书架视图
        if (state.novel && !message.novels.some((item) => item.id === state.novel.id)) {
          state.novel = null;
        }
        renderShelf();
        break;

      case 'novelOpened':
        state.novel = message.novel;
        state.totalChapters = message.chapter.totalChapters;
        state.chapterTitles = message.chapters;
        toc.filter = '';
        el.tocFilter.value = '';
        el.tocOverlay.hidden = true;
        toc.open = false;
        applySettings(message.settings);
        showReader();
        renderChapter(message.chapter);
        break;

      case 'chapter':
        renderChapter(message.chapter);
        break;

      case 'settings':
        applySettings(message.settings);
        break;

      case 'toast':
        showToast(message.message, message.level);
        break;

      default:
        break;
    }
  });

  post({ type: 'ready' });
})();
