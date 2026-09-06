/**
 * eClass のファイルを覗く道具。
 *
 *   npm run inspect -- data/eclass.txt [--rows 5]
 *
 * 構造の切り分け (splitSections) が実ファイルに通るかを見て、パラメータ行と
 * 各ブロックの列を、列番号つきで並べる。parseOptionLabels と parseUserAnswers
 * を書くときに、どの列に何が入っているかを確かめるためのもの。
 *
 * 実データの中身をそのまま端末に出すので、既定では各ブロックの先頭 3 行だけ。
 */

import { readFileSync } from "node:fs";

import { decodeBytes } from "../src/io/decode.js";
import { parseCsv } from "../src/io/csv.js";
import { splitSections, stripHtml, type EclassSections } from "../src/io/eclass.js";

const args = process.argv.slice(2);
const path = args.find((arg) => !arg.startsWith("-"));
const rowsIndex = args.indexOf("--rows");
const maxRows = rowsIndex < 0 ? 3 : Number(args[rowsIndex + 1] ?? 3);

if (path === undefined) {
  console.error("使い方: npm run inspect -- <ファイル> [--rows N]");
  process.exit(1);
}

const bytes = readFileSync(path);
const text = decodeBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

console.log(`${path}  ${bytes.length} バイト  ${text.length} 文字`);
console.log(`文字コード: ${guessEncoding(bytes)}`);

const rows = parseCsv(text);
console.log(`CSV として ${rows.length} 行\n`);

let sections: EclassSections;
try {
  sections = splitSections(text);
} catch (error) {
  console.error(`splitSections が通りませんでした: ${(error as Error).message}\n`);
  console.error("先頭 30 行をそのまま出します。定数を直す手がかりに:\n");
  dump(rows.slice(0, 30), 0);
  process.exit(1);
}

if (sections.notes.length > 0) {
  console.log("=== 注意 ===");
  for (const note of sections.notes) console.log(`  ${note}`);
  console.log();
}

console.log("=== ヘッダ (使わない) ===");
dump(sections.preamble, 1);

console.log("\n=== パラメータ ===");
const [header = [], values = []] = sections.parameters;
const width = Math.max(header.length, values.length);
for (let i = 0; i < width; i++) {
  const key = header[i] ?? "";
  const value = values[i] ?? "";
  const stripped = stripHtml(value);
  const extra = stripped !== value.trim() ? `   → ${cut(stripped)}` : "";
  console.log(`  [${String(i).padStart(2)}] ${cut(key, 24).padEnd(24)} = ${cut(value)}${extra}`);
}

console.log("\n=== ブロック ===");
for (const block of sections.blocks) {
  console.log(`\n[${block.title}]  ${block.rows.length} 行`);
  const shown = block.rows.slice(0, maxRows);
  shown.forEach((row, index) => {
    console.log(`  ${index === 0 ? "見出し?" : `${index}行目 `} ${row.length} 列`);
    row.forEach((cell, column) => {
      if (cell.trim() !== "") console.log(`    [${String(column).padStart(2)}] ${cut(cell)}`);
    });
  });
  if (block.rows.length > shown.length) {
    console.log(`  … 残り ${block.rows.length - shown.length} 行 (--rows で増やせます)`);
  }
}

function dump(rows: readonly string[][], from: number): void {
  rows.forEach((row, index) => console.log(`  ${index + from}: ${row.map((c) => cut(c)).join(" | ")}`));
}

function cut(text: string, limit = 60): string {
  const flat = text.replace(/\r?\n/g, "⏎");
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`;
}

function guessEncoding(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "UTF-8 (BOM 付き)";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "UTF-8";
  } catch {
    return "Shift_JIS とみなした";
  }
}
