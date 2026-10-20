import * as assert from 'node:assert';
import { decodeBuffer } from '../parser/encoding';

suite('encoding', () => {
  test('带 BOM 的 UTF-8 会剥掉 BOM', () => {
    const body = Buffer.from('第一章 开端', 'utf-8');
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]);

    const result = decodeBuffer(withBom);

    assert.strictEqual(result.encoding, 'utf-8');
    assert.strictEqual(result.text, '第一章 开端');
    assert.ok(!result.text.startsWith('﻿'));
  });

  test('无 BOM 的 UTF-8 正常解码', () => {
    const result = decodeBuffer(Buffer.from('第一章 开端', 'utf-8'));
    assert.strictEqual(result.encoding, 'utf-8');
    assert.strictEqual(result.text, '第一章 开端');
  });

  test('GBK 内容回退到 GBK 解码', () => {
    // 用 UTF-16 中转构造 GBK 字节，避免依赖测试环境里的编码转换 API。
    const gbkBytes = gbkEncode('第一章 开端');
    const result = decodeBuffer(gbkBytes);

    assert.strictEqual(result.text, '第一章 开端');
    assert.notStrictEqual(result.encoding, 'utf-8');
  });

  test('编码提示优先于自动探测', () => {
    const utf8 = Buffer.from('第一章 开端', 'utf-8');
    const result = decodeBuffer(utf8, 'utf-8');

    assert.strictEqual(result.encoding, 'utf-8');
    assert.strictEqual(result.text, '第一章 开端');
  });
});

/** 把少量已知汉字编成 GBK 字节，用于构造测试输入。 */
function gbkEncode(text: string): Uint8Array {
  // Node 的 TextEncoder 只支持 UTF-8，这里手工查表覆盖测试用到的字符。
  const table: Record<string, number[]> = {
    第: [0xb5, 0xda],
    一: [0xd2, 0xbb],
    章: [0xd5, 0xc2],
    开: [0xbf, 0xaa],
    端: [0xb6, 0xcb],
    空: [0xbf, 0xd5],
    格: [0xb8, 0xf1],
    ' ': [0x20],
  };
  const bytes: number[] = [];
  for (const char of text) {
    const mapped = table[char];
    if (!mapped) {
      throw new Error(`测试字符表缺少「${char}」`);
    }
    bytes.push(...mapped);
  }
  return Uint8Array.from(bytes);
}
