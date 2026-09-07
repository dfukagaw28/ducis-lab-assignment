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
const TEACHER = ["教員氏名", "担当教員", "教員", "教員名"];
/** 裁量点の表で研究室を指す列。教員ごとの Excel は教員氏名で研究室を表す。 */
const SCORE_LAB = [...LAB_ID, ...TEACHER];

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
  /** eClass の選択肢ラベル。希望順位ファイルの研究室名と突き合わせるのに使う。 */
  label?: string;
  /** 教員氏名。教員ごとの裁量点ファイルと突き合わせるのに使う。 */
  teacher?: string;
}

export interface ScoreRow {
  lab: string;
  student: string;
  score: number;
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
  if (idIndex < 0) throw new Error(`学籍番号の列 (${STUDENT_ID[0]}) が見つかりません`);
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
        id: (row[idIndex] ?? "").trim(),
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
  for (const row of withHeader(rows)) {
    const id = pick(row, STUDENT_ID);
    if (id === undefined || id === "") continue;
    if (seen.has(id)) throw new Error(`学籍番号 ${id} が重複しています`);
    seen.add(id);

    const name = pick(row, STUDENT_NAME);
    gpa.push({
      id,
      ...(name === undefined || name === "" ? {} : { name }),
      gpa: toNumber(pick(row, GPA), `${id} の GPA`),
    });
  }
  return gpa;
}

/**
 * `研究室` の一覧。`研究室名`・`定員`・`選択肢ラベル` は任意。
 *
 * 選択肢ラベルは eClass の希望順位ファイルが研究室を指す文字列
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
      const id = pick(row, LAB_ID)!;
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
export function parseScores(text: string): ScoreRow[] {
  return parseScoreRows(parseCsv(text));
}

export function parseScoreRows(rows: readonly string[][]): ScoreRow[] {
  return withHeader(rows)
    .filter((row) => (pick(row, STUDENT_ID) ?? "") !== "")
    .map((row) => {
      const lab = pick(row, SCORE_LAB);
      const student = pick(row, STUDENT_ID)!;
      if (lab === undefined || lab === "") {
        throw new Error(`${student} の行に研究室の列 (${LAB_ID[0]} か ${TEACHER[0]}) がありません`);
      }
      const name = pick(row, STUDENT_NAME);
      return {
        lab,
        student,
        score: toNumber(pick(row, SCORE), `${lab} の ${student} の裁量点`),
        ...(name === undefined || name === "" ? {} : { name }),
      };
    });
}

function findIndex(keys: readonly string[], aliases: readonly string[]): number {
  return keys.findIndex((key) => aliases.some((alias) => key.toLowerCase() === alias.toLowerCase()));
}

function pick(row: Record<string, string>, aliases: readonly string[]): string | undefined {
  for (const [key, value] of Object.entries(row)) {
    if (aliases.some((alias) => key.toLowerCase() === alias.toLowerCase())) return value;
  }
  return undefined;
}

/** `第3希望` から 3 を取り出す。希望の列でなければ null。 */
function rankOf(key: string): number | null {
  const match = /^第\s*(\d+)\s*希望$/.exec(key) ?? /^希望\s*(\d+)$/.exec(key);
  return match === null ? null : Number(match[1]);
}

/** 空欄を許す数値。 */
function optionalNumber(value: string | undefined, what: string): number | null {
  const text = (value ?? "").replace(/[,\s　]/g, "");
  return text === "" ? null : toNumber(value, what);
}

function toNumber(value: string | undefined, what: string): number {
  const text = (value ?? "").replace(/[,\s　]/g, "");
  if (text === "") throw new Error(`${what} が空です`);
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new Error(`${what} が数値ではありません: ${value}`);
  return parsed;
}
