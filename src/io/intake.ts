/**
 * 読み込んだファイルを一つのインスタンスに組み立てる。
 *
 * どのファイルが何なのか (役割) はファイル名から推測し、画面で直せるようにする。
 * 実ファイルのパーサ (M3) が入っても、変わるのは parse の中身だけ。
 */

import { tightCapacities } from "../domain/capacity.js";
import { seedFromInput } from "../domain/seed.js";
import type { Instance, Lab, LabId, Student, StudentId } from "../domain/types.js";
import { parseCsv } from "./csv.js";
import { looksLikeEclass, parseEclass } from "./eclass.js";
import {
  parseGpaRows,
  parseLabRows,
  parsePreferenceRows,
  parseScoreRows,
  type LabRow,
  type PreferenceRow,
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
  /** 使った抽選シード。渡されなければ入力データから導いたもの。 */
  seed: number;
  /** 計算はできるが目を通してほしいこと */
  warnings: string[];
}

/** ファイル名から役割を当てる。外れても画面で直せる。 */
export function guessRole(fileName: string): FileRole {
  const name = fileName.toLowerCase();
  // e-class の書き出しはテキスト、他の 3 種類は表計算から出てくる
  if (/希望|preference|choice|answer|回答|アンケート|\.txt$/.test(name)) return "preferences";
  if (/gpa|成績/.test(name)) return "gpa";
  if (/定員|capacity|研究室一覧|labs?\b/.test(name)) return "labs";
  return "scores";
}

/**
 * 読み込んだファイルからインスタンスを組み立てる。
 *
 * `seed` を渡さなければ、入力データから導く（`domain/seed.ts`）。人が選べると
 * 結果を見てから選び直した疑いが残るので、既定はこちら。
 */
