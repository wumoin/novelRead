export interface DecodeResult {
  text: string;
  /** 实际使用的编码名，会写进小说配置记录。 */
  encoding: string;
}

const BOMS: ReadonlyArray<{ bytes: readonly number[]; encoding: string }> = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: 'utf-8' },
  { bytes: [0xff, 0xfe], encoding: 'utf-16le' },
  { bytes: [0xfe, 0xff], encoding: 'utf-16be' },
];

/** 自动探测时依次尝试的编码。 */
const FALLBACK_ENCODINGS = ['utf-8', 'gbk', 'gb18030', 'big5'] as const;

function tryDecode(buffer: Uint8Array, encoding: string, fatal: boolean): string | undefined {
  try {
    return new TextDecoder(encoding, { fatal }).decode(buffer);
  } catch {
    // 编码名不被当前运行时支持，或严格解码失败
    return undefined;
  }
}

function matchBom(buffer: Uint8Array): { length: number; encoding: string } | undefined {
  for (const bom of BOMS) {
    if (bom.bytes.length > buffer.length) {
      continue;
    }
    if (bom.bytes.every((byte, index) => buffer[index] === byte)) {
      return { length: bom.bytes.length, encoding: bom.encoding };
    }
  }
  return undefined;
}

/**
 * 把小说文件的原始字节解码成文本。
 *
 * 顺序是：BOM → 调用方给的编码提示 → 严格 UTF-8 → GBK/GB18030/Big5 → 宽松 UTF-8 兜底。
 * 中文 txt 小说大量使用 GBK，所以严格 UTF-8 失败后回退到 GBK 是这里最关键的一步。
 *
 * @param buffer 文件原始字节
 * @param hint 已知编码（例如从配置记录里读到的编码），命中则直接使用
 */
export function decodeBuffer(buffer: Uint8Array, hint?: string): DecodeResult {
  const bom = matchBom(buffer);
  if (bom) {
    const body = buffer.subarray(bom.length);
    const text = tryDecode(body, bom.encoding, false);
    if (text !== undefined) {
      return { text, encoding: bom.encoding };
    }
  }

  if (hint) {
    const text = tryDecode(buffer, hint, true);
    if (text !== undefined) {
      return { text, encoding: hint };
    }
  }

  for (const encoding of FALLBACK_ENCODINGS) {
    const text = tryDecode(buffer, encoding, true);
    if (text !== undefined) {
      return { text, encoding };
    }
  }

  return { text: new TextDecoder('utf-8').decode(buffer), encoding: 'utf-8' };
}
