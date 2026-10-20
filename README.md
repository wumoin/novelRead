# novelRead

在 VS Code **底部面板**里读小说的扩展：导入本地 `txt`、自动分章、记住你读到哪儿。

## 功能

- 📚 **底部面板阅读器** —— 不占用编辑区，和终端并排，编码时随手瞄两眼。
- 📥 **导入小说** —— 支持 UTF-8 / GBK / UTF-16（含 BOM）编码的 `.txt`。
- 📦 **导入即复制** —— 导入时把原文件复制进扩展的全局存储目录，之后阅读只读副本。原文件随便删、随便挪，书架不受影响。
- ✂️ **自动分章** —— 识别 `第X章`、`第X节`、`楔子`、`序章`、`番外`、`Chapter N` 等常见标题。
- 🔖 **章节目录跳转** —— 按 `g` 唤出目录浮层，可搜索标题，也可直接输入章节号回车跳过去。
- 💾 **每本书一条配置记录** —— 导入即建档，独立保存阅读进度与字号/行高/主题。
- ⏱️ **阅读记录** —— 滚动和切章时自动保存进度，书架按最近阅读排序。

## 快速开始

```bash
npm install
npm run compile     # 或 npm run watch
```

然后在 VS Code 里按 <kbd>F5</kbd> 启动「运行扩展」，在新窗口底部面板找到 **小说阅读器**，
点「导入小说」挑 `samples/示例小说 - 佚名.txt` 试一下。

## 快捷键（阅读器聚焦时）

| 按键 | 作用 |
| --- | --- |
| `g` | 打开章节目录浮层 |
| `Esc` | 关闭目录浮层 |
| `←` / `→` | 上一章 / 下一章 |

目录浮层里，输入框支持两种用法：打几个字筛标题，或直接输入章节号（如 `128`）按回车跳转。

## 命令

| 命令 | 说明 |
| --- | --- |
| `novelRead: 导入小说` | 选择本地 `.txt` 文件导入书架 |
| `novelRead: 打开阅读器` | 聚焦底部面板的阅读器视图 |
| `novelRead: 刷新书架` | 重新从磁盘读取书架数据 |

## 配置项

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `novelRead.defaults.fontSize` | `16` | 新导入小说的默认字号 |
| `novelRead.defaults.lineHeight` | `1.8` | 新导入小说的默认行高 |
| `novelRead.defaults.maxWidth` | `760` | 正文最大宽度 |
| `novelRead.defaults.theme` | `auto` | 默认阅读主题（auto/light/sepia/dark） |
| `novelRead.reader.autoSaveProgress` | `true` | 是否自动记录阅读进度 |
| `novelRead.reader.progressSaveDelay` | `800` | 滚动停止后延迟写入的毫秒数 |

## 数据存放在哪

导入小说时，原文件会被**原样复制**进扩展的全局存储目录，之后阅读、定位、删除都只认副本：

```
<globalStorage>/novels.json      # 书架：每本书一条配置记录
<globalStorage>/novels/<id>.txt  # 小说副本，文件名是记录 id
```

Windows 上 `<globalStorage>` 大致是 `%APPDATA%\Code\User\globalStorage\wumoin.novelread\`。

- **原文件可以随便删或挪** —— 扩展不会再去读它，`sourcePath` 只作来源记录。
- **从书架移除**会一并删掉对应的副本文件。
- 想彻底清空，直接删掉整个 `<globalStorage>` 目录即可。

## 项目结构

```
src/
├── extension.ts                 # 入口：activate / deactivate
├── constants.ts                 # 命令 ID、视图 ID 等常量
├── types.ts                     # NovelRecord / 阅读进度 / 阅读偏好等数据结构
├── logger.ts                    # 输出面板日志
├── commands/index.ts            # 命令注册
├── storage/NovelStore.ts        # 书架持久化（每本书一条配置记录）
├── importer/novelImporter.ts    # 导入流程：选文件 → 解码 → 分章 → 建档
├── parser/
│   ├── encoding.ts              # 编码探测（UTF-8 / GBK / UTF-16）
│   └── chapterParser.ts         # 章节切分与按章取正文
└── reader/
    ├── NovelReaderViewProvider.ts  # 底部面板 Webview 视图
    ├── messages.ts                 # Webview ↔ 扩展 消息协议
    └── webviewHtml.ts              # Webview HTML 模板与 CSP

media/                           # 注入 Webview 的前端资源
├── reader.css
├── reader.js
└── panel-icon.svg

samples/                         # 手动调试用的示例小说
```

## 开发脚本

| 脚本 | 说明 |
| --- | --- |
| `npm run watch` | 并行监听 esbuild 打包与 tsc 类型检查 |
| `npm run compile` | 单次 esbuild 打包 |
| `npm run package` | 生产构建（压缩、无 sourcemap） |
| `npm run check-types` | 仅类型检查 |
| `npm run lint` | ESLint |
| `npm run test:unit` | 跑纯 Node 单测（章节解析 / 编码 / Webview 布局回归），不需要下载 VS Code |
| `npm test` | 下载 VS Code 跑集成测试 |
| `npx vsce package` | 打出 `.vsix` |

## 已知限制

- 阅读进度按「章节 + 章节内滚动比例」记录；如果重新导入同一个文件导致章节重新切分，进度可能偏移。
- 书架一次性把整本小说读进内存并按章切片，超大文件（>50MB）首次打开会略有停顿。
- 副本会一直留在全局存储目录里，占用的磁盘空间约等于书架里所有小说之和。
- 尚不支持 `.epub` / `.mobi`。

## License

MIT
