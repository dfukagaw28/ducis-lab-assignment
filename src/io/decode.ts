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

/**
 * データのシートらしい名前。Excel を読むとき、この名前のシートがあればそれを、
 * 無ければ最初のシートを使う。教員裁量点のファイルには「教員氏名リスト」の
 * シートも付いているので、名前で選べるようにしておく。
 */
const DATA_SHEETS = ["教員裁量点", "GPA", "gpa", "成績", "研究室", "希望順位"];

/** zip の目印。.xlsx は XML を集めた zip。 */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export interface FileContent {
  /** CSV やテキストとして読んだ中身。Excel なら空。 */
  text: string;
  /** Excel のシートを行と列にしたもの。 */
  rows?: string[][];
}

/**
 * 落とされたファイルを読む。Excel なら中身のシートを、それ以外は文字列として。
 *
 * Excel を読む道具は落とされたときに初めて取りに行く（動的 import）。CSV しか
 * 使わない人に解凍ライブラリを配らないため。
 */
export async function readInputFile(file: Blob): Promise<FileContent> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (!ZIP_MAGIC.every((byte, i) => bytes[i] === byte)) {
    return { text: decodeBytes(buffer) };
  }

  const { readWorkbook, sheetOf } = await import("./xlsx.js");
  const workbook = readWorkbook(bytes);
  const wanted = workbook.sheets.find((sheet) => DATA_SHEETS.includes(sheet.name));
  return { text: "", rows: sheetOf(workbook, wanted?.name).rows };
}
