import type { ChapterMeta } from '../types';

/** 章节标题行最长允许多少字符，超过就当成正文而不是标题。 */
const MAX_TITLE_LENGTH = 40;

/** 以这些标点结尾的行基本是正文，不是标题。 */
const SENTENCE_ENDINGS = /[。！？；：，、…—"”』」）)\]】]$/;

/** 中文数字 + 阿拉伯数字的章节序号。 */
const CN_NUM = '零〇一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟';

/** 常见章节标题格式。 */
const TITLE_PATTERNS: readonly RegExp[] = [
  // 第一章 / 第1章 / 第 十二 回 / 第3节 ...
  new RegExp(`^第\\s*[${CN_NUM}\\d]+\\s*[章节回卷折篇幕集部]\\s*\\S*$`),
  // 楔子 / 序章 / 引子 / 尾声 / 后记 / 番外 一 ...
  /^(?:楔子|序章|序言|序|前言|引子|尾声|终章|后记|尾记|番外|外传|附录)\s*\S{0,20}$/,
  // Chapter 1 / CHAPTER IV
  /^chapter\s*[\dIVXLMC]+[\s:.-]*\S{0,30}$/i,
];

/** 判断一行（已 trim）是否是章节标题。 */
export function isChapterTitle(line: string): boolean {
  if (!line || line.length > MAX_TITLE_LENGTH) {
    return false;
  }
  if (SENTENCE_ENDINGS.test(line)) {
    return false;
  }
  return TITLE_PATTERNS.some((pattern) => pattern.test(line));
}

interface LineSpan {
  text: string;
  /** 该行在全文中的起始偏移。 */
  start: number;
  /** 该行之后的偏移（含换行符）。 */
  end: number;
}

/** 按 `\n` 切行，同时保留每行在全文中的偏移。 */
function splitLines(text: string): LineSpan[] {
  const lines: LineSpan[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let breakAt = text.indexOf('\n', cursor);
    if (breakAt === -1) {
      breakAt = text.length;
    }
    const raw = text.slice(cursor, breakAt);
    lines.push({
      text: raw.endsWith('\r') ? raw.slice(0, -1) : raw,
      start: cursor,
      end: Math.min(breakAt + 1, text.length),
    });
    cursor = breakAt + 1;
  }
  return lines;
}

/** 从文件名猜书名与作者，例如 `斗破苍穹 - 天蚕土豆.txt`。 */
export function guessTitleAndAuthor(fileName: string): { title: string; author?: string } {
  const base = fileName.replace(/\.[^./\\]+$/, '').trim();
  const separator = / [|｜\-—_] |[《【]|[（(]作者[：:]/;
  const match = separator.exec(base);
  if (!match || match.index === 0) {
    return { title: base || '未命名小说' };
  }
  const title = base.slice(0, match.index).trim();
  const rest = base.slice(match.index + match[0].length).replace(/[》】）)]$/, '').trim();
  if (!title) {
    return { title: base };
  }
  return rest ? { title, author: rest } : { title };
}

/**
 * 把整本小说切分成章节。
 *
 * 找不到任何章节标题时，整本书作为单章「正文」返回 —— 这样阅读器不必为
 * 「没有章节结构的 txt」写特殊分支。
 */
export function parseChapters(text: string): ChapterMeta[] {
  const lines = splitLines(text);
  const marks: Array<{ title: string; start: number; contentStart: number }> = [];

  for (const line of lines) {
    const trimmed = line.text.trim();
    if (isChapterTitle(trimmed)) {
      marks.push({ title: trimmed, start: line.start, contentStart: line.end });
    }
  }

  if (marks.length === 0) {
    return [
      {
        index: 0,
        title: '正文',
        start: 0,
        contentStart: 0,
        end: text.length,
      },
    ];
  }

  const chapters: ChapterMeta[] = [];

  // 第一个章节标题之前如果还有正文（例如内容简介），单独作为一章。
  const leading = text.slice(0, marks[0].start);
  if (leading.trim().length > 0) {
    chapters.push({
      index: 0,
      title: '开始',
      start: 0,
      contentStart: 0,
      end: marks[0].start,
    });
  }

  for (let i = 0; i < marks.length; i += 1) {
    const mark = marks[i];
    const next = marks[i + 1];
    chapters.push({
      index: chapters.length,
      title: mark.title,
      start: mark.start,
      contentStart: mark.contentStart,
      end: next ? next.start : text.length,
    });
  }

  return chapters;
}

/** 取出某一章的正文（不含标题行）。 */
export function getChapterContent(text: string, chapter: ChapterMeta): string {
  return text.slice(chapter.contentStart, chapter.end).trim();
}

/** 取一段正文做摘要，用于书签或书架预览。 */
export function excerpt(text: string, maxLength = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= maxLength ? flat : `${flat.slice(0, maxLength)}…`;
}
