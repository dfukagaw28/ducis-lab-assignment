/**
 * .xlsx を読む。必要なのはセルの値だけなので、それだけを取り出す。
 *
 * .xlsx は XML を集めた zip なので、`fflate` で開いて必要な XML を読む。書式や
 * 数式や図は見ない（数式のセルは Excel が書き込んだ計算結果を読む）。
 *
 * SheetJS を入れなかったのは、npm の `xlsx` が 0.18.5 で止まっていて既知の脆弱性が
 * あり、本体は 400KB あるのに対して、ここで要るのが「シートを行と列にする」だけ
 * だから。CSV パーサを自前で持っているのと同じ理由。
 */

import { unzipSync } from "fflate";

/** OOXML の名前空間。 */
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

export interface Sheet {
  name: string;
  /** 行と列。空のセルは空文字列で埋めてある。 */
  rows: string[][];
}

export interface Workbook {
  sheets: Sheet[];
}

export function readWorkbook(bytes: Uint8Array): Workbook {
  const files = unzipSync(bytes);
  const read = (path: string): string | undefined => {
    const found = files[path];
    return found === undefined ? undefined : new TextDecoder("utf-8").decode(found);
  };

  const workbook = read("xl/workbook.xml");
  if (workbook === undefined) throw new Error("Excel のファイルではないようです");

  const shared = readSharedStrings(read("xl/sharedStrings.xml"));
  const targets = readRelationships(read("xl/_rels/workbook.xml.rels"));

  const sheets: Sheet[] = [];
  for (const element of parseXml(workbook).getElementsByTagNameNS(NS, "sheet")) {
    const name = element.getAttribute("name") ?? "";
    const id = element.getAttributeNS(NS_REL, "id") ?? element.getAttribute("r:id");
    const target = id === null ? undefined : targets.get(id);
    const xml = target === undefined ? undefined : read(`xl/${target.replace(/^\/?xl\//, "")}`);
    if (xml === undefined) continue;
    sheets.push({ name, rows: readSheet(xml, shared) });
  }

  if (sheets.length === 0) throw new Error("シートが一つもありません");
  return { sheets };
}

/** 名前でシートを引く。名前を省くと最初のシート。 */
export function sheetOf(workbook: Workbook, name?: string): Sheet {
  if (name === undefined) return workbook.sheets[0]!;
  const found = workbook.sheets.find((sheet) => sheet.name === name);
  if (found === undefined) {
    const names = workbook.sheets.map((sheet) => sheet.name).join("、");
    throw new Error(`シート「${name}」がありません（あるのは ${names}）`);
  }
  return found;
}

/**
 * 共有文字列。
 *
 * `<si>` の下には本文の `<t>` のほかに、ふりがなの `<rPh>` が入っていることがある。
 * それを一緒に拾うと「教員氏名キョウインシメイ」のような値になるので、`<rPh>` の
 * 下は読まない。
 */
function readSharedStrings(xml: string | undefined): string[] {
  if (xml === undefined) return [];
  return Array.from(parseXml(xml).getElementsByTagNameNS(NS, "si")).map(textOf);
}

function textOf(si: Element): string {
  let text = "";
  for (const node of Array.from(si.childNodes)) {
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    if (element.localName === "t") text += element.textContent ?? "";
    else if (element.localName === "r") {
      for (const t of element.getElementsByTagNameNS(NS, "t")) text += t.textContent ?? "";
    }
    // rPh（ふりがな）と phoneticPr は読み飛ばす
  }
  return text;
}

function readRelationships(xml: string | undefined): Map<string, string> {
  if (xml === undefined) return new Map();
  const targets = new Map<string, string>();
  for (const element of parseXml(xml).getElementsByTagNameNS(NS_REL, "Relationship")) {
    const id = element.getAttribute("Id");
    const target = element.getAttribute("Target");
    if (id !== null && target !== null) targets.set(id, target);
  }
  return targets;
}

function readSheet(xml: string, shared: readonly string[]): string[][] {
  const rows: string[][] = [];

  for (const row of parseXml(xml).getElementsByTagNameNS(NS, "row")) {
    const cells: string[] = [];
    for (const cell of row.getElementsByTagNameNS(NS, "c")) {
      const at = columnOf(cell.getAttribute("r"));
      const index = at < 0 ? cells.length : at;
      while (cells.length < index) cells.push("");
      cells[index] = valueOf(cell, shared);
    }
    // 行番号が飛んでいたら空行で埋める
    const at = Number(row.getAttribute("r"));
    if (Number.isInteger(at) && at > 0) {
      while (rows.length < at - 1) rows.push([]);
      rows[at - 1] = cells;
    } else {
      rows.push(cells);
    }
  }

  return rows;
}

function valueOf(cell: Element, shared: readonly string[]): string {
  const type = cell.getAttribute("t");

  if (type === "inlineStr") {
    const is = cell.getElementsByTagNameNS(NS, "is")[0];
    return is === undefined ? "" : textOf(is);
  }

  const v = cell.getElementsByTagNameNS(NS, "v")[0];
  const text = v?.textContent ?? "";
  if (text === "") return "";

  if (type === "s") return shared[Number(text)] ?? "";
  if (type === "b") return text === "1" ? "TRUE" : "FALSE";
  return text;
}

/** `C12` の `C` を 0 始まりの列番号にする。参照が無ければ -1。 */
function columnOf(ref: string | null): number {
  if (ref === null) return -1;
  const letters = /^([A-Z]+)/.exec(ref)?.[1];
  if (letters === undefined) return -1;
  let column = 0;
  for (const letter of letters) column = column * 26 + (letter.charCodeAt(0) - 64);
  return column - 1;
}

function parseXml(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const error = document.getElementsByTagName("parsererror")[0];
  if (error !== undefined) throw new Error(`XML を読めませんでした: ${error.textContent ?? ""}`);
  return document;
}
