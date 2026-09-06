/** RFC 4180 の CSV を読み書きする。依存を増やさないための最小実装。 */

/**
 * CSV を行と列に分解する。
 *
 * 引用符の中の改行とカンマ、`""` によるエスケープを扱う。改行は LF でも CRLF
 * でもよく、末尾の空行は落とす。先頭の BOM は decode 側で外す前提。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = (): void => {
    row.push(field);
    field = "";
    started = false;
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;

    if (quoted) {
      if (c !== '"') {
        field += c;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }

    if (c === '"' && !started) {
      quoted = true;
      started = true;
    } else if (c === ",") {
      endField();
    } else if (c === "\n") {
      endRow();
    } else if (c === "\r") {
      // CRLF の CR は読み飛ばす（単独の CR は使わない想定）
    } else {
      field += c;
      started = true;
    }
  }

  // 末尾に改行があれば空行が一つできるので、それだけは落とす
  if (field !== "" || row.length > 0) endRow();

  return rows;
}

export type CsvValue = string | number | null | undefined;

/** 行と列を CSV にする。Excel に合わせて改行は CRLF。 */
export function toCsv(rows: readonly (readonly CsvValue[])[]): string {
  return rows.map((row) => row.map(quote).join(",")).join("\r\n") + "\r\n";
}

function quote(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * ヘッダ行を見出しにして、各行を見出し → 値の対応にする。
 *
 * 見出しの前後の空白と、Excel が付けがちな全角空白は落とす。
 */
export function withHeader(rows: readonly string[][]): Array<Record<string, string>> {
  const [header, ...body] = rows;
  if (header === undefined) return [];
  const keys = header.map(normalize);
  return body
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => Object.fromEntries(keys.map((key, i) => [key, (row[i] ?? "").trim()])));
}

export function normalize(text: string): string {
  return text.replace(/^[\s　]+|[\s　]+$/g, "");
}
