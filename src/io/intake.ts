/**
 * 読み込んだファイルを一つのインスタンスに組み立てる。
 *
 * どのファイルが何なのか (役割) はファイル名から推測し、画面で直せるようにする。
 * 実ファイルのパーサ (M3) が入っても、変わるのは parse の中身だけ。
 */

import type { Instance, Lab, LabId, Student, StudentId } from "../domain/types.js";
import { looksLikeEclass, parseEclassPreferences } from "./eclass.js";
import { parseGpa, parseLabs, parsePreferences, parseScores, type LabRow } from "./parsers.js";

export const ROLES = ["preferences", "gpa", "labs", "scores"] as const;
export type FileRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<FileRole, string> = {
  preferences: "希望順位",
  gpa: "GPA",
  labs: "研究室・定員",
  scores: "教員裁量点",
};

export interface SourceFile {
  name: string;
  role: FileRole;
  text: string;
}

export interface Built {
  instance: Instance;
  /** 計算はできるが目を通してほしいこと */
  warnings: string[];
}

/** ファイル名から役割を当てる。外れても画面で直せる。 */
export function guessRole(fileName: string): FileRole {
  const name = fileName.toLowerCase();
  // eClass の書き出しはテキスト、他の 3 種類は表計算から出てくる
  if (/希望|preference|choice|answer|回答|アンケート|\.txt$/.test(name)) return "preferences";
  if (/gpa|成績/.test(name)) return "gpa";
  if (/定員|capacity|研究室一覧|labs?\b/.test(name)) return "labs";
  return "scores";
}

export function buildInstance(files: readonly SourceFile[]): Built {
  const only = (role: FileRole): SourceFile => {
    const found = files.filter((file) => file.role === role);
    if (found.length === 0) throw new Error(`${ROLE_LABELS[role]}のファイルがありません`);
    if (found.length > 1) {
      throw new Error(`${ROLE_LABELS[role]}のファイルが ${found.length} 個あります`);
    }
    return found[0]!;
  };

  const preferenceFile = only("preferences");
  const preferenceRows = inFile(preferenceFile, (text) =>
    looksLikeEclass(text) ? parseEclassPreferences(text) : parsePreferences(text)
  );
  const gpa = inFile(only("gpa"), parseGpa);
  const labRows = inFile(only("labs"), parseLabs);

  const scoreFiles = files.filter((file) => file.role === "scores");
  if (scoreFiles.length === 0) throw new Error("教員裁量点のファイルがありません");

  const warnings: string[] = [];

  const labIds = new Set(labRows.map((row) => row.id));
  if (labIds.size !== labRows.length) throw new Error("研究室が重複しています");

  // 希望順位ファイルが研究室をどう呼んでいても引けるようにする
  const byAnyName = labLookup(labRows);

  // 研究室ごとの裁量点。ファイルが分かれていてもまとめて受ける。
  const scores = new Map<string, Map<StudentId, number>>(
    labRows.map((row) => [row.id, new Map<StudentId, number>()])
  );
  for (const file of scoreFiles) {
    for (const row of inFile(file, parseScores)) {
      const forLab = scores.get(row.lab);
      if (forLab === undefined) {
        throw new Error(`${file.name}: 研究室一覧に無い研究室 ${row.lab} があります`);
      }
      if (forLab.has(row.student)) {
        warnings.push(`${file.name}: ${row.lab} の ${row.student} の裁量点が重複しています`);
      }
      forLab.set(row.student, row.score);
    }
  }

  const seen = new Set<StudentId>();
  const students: Student[] = preferenceRows.map((row) => {
    if (seen.has(row.id)) throw new Error(`学籍番号 ${row.id} が重複しています`);
    seen.add(row.id);

    const preferences = row.preferences.map((name) => {
      const labId = byAnyName.get(matchKey(name));
      if (labId === undefined) {
        throw new Error(
          `${row.id} の希望にある「${name}」が研究室一覧に見つかりません。` +
            `研究室一覧の「${LABEL_COLUMN}」列に、希望順位ファイルの書き方と同じ文字列を入れてください`
        );
      }
      return labId;
    });
    const unique = new Set(preferences);
    if (unique.size !== preferences.length) {
      throw new Error(`${row.id} の希望に同じ研究室が複数あります`);
    }

    const score = gpa.get(row.id);
    if (score === undefined) warnings.push(`${row.id} の GPA がありません（0 として扱います）`);

    return {
      id: row.id,
      ...(row.name === undefined ? {} : { name: row.name }),
      gpa: score ?? 0,
      preferences,
    };
  });

  const ranked = new Set(students.map((student) => student.id));
  for (const id of gpa.keys()) {
    if (!ranked.has(id)) warnings.push(`${id} は GPA にあるが希望順位に無い（無視します）`);
  }

  const labs: Lab[] = labRows.map((row) => ({
    id: row.id,
    ...(row.name === undefined ? {} : { name: row.name }),
    capacity: row.capacity,
    scores: scores.get(row.id)!,
  }));

  const totalCapacity = labs.reduce((sum, lab) => sum + lab.capacity, 0);
  if (totalCapacity < students.length) {
    warnings.push(
      `定員の合計 ${totalCapacity} が学生数 ${students.length} より少ないので、` +
        `少なくとも ${students.length - totalCapacity} 人が未配属になります`
    );
  }

  return { instance: { students, labs }, warnings };
}

/** 研究室一覧 CSV の、選択肢ラベルの列の見出し（エラーで案内するため）。 */
const LABEL_COLUMN = "選択肢ラベル";

/**
 * 研究室を、選択肢ラベル・研究室名・研究室 ID のどれからでも引けるようにする。
 *
 * eClass の希望順位ファイルは研究室を `○○研究室（○○　○○）` のような表示名で
 * 指すのに対し、研究室一覧は `L01` のような ID で持っている。突き合わせるのが
 * 選択肢ラベルの列で、無ければ研究室名か ID がそのまま使われている場合に備える。
 */
function labLookup(labRows: readonly LabRow[]): Map<string, LabId> {
  const lookup = new Map<string, LabId>();
  const add = (name: string | undefined, labId: LabId): void => {
    const key = matchKey(name ?? "");
    if (key === "") return;
    const found = lookup.get(key);
    if (found !== undefined && found !== labId) {
      throw new Error(`研究室 ${found} と ${labId} が同じ名前「${name}」を持っています`);
    }
    lookup.set(key, labId);
  };

  for (const row of labRows) {
    add(row.id, row.id);
    add(row.name, row.id);
    add(row.label, row.id);
  }
  return lookup;
}

/** 突き合わせ用の鍵。空白（全角も）の入れ方の違いは無視する。 */
function matchKey(name: string): string {
  return name.replace(/[\s\u3000]/g, "");
}

/** パーサの投げるエラーに、どのファイルで起きたのかを添える。 */
function inFile<T>(file: SourceFile, parse: (text: string) => T): T {
  try {
    return parse(file.text);
  } catch (error) {
    throw new Error(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
