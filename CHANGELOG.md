# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.0.1] - 2026-10-20

### 修复

- **点「返回书架」无反应**：前端只在 `state.novel` 为空时才调 `showShelf()`，
  而 `state.novel` 恰恰只在 `showShelf()` 内部被清空 —— 死循环分支，永远进不去。
  改为点击时先本地切回书架，再通知扩展。
- **打开目录卡顿**：目录列表原用 CSS 多列 + 每条 `break-inside: avoid`，
  多列布局的列平衡在几千章时开销很大。改用 grid（行优先、无需平衡），
  并按「书名 + 筛选词」缓存渲染结果，重复打开不再重建 DOM。
- **正文被目录浮层永久遮挡**：`hidden` 属性靠 UA 样式表的 `[hidden] { display: none }` 生效，
  而作者样式表优先级更高；`.shelf` / `.reader` / `.toc-overlay` / `.reader-tools` 上的
  `display: flex` 把 `hidden` 压掉了。已在 `reader.css` 补上
  `[hidden] { display: none !important }` 兜底，并加回归测试盯住。
- **滚动卡顿**：`NovelStore.update()` 每次都主动 flush，导致滚动每停一次就重写整个书架文件
  （含每本书的完整章节索引，几 MB）。改为交给防抖写入，并新增 `silent` 选项，
  让进度更新不再触发书架重渲染。
- 书架文件改用紧凑 JSON 输出（省掉约 40% 体积）。
- 缺少 `storedFile` 的旧格式记录会在载入时被丢弃并给出提示，不再抛异常。
- 目录定位改用 `scrollTop` 计算，避免 `scrollIntoView` 连带滚动祖先容器。

### 新增

- 项目骨架：TypeScript + esbuild + ESLint + VS Code 集成测试。
- 单元测试：章节解析、编码探测、Webview 布局回归（`npm run test:unit`，不需要下载 VS Code）。
- 底部面板（Panel）中的 Webview 阅读器视图。
- 导入本地 `.txt` 小说，自动识别 UTF-8 / GBK / UTF-16 编码。
- 导入时把原文件复制进全局存储目录，阅读只读副本，原文件删除不影响书架。
- 章节自动切分（`第X章`、`楔子`、`番外` 等常见标题格式）。
- 章节目录浮层：多列布局、标题筛选、输入章节号直接跳转，快捷键 `g` 唤出。
- 每导入一本小说生成一条独立配置记录（阅读进度、阅读偏好）。
- 阅读进度自动保存，书架按最近阅读排序。
