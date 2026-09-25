/**
 * 暫定の CSV 形式のパーサ。
 *
 * 実際の入力は e-class (LMS) が吐くテキストと Excel だが (M3)、それが決まるまでの間も
 * アプリを端から端まで動かせるように、こちらで決めた CSV を読む。M3 のパーサも
 * 同じ形（テキスト → 中間の行）で書き、intake.ts から差し替える。
 *
 * 見出しの名前は揺れるので、別名を並べて拾う。
 */

import { parseCsv, withHeader } from "./csv.js";

const STUDENT_ID = ["学籍番号", "学生番号", "学生id", "学生ID", "id", "ID"];
const STUDENT_NAME = ["氏名", "名前", "学生名", "学生氏名", "name"];
const LAB_ID = ["研究室", "研究室id", "研究室ID", "研究室記号", "lab", "配属先"];
const LAB_NAME = ["研究室名", "教員名", "lab name"];
const CAPACITY = ["定員", "受入人数", "capacity"];
const OPTION_LABEL = ["選択肢ラベル", "eclass", "eclassラベル", "ラベル", "選択肢"];
const GPA = ["gpa", "GPA", "成績", "評点"];
const SCORE = ["裁量点", "教員裁量点", "点数", "得点", "評価点", "score"];
const TEACHER = ["教員氏名", "教員名", "担当教員", "教員", "先生"];


export interface PreferenceRow {
  id: string;
  name?: string;
  preferences: string[];
}

export interface GpaRow {
  id: string;
  /** 学生氏名の列があれば。希望順位を出していない学生の氏名はここから取れる。 */
  name?: string;
  gpa: number;
}

export interface LabRow {
  id: string;
  name?: string;
  /** 定員。列が無いか空欄なら null。既定値を入れるのは intake.ts の役目。 */
  capacity: number | null;
  /** e-class の選択肢ラベル。希望順位ファイルの研究室名と突き合わせるのに使う。 */
  label?: string;
  /** 教員氏名。教員ごとの裁量点ファイルと突き合わせるのに使う。 */
  teacher?: string;
}

export interface ScoreSheet {
  rows: ScoreRow[];
  /**
   * 研究室の列ではなく、教員氏名の列で研究室を指していたか。
   *
   * 教員ごとの Excel は教員氏名で指す（1 ファイル 1 人）。研究室の列でまとめた
   * CSV は複数の研究室が並ぶのが普通なので、扱いを分ける必要がある。
   */
  byTeacher: boolean;
}

export interface ScoreRow {
  /** 研究室 ID、研究室名、または教員氏名。空のことがあり、intake が埋める。 */
  lab: string;
  student: string;
  score: number;
  /** 欄が空だったので 0 点にした。記入漏れと区別が付かないので、intake が知らせる。 */
  blank?: boolean;
  /** 学生氏名の列があれば。希望順位を出していない学生の氏名はここからしか取れない。 */
  name?: string;
}

/**
 * 希望順位。`学籍番号,氏名,第1希望,第2希望,...` の横並び。
 *
 * 見出しが `第N希望` の列を N の順に読む。そう名づけられた列が無ければ、
 * 学籍番号と氏名を除いた残りの列を左から順に希望とみなす。
 */
export function parsePreferences(text: string): PreferenceRow[] {
  return parsePreferenceRows(parseCsv(text));
}