export function buildInstance(files: readonly SourceFile[], seed?: number): Built {
  const optional = (role: FileRole): SourceFile | undefined => {
    const found = files.filter((file) => file.role === role);
    if (found.length > 1) {
      throw new Error(`${ROLE_LABELS[role]}のファイルが ${found.length} 個あります`);
    }
    return found[0];
  };
  const only = (role: FileRole): SourceFile => {
    const found = optional(role);
    if (found === undefined) throw new Error(`${ROLE_LABELS[role]}のファイルがありません`);
    return found;
  };

  const preferenceFile = only("preferences");
  const eclass = inFile(preferenceFile, () =>
    preferenceFile.rows === undefined && looksLikeEclass(preferenceFile.text)
      ? parseEclass(preferenceFile.text)
      : null
  );
  const preferenceRows =
    eclass?.rows ?? inFile(preferenceFile, () => parsePreferenceRows(rowsOf(preferenceFile)));

  const gpaFile = only("gpa");
  const gpaRows = inFile(gpaFile, () => parseGpaRows(rowsOf(gpaFile)));
  const gpa = new Map(gpaRows.map((row) => [row.id, row.gpa]));
  // 名簿の氏名。希望順位を出していない学生の氏名はここか裁量点の表から取る。
  const namesFromGpa = new Map<StudentId, string>(
    gpaRows.filter((row) => row.name !== undefined).map((row) => [row.id, row.name!])
  );

  const scoreFiles = files.filter((file) => file.role === "scores");
  if (scoreFiles.length === 0) throw new Error("教員裁量点のファイルがありません");

  const warnings: string[] = [];

  // 研究室一覧のファイルは任意。無ければ希望順位から研究室を読み取る。
  const labFile = optional("labs");
  const labRows =
    labFile === undefined
      ? deriveLabs(eclass?.labels ?? null, preferenceRows, warnings)
      : inFile(labFile, () => parseLabRows(rowsOf(labFile)));

  const labIds = new Set(labRows.map((row) => row.id));
  if (labIds.size !== labRows.length) throw new Error("研究室が重複しています");

  // 希望順位ファイルが研究室をどう呼んでいても引けるようにする
  const byAnyName = labLookup(labRows);

  // 研究室ごとの裁量点。ファイルが分かれていてもまとめて受ける。
  const scores = new Map<string, Map<StudentId, number>>(
    labRows.map((row) => [row.id, new Map<StudentId, number>()])
  );
  // 希望順位を出していない学生の氏名は、裁量点の表からしか取れない
  const namesFromScores = new Map<StudentId, string>();
  // どの研究室の点数がどのファイルから来たか（食い違いを指摘するときに使う）
  const scoreSources = new Map<string, Set<string>>();
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
      if (row.name !== undefined) namesFromScores.set(row.student, row.name);

      const labId = byAnyName.get(matchKey(row.lab))!;
      const sources = scoreSources.get(labId) ?? new Set<string>();
      sources.add(file.name);
      scoreSources.set(labId, sources);
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

  // 希望順位を出していない学生も配属の対象にする。順位を一つも付けていない扱いに
  // なるので、全研究室がランダムな順になる（domain/preferences.ts）。
  const ranked = new Set(students.map((student) => student.id));
  const absent = [...gpa.keys()].filter((id) => !ranked.has(id)).sort();
  for (const id of absent) {
    const name = namesFromGpa.get(id) ?? namesFromScores.get(id);
    students.push({
      id,
      ...(name === undefined ? {} : { name }),
      gpa: gpa.get(id)!,
      preferences: [],
    });
  }
  if (absent.length > 0) {
    warnings.push(
      `${absent.length} 人が希望順位を出していません（${list(absent)}）。` +
        `全研究室をランダムな順として扱います`
    );
  }

  checkRoster(students, scores, scoreSources, warnings);

  // 定員はシードから決まることがあるので、シードは定員を決める前の入力から導く
  const drawSeed =
    seed ??
    seedFromInput(
      students,
      labRows.map((row) => ({ id: row.id, capacity: row.capacity, scores: scores.get(row.id)! }))
    );

  const capacities = resolveCapacities(labRows, students, drawSeed, warnings);
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

  return { instance: { students, labs }, seed: drawSeed, warnings };
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

/**
 * 研究室一覧のファイルが無いときに、研究室を割り出す。
 *
 * e-class の書き出しなら選択肢がそのまま研究室の全体像なので、それを使う。誰も
 * 挙げなかった研究室も選択肢には並んでいるので落とさない。暫定 CSV なら希望順位に
 * 現れた研究室を集めるしかない。
 *
 * 定員は決めずに置いておく（`resolveCapacities` が合計を学生数に合わせる）。
 */
function deriveLabs(
  labels: ReadonlyMap<number, string> | null,
  preferenceRows: readonly PreferenceRow[],
  warnings: string[]
): LabRow[] {
  const found =
    labels !== null
      ? [...labels].sort(([a], [b]) => a - b).map(([, label]) => label)
      : [...new Set(preferenceRows.flatMap((row) => row.preferences))].sort();

  if (found.length === 0) {
    throw new Error("研究室・定員のファイルが無く、希望順位からも研究室を読み取れません");
  }

  warnings.push(
    `研究室・定員のファイルが無いので、希望順位から ${found.length} 室を読み取りました` +
      `（${found.join("、")}）`
  );

  return found.map((label, index) => ({
    id: `L${String(index + 1).padStart(2, "0")}`,
    name: shortName(label),
    capacity: null,
    label,
  }));
}

/** `○○研究室（○○　○○）` を `○○研究室` に。括弧が無ければそのまま。 */
function shortName(label: string): string {
  const at = label.search(/[（(]/);
  return at <= 0 ? label : label.slice(0, at).trim();
}

/** `○○研究室（○○　○○）` の括弧の中。無ければ undefined。 */
function inParentheses(label: string | undefined): string | undefined {
  const match = label === undefined ? null : /[（(]([^）)]+)[）)]\s*$/.exec(label);
  return match === null ? undefined : match[1]!.trim();
}

/** 研究室一覧 CSV の列の見出し（エラーで案内するため）。 */
const LABEL_COLUMN = "選択肢ラベル";
const TEACHER_COLUMN = "教員氏名";

/**
 * 名簿と裁量点の表を突き合わせる。
 *
 * GPA のファイルと教員ごとの裁量点のファイルは同じ学生を並べたもので、行数も揃う。
 * 揃っていなければどちらかが古いか、行が消されている。
 *
 * 見落とすと痛いのは、教員の表から学生の行ごと消えている場合。点数が空欄なら
 * 読み取りが止まるが、行が無ければ既定では 0 点として扱われ、その学生はその研究室
 * では黙って最下位近くに落ちる。
 */
function checkRoster(
  students: readonly Student[],
  scores: ReadonlyMap<string, Map<StudentId, number>>,
  sources: ReadonlyMap<string, Set<string>>,
  warnings: string[]
): void {
  const roster = new Set(students.map((student) => student.id));

  for (const [labId, forLab] of scores) {
    const from = [...(sources.get(labId) ?? [])].join("、") || labId;
    if (forLab.size === 0) {
      warnings.push(`${labId} の裁量点がありません（全員 0 点として扱います）`);
      continue;
    }

    const missing = [...roster].filter((id) => !forLab.has(id)).sort();
    if (missing.length > 0) {
      warnings.push(
        `${from}: 名簿にいる ${missing.length} 人の点数がありません（${list(missing)}）。` +
          `行が消えていないか確かめてください`
      );
    }

    const extra = [...forLab.keys()].filter((id) => !roster.has(id)).sort();
    if (extra.length > 0) {
      warnings.push(
        `${from}: 名簿に無い ${extra.length} 人の点数があります（${list(extra)}）。無視します`
      );
    }
  }
}

/** 数が多いときは頭だけ並べる。 */
function list(ids: readonly StudentId[], limit = 10): string {
  return ids.length <= limit
    ? ids.join("、")
    : `${ids.slice(0, limit).join("、")} ほか ${ids.length - limit} 人`;
}

/** Excel から来たならそのシート、CSV なら中身を読んで、行と列にする。 */
function rowsOf(file: SourceFile): string[][] {
  return file.rows ?? parseCsv(file.text);
}

/**
 * 研究室を、選択肢ラベル・研究室名・研究室 ID のどれからでも引けるようにする。
 *
 * e-class の希望順位ファイルは研究室を `○○研究室（○○　○○）` のような表示名で
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
    // 選択肢ラベルが `○○研究室（○○　○○）` なら、括弧の中は教員氏名のはず。
    // 教員氏名の列が無くても裁量点のファイルと繋がるように、それも鍵にする。
    if (row.teacher === undefined) add(inParentheses(row.label), row.id);
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
