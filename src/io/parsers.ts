/**
 * 暫定の CSV 形式のパーサ。
 *
 * 実際の入力は LMS が吐くテキストと Excel だが (M3)、それが決まるまでの間も
 * アプリを端から端まで動かせるように、こちらで決めた CSV を読む。M3 のパーサも
 * 同じ形（テキスト → 中間の行）で書き、intake.ts から差し替える。
 *
 * 見出しの名前は揺れるので、別名を並べて拾う。
 */

import { parseCsv, withHeader } from "./csv.js";

const STUDENT_ID = ["学籍番号", "学生番号", "学生id", "学生ID", "id", "ID"];
const STUDENT_NAME = ["氏名", "名前", "学生名", "name"];
const LAB_ID = ["研究室", "研究室id", "研究室ID", "研究室記号", "lab", "配属先"];
const LAB_NAME = ["研究室名", "教員名", "lab name"];
const CAPACITY = ["定員", "受入人数", "capacity"];
const GPA = ["gpa", "GPA", "成績", "評点"];
const SCORE = ["裁量点", "点数", "得点", "評価点", "score"];

export interface PreferenceRow {
  id: string;
  name?: string;
  preferences: string[];
}

export interface LabRow {
  id: string;
  name?: string;
  capacity: number;
}

export interface ScoreRow {
  lab: string;
  student: string;
  score: number;
}

/**
 * 希望順位。`学籍番号,氏名,第1希望,第2希望,...` の横並び。
 *
 * 見出しが `第N希望` の列を N の順に読む。そう名づけられた列が無ければ、
 * 学籍番号と氏名を除いた残りの列を左から順に希望とみなす。
 */
export function parsePreferences(text: string): PreferenceRow[] {
  const rows = parseCsv(text);
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

/** `学籍番号,GPA` */
export function parseGpa(text: string): Map<string, number> {
  const gpa = new Map<string, number>();
  for (const row of withHeader(parseCsv(text))) {
    const id = pick(row, STUDENT_ID);
    if (id === undefined || id === "") continue;
    if (gpa.has(id)) throw new Error(`学籍番号 ${id} が重複しています`);
    gpa.set(id, toNumber(pick(row, GPA), `${id} の GPA`));
  }
  return gpa;
}

/** `研究室,研究室名,定員` */
export function parseLabs(text: string): LabRow[] {
  return withHeader(parseCsv(text))
    .filter((row) => (pick(row, LAB_ID) ?? "") !== "")
    .map((row) => {
      const id = pick(row, LAB_ID)!;
      const name = pick(row, LAB_NAME);
      return {
        id,
        ...(name === undefined || name === "" ? {} : { name }),
        capacity: toNumber(pick(row, CAPACITY), `${id} の定員`),
      };
    });
}

/** `研究室,学籍番号,裁量点`。研究室ごとのファイルでも、まとめた一枚でもよい。 */
export function parseScores(text: string): ScoreRow[] {
  return withHeader(parseCsv(text))
    .filter((row) => (pick(row, STUDENT_ID) ?? "") !== "")
    .map((row) => {
      const lab = pick(row, LAB_ID);
      const student = pick(row, STUDENT_ID)!;
      if (lab === undefined || lab === "") {
        throw new Error(`${student} の行に研究室の列 (${LAB_ID[0]}) がありません`);
      }
      return { lab, student, score: toNumber(pick(row, SCORE), `${lab} の ${student} の裁量点`) };
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

function toNumber(value: string | undefined, what: string): number {
  const text = (value ?? "").replace(/[,\s　]/g, "");
  if (text === "") throw new Error(`${what} が空です`);
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new Error(`${what} が数値ではありません: ${value}`);
  return parsed;
}
