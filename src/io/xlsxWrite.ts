/**
 * .xlsx を書く。読む側（xlsx.ts）の裏返しで、こちらも必要な部品だけを作る。
 *
 * 書式も数式も要らないので、部品は最小限。文字列はセルに直接埋め、共有文字列の
 * 表は作らない（読むときと違い、書くときは大きさより単純さを採る）。数値は数値の
 * まま入れるので、Excel の側で並べ替えも集計もできる。
 */

import { zipSync } from "fflate";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types";
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export type CellValue = string | number | null | undefined;

export interface SheetInput {
  name: string;
  rows: readonly (readonly CellValue[])[];
}

/** シートを並べた .xlsx を組み立てる。 */
export function writeWorkbook(sheets: readonly SheetInput[]): Uint8Array {
  if (sheets.length === 0) throw new Error("シートがありません");

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": encode(contentTypes(sheets.length)),
    "_rels/.rels": encode(rootRels()),
    "xl/workbook.xml": encode(workbookXml(sheets)),
    "xl/_rels/workbook.xml.rels": encode(workbookRels(sheets.length)),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = encode(sheetXml(sheet.rows));
  });

  return zipSync(files, { level: 6 });
}

function contentTypes(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ` +
      `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  return (
    `${HEAD}<Types xmlns="${NS_TYPES}">` +
    `<Default Extension="rels" ` +
    `ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ` +
    `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `${sheets}</Types>`
  );
}

function rootRels(): string {
  return (
    `${HEAD}<Relationships xmlns="${NS_REL}">` +
    `<Relationship Id="rId1" Type="${NS_DOC_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`
  );
}

function workbookRels(count: number): string {
  const rels = Array.from(
    { length: count },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="${NS_DOC_REL}/worksheet" ` +
      `Target="worksheets/sheet${i + 1}.xml"/>`
  ).join("");
  return `${HEAD}<Relationships xmlns="${NS_REL}">${rels}</Relationships>`;
}

function workbookXml(sheets: readonly SheetInput[]): string {
  const entries = sheets
    .map(
      (sheet, i) =>
        `<sheet name="${attribute(sheetName(sheet.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
    )
    .join("");
  return `${HEAD}<workbook xmlns="${NS}" xmlns:r="${NS_DOC_REL}"><sheets>${entries}</sheets></workbook>`;
}

function sheetXml(rows: readonly (readonly CellValue[])[]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => cellXml(`${columnName(c)}${r + 1}`, value))
        .filter((cell) => cell !== "")
        .join("");
      return cells === "" ? "" : `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `${HEAD}<worksheet xmlns="${NS}"><sheetData>${body}</sheetData></worksheet>`;
}

function cellXml(ref: string, value: CellValue): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    // 数値のまま置くので、Excel で並べ替えも集計もできる
    return Number.isFinite(value) ? `<c r="${ref}"><v>${value}</v></c>` : "";
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text(value)}</t></is></c>`;
}

/** `0` を `A`、`26` を `AA` に。 */
function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/**
 * シート名の決まり: 31 文字まで、`: \ / ? * [ ]` は使えない。
 * 破って書くと Excel が「修復しますか」と持ちかけてくるので、こちらで直しておく。
 */
function sheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, "_").slice(0, 31);
  return cleaned === "" ? "Sheet" : cleaned;
}

function text(value: string): string {
  return (
    value
      // XML に置けない制御文字は落とす（タブ・改行・復帰は残す）
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  );
}

function attribute(value: string): string {
  return text(value).replace(/"/g, "&quot;");
}

function encode(xml: string): Uint8Array {
  return new TextEncoder().encode(xml);
}