export function parsePreferenceRows(rows: readonly string[][]): PreferenceRow[] {
  const header = rows[0];
  if (header === undefined) throw new Error("空のファイルです");

  const keys = header.map((cell) => cell.replace(/^[\s　]+|[\s　]+$/g, ""));
  const idIndex = findIndex(keys, STUDENT_ID);
  if (idIndex < 0) throw missingColumn("学籍番号", STUDENT_ID);
  const nameIndex = findIndex(keys, STUDENT_NAME);

  const numbered = keys
    .map((key, index) => ({ index, rank: rankOf(key) }))
    .filter((entry): entry is { index: number; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.index);
  const choiceIndexes =
    numbered.length > 0
      ? numbered
      : keys.map((_, index) => index).filter((index) => index !== idIndex && index !== nameIndex);

  return rows
    .slice(1)
    .filter((row) => (row[idIndex] ?? "").trim() !== "")
    .map((row) => {
      const name = nameIndex < 0 ? undefined : (row[nameIndex] ?? "").trim();
      return {
        id: normalizeId(row[idIndex] ?? ""),
        ...(name === undefined || name === "" ? {} : { name }),
        preferences: choiceIndexes
          .map((index) => (row[index] ?? "").trim())
          .filter((value) => value !== ""),
      };
    });
}

/** `学籍番号,GPA`。`学生氏名` の列があれば拾う。 */
export function parseGpa(text: string): GpaRow[] {
  return parseGpaRows(parseCsv(text));
}

export function parseGpaRows(rows: readonly string[][]): GpaRow[] {
  const seen = new Set<string>();
  const gpa: GpaRow[] = [];
  const body = withHeader(rows);
  for (const row of body) {
    const raw = pick(row, STUDENT_ID);
    if (raw === undefined || raw === "") continue;
    const id = normalizeId(raw);
    if (seen.has(id)) throw new Error(`学籍番号 ${id} が重複しています`);
    seen.add(id);

    const score = pick(row, GPA);
    if (score === undefined) throw missingColumn("GPA", GPA);

    const name = pick(row, STUDENT_NAME);
    gpa.push({
      id,
      ...(name === undefined || name === "" ? {} : { name }),
      gpa: toNumber(score, `${id} の GPA`),
    });
  }

  // 行はあるのに一つも読めていないなら、見出しを取り違えている
  if (gpa.length === 0 && body.length > 0) throw missingColumn("学生ID", STUDENT_ID);

  return gpa;
}

/**
 * `研究室` の一覧。`研究室名`・`定員`・`選択肢ラベル` は任意。
 *
 * 選択肢ラベルは e-class の希望順位ファイルが研究室を指す文字列
 * （`○○研究室（○○　○○）` など）。無ければ研究室名か研究室 ID で突き合わせる。
 *
 * 定員は無ければ null にしておく。全研究室で無ければ学生数から割り出す
 * （intake.ts）。
 */
export function parseLabs(text: string): LabRow[] {
  return parseLabRows(parseCsv(text));
}

export function parseLabRows(rows: readonly string[][]): LabRow[] {
  return withHeader(rows)
    .filter((row) => (pick(row, LAB_ID) ?? "") !== "")
    .map((row) => {
      const id = normalizeId(pick(row, LAB_ID)!);
      const name = pick(row, LAB_NAME);
      const label = pick(row, OPTION_LABEL);
      const teacher = pick(row, TEACHER);
      return {
        id,
        ...(name === undefined || name === "" ? {} : { name }),
        capacity: optionalNumber(pick(row, CAPACITY), `${id} の定員`),
        ...(label === undefined || label === "" ? {} : { label }),
        ...(teacher === undefined || teacher === "" ? {} : { teacher }),
      };
    });
}

/**
 * `研究室,学籍番号,裁量点`。研究室ごとのファイルでも、まとめた一枚でもよい。
 *
 * 教員ごとの Excel（`学生ID,学生氏名,教員氏名,教員裁量点`）も同じ形として読める。
 * 研究室を指すのが研究室 ID か教員氏名かの違いで、どちらも研究室一覧で引ける。
 */
export function parseScores(text: string): ScoreSheet {
  return parseScoreRows(parseCsv(text));
}

export function parseScoreRows(rows: readonly string[][]): ScoreSheet {
  const body = withHeader(rows);
  const found = body.filter((row) => (pick(row, STUDENT_ID) ?? "") !== "");

  // 行はあるのに一つも読めていないなら、見出しを取り違えている
  if (found.length === 0 && body.length > 0) throw missingColumn("学生ID", STUDENT_ID);

  // 研究室の列があればそちら、無ければ教員氏名の列で研究室を指している
  const byTeacher = found.length > 0 && pick(found[0]!, LAB_ID) === undefined;
  const labColumn = byTeacher ? TEACHER : LAB_ID;

  const parsed = found
    .map((row) => {
      const lab = pick(row, labColumn);
      const student = normalizeId(pick(row, STUDENT_ID)!);
      if (lab === undefined) throw missingColumn("研究室または教員氏名", [...TEACHER, ...LAB_ID]);

      const score = pick(row, SCORE);
      if (score === undefined) throw missingColumn("裁量点", SCORE);

      // 空欄は 0 点。ただし「0 点のつもり」と「書き忘れ」は見分けられないので印を残す
      const blank = score.trim() === "";

      const name = pick(row, STUDENT_NAME);
      return {
        lab: lab.trim(),
        student,
        score: blank ? 0 : toNumber(score, `${lab} の ${student} の裁量点`),
        ...(blank ? { blank } : {}),
        ...(name === undefined || name === "" ? {} : { name }),
      };
    });

  return { rows: parsed, byTeacher };
}

/**
 * 見出しと別名を比べるための形に直す。
 *
 * 全角と半角を揃える（NFKC）。`学生ＩＤ` と `学生ID` は同じ見出しのつもりで書かれる
 * ので、揃えないと全角で書かれた列が見つからず、その列が丸ごと無かったことになる。
 * 大文字小文字も無視する。
 */
function matchable(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/**
 * どれかの役目の見出しとして、すでに名前が付いている列。
 *
 * 前方一致では、こういう列を奪わない。`教員` は教員氏名の別名だが、`教員裁量点` は
 * その頭に一致してしまう。裁量点の列だと分かっている列を教員氏名として読むと、
 * 点数が研究室の名前として扱われ、見当違いの場所を疑うことになる。
 */
const NAMED_COLUMNS = new Set(
  [STUDENT_ID, STUDENT_NAME, LAB_ID, LAB_NAME, CAPACITY, OPTION_LABEL, TEACHER, GPA, SCORE]
    .flat()
    .map(matchable)
);

/**
 * 学生 ID・研究室 ID を揃える形。
 *
 * 全角と半角を揃える（NFKC）。`１２３４` と `1234` は同じ学生を指しているつもりで
 * 書かれるので、揃えないとファイルごとに同じ学生が別人になる。出力にもこの形で出す。
 */
export function normalizeId(text: string): string {
  return text.normalize("NFKC").trim();
}

/*
 * 見出しは、まず完全一致で探し、見つからなければ前方一致で探す。
 *
 * 見出しに但し書きが付いていることがある（`裁量点最大60`、`教員氏名（リストから
 * 選択）`、`GPA（4.0満点）`）。完全一致を先に試すのは、`研究室` と `研究室名` の
 * ように片方が他方の頭に含まれる見出しが並んでいても取り違えないため。
 */

/** 但し書きが付いた見出しか。別の役目の見出しそのものであれば、そうは扱わない。 */
function startsWithAlias(key: string, wanted: readonly string[]): boolean {
  const folded = matchable(key);
  if (NAMED_COLUMNS.has(folded)) return false;
  return wanted.some((alias) => folded.startsWith(alias));
}

function findIndex(keys: readonly string[], aliases: readonly string[]): number {
  const wanted = aliases.map(matchable);
  const exact = keys.findIndex((key) => wanted.includes(matchable(key)));
  return exact >= 0 ? exact : keys.findIndex((key) => startsWithAlias(key, wanted));
}

function pick(row: Record<string, string>, aliases: readonly string[]): string | undefined {
  const wanted = aliases.map(matchable);
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    if (wanted.includes(matchable(key))) return value;
  }
  for (const [key, value] of entries) {
    if (startsWithAlias(key, wanted)) return value;
  }
  return undefined;
}

/** 見当たらなかった列を、その見出しの候補ごと知らせる。 */
function missingColumn(what: string, aliases: readonly string[]): Error {
  return new Error(`${what}の列 (${aliases.slice(0, 3).join(" / ")} など) が見つかりません`);
}

/** `第3希望` から 3 を取り出す。希望の列でなければ null。 */
function rankOf(key: string): number | null {
  const match = /^第\s*(\d+)\s*希望$/.exec(key) ?? /^希望\s*(\d+)$/.exec(key);
  return match === null ? null : Number(match[1]);
}

/** 空欄を許す数値。 */
function optionalNumber(value: string | undefined, what: string): number | null {
  const text = (value ?? "").normalize("NFKC").replace(/[,\s]/g, "");
  return text === "" ? null : toNumber(value, what);
}

function toNumber(value: string | undefined, what: string): number {
  // IME のまま打たれた `６０` は 60 のつもり。桁区切りと空白も落とす
  const text = (value ?? "").normalize("NFKC").replace(/[,\s]/g, "");
  if (text === "") throw new Error(`${what} が空です`);
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new Error(`${what} が数値ではありません: ${value}`);
  return parsed;
}
