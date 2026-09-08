/**
 * 抽選シードを入力データから導く。
 *
 * シードを人が選べると、結果を見てから選び直した疑いが残ります。入力データの
 * 関数にすれば誰も選んでいないので、選び方を疑う余地がありません。公開された
 * 入力ファイルから第三者が同じシードを計算できるので、「このシードを使った」と
 * 申告する必要すらなくなります。
 *
 * 副産物として、シードが入力データの指紋を兼ねます。保管したファイルで再実行して
 * 違うシードが出たら、データが変わっているということです。ただし 32bit なので、
 * 検出できるのは取り違えや壊れの類までで、改竄の証明にはなりません。
 *
 * 定員の自動配分はシードを使うので、**定員を決める前の入力**から取ります。
 * 指定された定員は入れますが、自動で決めた定員は入れません（循環するため）。
 */

import type { LabId, Student, StudentId } from "./types.js";

export interface SeedInputLab {
  id: LabId;
  /** ファイルで指定された定員。自動で決めるなら null */
  capacity: number | null;
  scores: ReadonlyMap<StudentId, number>;
}

export function seedFromInput(
  students: readonly Student[],
  labs: readonly SeedInputLab[]
): number {
  return fnv1a(canonical(students, labs));
}

/**
 * 入力を一つの文字列にまとめる。
 *
 * 学籍番号と研究室 ID を辞書順に整列してから並べるので、ファイルの行順や、
 * ファイルをどの順に落としたかには依りません。同じ中身なら同じシードになります。
 */
export function canonical(
  students: readonly Student[],
  labs: readonly SeedInputLab[]
): string {
  const lines: string[] = [];

  for (const student of [...students].sort((a, b) => compare(a.id, b.id))) {
    lines.push(`S\t${student.id}\t${student.gpa}\t${student.preferences.join(",")}`);
  }

  for (const lab of [...labs].sort((a, b) => compare(a.id, b.id))) {
    const scores = [...lab.scores]
      .sort(([a], [b]) => compare(a, b))
      .map(([id, score]) => `${id}:${score}`)
      .join(",");
    lines.push(`L\t${lab.id}\t${lab.capacity ?? "-"}\t${scores}`);
  }

  return lines.join("\n");
}

/**
 * FNV-1a（32bit）。
 *
 * 暗号学的な強さは要りません。ここで欲しいのは「入力が決まればシードが決まる」
 * ことと、どの実装でも同じ値になることだけです（誰でも再計算できるように）。
 */
function fnv1a(text: string): number {
  const bytes = new TextEncoder().encode(text);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    // × 16777619 を 32bit で。乗算が 2^53 を超えないよう分けて足す
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
