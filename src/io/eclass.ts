/**
 * eClass (LMS) が書き出す希望順位ファイルのパーサ。
 *
 * ファイルの形は DESIGN.md の「eClass の希望順位ファイル」を参照。ここでは
 * 構造を切り分けるところまでを用意してあり、中身の読み取り
 * (`parseOptionLabels` と `parseUserAnswers`) はこれから書く。
 *
 * 引用符の中に改行やカンマを含む欄（HTML のラベル）があるので、行に切ってから
 * CSV にするのではなく、ファイル全体を CSV として読んでから行を数える。
 */

import { parseCsv } from "./csv.js";
import type { PreferenceRow } from "./parsers.js";

/**
 * 冒頭の、教材名や出力日時が書かれた行数。中身は使わない。
 *
 * 出力時のオプションによって 5 行にも 6 行にもなるので、範囲でしか見ない。
 * どちらも正常なので注意書きは出さない。
 */
const PREAMBLE_ROWS = { min: 5, max: 6 };

/** 問題のパラメータの行数（見出しと値）。同じく目安。 */
const PARAMETER_ROWS = 2;

/** ブロックの見出し。角括弧は外してある。 */
export const BLOCKS = {
  answers: "回答一覧",
  survey: "アンケート集計",
  /** 学生ごとの回答。ここから希望順位を取る。 */
  perUser: "ユーザ毎の回答リスト",
  perUserTime: "ユーザ毎の回答時間リスト(単位:秒)",
  counts: "回答数リスト（表形式の設問のみ）",
} as const;

export interface EclassBlock {
  /** 角括弧を外した見出し */
  title: string;
  rows: string[][];
}

export interface EclassSections {
  /** 冒頭のヘッダ。使わないが、取り違えに気づけるよう残す。 */
  preamble: string[][];
  /** 問題のパラメータ。後半の列に選択肢ラベルが入る。 */
  parameters: string[][];
  blocks: EclassBlock[];
  /** 説明と食い違ったところ。止めるほどではないが目を通してほしい。 */
  notes: string[];
}

/**
 * ファイルを、ヘッダ・パラメータ・ブロックの並びに切り分ける。
 *
 * 行数は決め打ちにせず、空行と `[...]` の見出しで区切って数える。eClass の版が
 * 変わって前置きの行数が動いても通る。説明と行数が食い違ったら notes に書き出す
 * だけで、止めはしない。
 */
export function splitSections(text: string): EclassSections {
  const rows = parseCsv(text);
  const notes: string[] = [];

  let at = skipBlanks(rows, 0);
  const preamble = takeChunk(rows, at);
  at = skipBlanks(rows, at + preamble.length);
  if (preamble.length < PREAMBLE_ROWS.min || preamble.length > PREAMBLE_ROWS.max) {
    notes.push(
      `ヘッダが ${preamble.length} 行あります` +
        `（想定は ${PREAMBLE_ROWS.min}〜${PREAMBLE_ROWS.max} 行）`
    );
  }

  const parameters = takeChunk(rows, at);
  at = skipBlanks(rows, at + parameters.length);
  if (parameters.length === 0) {
    throw new Error(
      preamble.length === 0
        ? "空のファイルです"
        : "ヘッダの後にパラメータの行がありません（次に来たのは [...] の見出しか終端）"
    );
  }
  if (parameters.length !== PARAMETER_ROWS) {
    notes.push(`パラメータが ${parameters.length} 行あります（説明では ${PARAMETER_ROWS} 行）`);
  }

  const blocks: EclassBlock[] = [];
  let current: EclassBlock | null = null;
  for (; at < rows.length; at++) {
    const row = rows[at]!;
    if (isBlank(row)) continue;

    const title = titleOf(row);
    if (title !== null) {
      current = { title, rows: [] };
      blocks.push(current);
    } else if (current !== null) {
      current.rows.push(row);
    } else {
      throw new Error(`${at + 1} 行目: [...] の見出しより前に中身があります`);
    }
  }

  if (blocks.length === 0) throw new Error("[...] のブロックが一つもありません");
  return { preamble, parameters, blocks, notes };
}

/** 見出しでブロックを引く。全角と半角の括弧・コロンの違いは無視する。 */
export function findBlock(sections: EclassSections, title: string): EclassBlock {
  const wanted = normalizeTitle(title);
  const found = sections.blocks.find((block) => normalizeTitle(block.title) === wanted);
  if (found === undefined) throw new Error(`[${title}] のブロックがありません`);
  return found;
}

/**
 * 選択肢ラベル。option1 … option26 の列から、研究室を表す文字列を取り出す。
 *
 * ラベルは `<p>...</p>` の HTML なので、stripHtml() で中のテキストだけにする。
 *
 * TODO: パラメータの 2 行（見出しと値）のどの列が option かを見て、
 *       選択肢の番号 → 研究室 の対応を作る。
 */
export function parseOptionLabels(parameters: readonly string[][]): Map<string, string> {
  throw new Error(`parseOptionLabels は未実装です（パラメータ ${parameters.length} 行）`);
}

/**
 * メインのブロック。学生ごとの回答を希望順位に直す。
 *
 * TODO: 学籍番号・氏名の列と、選択肢ごとの順位が入った列を読み、
 *       PreferenceRow[]（第 1 希望から並べた研究室）にする。
 *       研究室の名前は labels で引く。
 */
export function parseUserAnswers(
  block: EclassBlock,
  labels: ReadonlyMap<string, string>
): PreferenceRow[] {
  throw new Error(
    `parseUserAnswers は未実装です（${block.rows.length} 行、選択肢 ${labels.size} 個）`
  );
}

/**
 * 入口。intake.ts からは、暫定 CSV の parsePreferences の代わりにこれを呼ぶ。
 */
export function parseEclassPreferences(text: string): PreferenceRow[] {
  const sections = splitSections(text);
  return parseUserAnswers(findBlock(sections, BLOCKS.perUser), parseOptionLabels(sections.parameters));
}

/** `<p>情報数理</p>` → `情報数理`。実体参照も戻す。 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/^[\s　]+|[\s　]+$/g, "");
}

function isBlank(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

/** `[ユーザ毎の回答リスト]` の行なら見出しを返す。そうでなければ null。 */
function titleOf(row: readonly string[]): string | null {
  if (row.length === 0) return null;
  const match = /^\[(.+)\]$/.exec(row[0]!.trim());
  // 見出しの行に他の欄があれば、それは見出しではない
  return match === null || row.slice(1).some((cell) => cell.trim() !== "") ? null : match[1]!;
}

/** 空行を読み飛ばす。 */
function skipBlanks(rows: readonly string[][], at: number): number {
  while (at < rows.length && isBlank(rows[at]!)) at++;
  return at;
}

/** 空行か `[...]` の見出しに当たるまでの、ひと続きの行。 */
function takeChunk(rows: readonly string[][], at: number): string[][] {
  const chunk: string[][] = [];
  for (let i = at; i < rows.length; i++) {
    const row = rows[i]!;
    if (isBlank(row) || titleOf(row) !== null) break;
    chunk.push(row);
  }
  return chunk;
}

/** 全角の括弧とコロンを半角に寄せる。見出しの表記ゆれを吸収するため。 */
function normalizeTitle(title: string): string {
  return title.replace(/[（）：]/g, (c) => ({ "（": "(", "）": ")", "：": ":" })[c]!).trim();
}
