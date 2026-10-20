import * as assert from 'node:assert';
import { guessTitleAndAuthor, isChapterTitle, parseChapters } from '../parser/chapterParser';

suite('chapterParser', () => {
  test('识别常见章节标题', () => {
    assert.ok(isChapterTitle('第一章 开端'));
    assert.ok(isChapterTitle('第1章 开端'));
    assert.ok(isChapterTitle('第 十二 回'));
    assert.ok(isChapterTitle('楔子'));
    assert.ok(isChapterTitle('番外 一'));
    assert.ok(isChapterTitle('Chapter 3'));
  });

  test('不把普通句子误判成标题', () => {
    assert.ok(!isChapterTitle('第二天他去了学校。'));
    assert.ok(!isChapterTitle('他说：第三章写得真好。'));
    assert.ok(!isChapterTitle(''));
  });

  test('按标题切分章节', () => {
    const text = ['第一章 开端', '正文一', '', '第二章 发展', '正文二'].join('\n');
    const chapters = parseChapters(text);

    assert.strictEqual(chapters.length, 2);
    assert.strictEqual(chapters[0].title, '第一章 开端');
    assert.strictEqual(chapters[1].title, '第二章 发展');
    assert.strictEqual(chapters[0].index, 0);
    assert.strictEqual(chapters[1].index, 1);
  });

  test('没有标题时整本作为单章', () => {
    const chapters = parseChapters('只有一段正文，没有任何章节标题。');
    assert.strictEqual(chapters.length, 1);
    assert.strictEqual(chapters[0].title, '正文');
  });

  test('标题之前的内容单独成章', () => {
    const text = ['《某书》内容简介', '第一章 开端', '正文'].join('\n');
    const chapters = parseChapters(text);
    assert.strictEqual(chapters.length, 2);
    assert.strictEqual(chapters[0].title, '开始');
  });

  test('从文件名猜书名和作者', () => {
    assert.deepStrictEqual(guessTitleAndAuthor('斗破苍穹.txt'), { title: '斗破苍穹' });
    assert.deepStrictEqual(guessTitleAndAuthor('斗破苍穹 - 天蚕土豆.txt'), {
      title: '斗破苍穹',
      author: '天蚕土豆',
    });
  });
});
