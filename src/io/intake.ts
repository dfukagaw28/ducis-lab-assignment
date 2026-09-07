/**
 * 読み込んだファイルを一つのインスタンスに組み立てる。
 *
 * どのファイルが何なのか (役割) はファイル名から推測し、画面で直せるようにする。
 * 実ファイルのパーサ (M3) が入っても、変わるのは parse の中身だけ。
 */

import { tightCapacities } from "../domain/capacity.js";
import type { Instance, Lab, LabId, Student, StudentId } from "../domain/types.js";
import { parseCsv } from "./csv.js";
import { looksLikeEclass, parseEclassPreferences } from "./eclass.js";
import {
  parseGpaRows,
  parseLabRows,
  parsePreferenceRows,
  parseScoreRows,
  type LabRow,
} from "./parsers.js";

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
  /** CSV やテキストとして読んだ中身。Excel から来たものは空。 */
  text: string;
  /**
   * Excel のシートを行と列にしたもの。CSV なら未設定で、`text` から起こす。
   * どちらから来ても、以降の読み取りは行と列に対して同じように行う。
   */
  rows?: string[][];
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

/**
 * 読み込んだファイルからインスタンスを組み立てる。
 *
 * `seed` は定員の指定が無いときの割り当てに使う（余りの席をどの研究室に渡すか）。
 */
export function buildInstance(files: readonly SourceFile[], seed: number): Built {
  const only = (role: FileRole): SourceFile => {
    const found = files.filter((file) => file.role === role);
    if (found.length === 0) throw new Error(`${ROLE_LABELS[role]}のファイルがありません`);
    if (found.length > 1) {
      throw new Error(`${ROLE_LABELS[role]}のファイルが ${found.length} 個あります`);
    }
    return found[0]!;
  };

  const preferenceFile = only("preferences");
  const preferenceRows = inFile(preferenceFile, () =>
    preferenceFile.rows === undefined && looksLikeEclass(preferenceFile.text)
      ? parseEclassPreferences(preferenceFile.text)
      : parsePreferenceRows(rowsOf(preferenceFile))
  );

  const gpaFile = only("gpa");
  const gpa = inFile(gpaFile, () => parseGpaRows(rowsOf(gpaFile)));

  const labFile = only("labs");
  const labRows = inFile(labFile, () => parseLabRows(rowsOf(labFile)));

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
    for (const row of inFile(file, () => parseScoreRows(rowsOf(file)))) {
      // 研究室 ID でも、研究室名でも、教員氏名でも引ける
      const forLab = scores.get(byAnyName.get(matchKey(row.lab)) ?? "");
      if (forLab === undefined) {
        throw new Error(
          `${file.name}: 「${row.lab}」が研究室一覧に見つかりません。` +
            `研究室一覧の「${TEACHER_COLUMN}」列に、裁量点ファイルの教員氏名を入れてください`
        );
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

  const capacities = resolveCapacities(labRows, students, seed, warnings);
  const labs: Lab[] = labRows.map((row) => ({
    id: row.id,
    ...(row.name === undefined ? {} : { name: row.name }),
    capacity: capacities.get(row.id)!,
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

/**
 * 定員を決める。
 *
 * 定員の列が無ければ、合計がちょうど学生数になるように割り当てる（`tightCapacities`）。
 * 運用上の決定を勝手にしたということなので、どう決めたかを警告に出す。一部の研究室
 * だけ空欄なのは書き忘れとみなして止める。
 */
function resolveCapacities(
  labRows: readonly LabRow[],
  students: readonly Student[],
  seed: number,
  warnings: string[]
): Map<LabId, number> {
  const missing = labRows.filter((row) => row.capacity === null);

  if (missing.length === 0) {
    return new Map(labRows.map((row) => [row.id, row.capacity!]));
  }

  if (missing.length < labRows.length) {
    throw new Error(
      `${missing.map((row) => row.id).join("、")} の定員が空欄です。` +
        `全研究室の定員を書くか、定員の列ごと省いてください`
    );
  }

  const capacities = tightCapacities(
    students,
    labRows.map((row) => row.id),
    seed
  );
  const base = Math.floor(students.length / labRows.length);
  const extra = [...capacities]
    .filter(([, seats]) => seats > base)
    .map(([id]) => id)
    .sort();

  warnings.push(
    `定員の指定が無いので、合計がちょうど学生数（${students.length} 人）になるように` +
      `割り当てました: 各研究室 ${base} 人` +
      (extra.length === 0 ? "" : `、希望の多い ${extra.join("、")} は +1 人`)
  );
  return capacities;
}

/** 研究室一覧 CSV の列の見出し（エラーで案内するため）。 */
const LABEL_COLUMN = "選択肢ラベル";
const TEACHER_COLUMN = "教員氏名";

/** Excel から来たならそのシート、CSV なら中身を読んで、行と列にする。 */
function rowsOf(file: SourceFile): string[][] {
  return file.rows ?? parseCsv(file.text);
}

/**
 * 研究室を、選択肢ラベル・研究室名・研究室 ID のどれからでも引けるようにする。
 *
 * eClass の希望順位ファイルは研究室を `○○研究室（○○　○○）` のような表示名で
 * 指し、教員ごとの裁量点ファイルは教員氏名で指すのに対し、研究室一覧は `L01` の
 * ような ID で持っている。突き合わせるのが選択肢ラベルと教員氏名の列で、無ければ
 * 研究室名か ID がそのまま使われている場合に備える。
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
    add(row.teacher, row.id);
  }
  return lookup;
}

/** 突き合わせ用の鍵。空白（全角も）の入れ方の違いは無視する。 */
function matchKey(name: string): string {
  return name.replace(/[\s\u3000]/g, "");
}

/** パーサの投げるエラーに、どのファイルで起きたのかを添える。 */
function inFile<T>(file: SourceFile, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new Error(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
