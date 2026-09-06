/**
 * 読み込んだファイルのバイト列を文字列にする。
 *
 * Excel が書き出した CSV は Shift_JIS のことが多く、UTF-8 と混在するので、
 * BOM を見て、無ければ UTF-8 として厳密に解釈できるかどうかで決める。
 */

const BOM = [0xef, 0xbb, 0xbf];

export function decodeBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  if (BOM.every((byte, i) => bytes[i] === byte)) {
    return new TextDecoder("utf-8").decode(bytes.subarray(BOM.length));
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

export async function readTextFile(file: Blob): Promise<string> {
  return decodeBytes(await file.arrayBuffer());
}
