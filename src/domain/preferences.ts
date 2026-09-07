/**
 * 希望順位表を全研究室に広げる。
 *
 * 学生が順位を付けた研究室をそのまま上位に置き、残りをランダムに並べて下に付ける。
 * 一つも順位を付けなかった学生（全部未解答など）は、全研究室がランダムな順になる。
 *
 * これで全員が全研究室を順位づけした形になるので、定員の合計が学生数以上なら
 * 未配属は出ない。ただし希望外に配属された学生は結果で区別できるようにしてある
 * （report.ts の `listed`）。
 *
 * 乱数はシードから決まるので、同じシードなら同じ並びになる。学籍番号と研究室を
 * 辞書順に整列してから引くので、入力ファイルの行順にも依らない。
 *
 * これはライブラリの `tieLast` と同じ考え方で、`HospitalResident.setTieLast()` と
 * `residentPrefsCompleted()` が作る表と同じものを作っている。それを使わず自前で
 * 持っているのは三つの理由による。
 *
 * - `tieLast` は添字で組まれた `HospitalResident` の機能で、`stableMatch` には無い。
 *   使うには学生と研究室を添字に直し、結果を名前に戻すことになる。
 * - `setTieLast` のシャッフルは学生の添字順に乱数を消費するので、入力ファイルの
 *   行順で結果が変わる。
 * - `HospitalResident.solve()` は研究室側の選好リストが完全であることを前提に
 *   している。載っていない学生の順位は -1 で、それが最上位として扱われるため、
 *   `missingScore: "unacceptable"` で受け入れ不可にした学生が逆に最優先になる。
 *   `stableMatch` は相互に載っていることを求めるので、この問題は無い。
 */

import { Pcg32Rng, permutation } from "hospital-resident-matching";

import type { Lab, LabId, Student, StudentId } from "./types.js";

/**
 * 補完に使う乱数の種を、抽選の種からずらす幅。
 *
 * 同じ種から二つの流れを引くと、抽選の結果と補完の結果が同じ乱数列を辿ることに
 * なるので、別の流れにしておく。
 */
const STREAM_OFFSET = 1;

export function completePreferences(
  students: readonly Student[],
  labs: readonly Lab[],
  seed: number
): Map<StudentId, LabId[]> {
  const rng = new Pcg32Rng(seed + STREAM_OFFSET);
  const labIds = labs.map((lab) => lab.id).sort(compare);

  const completed = new Map<StudentId, LabId[]>();
  for (const student of [...students].sort((a, b) => compare(a.id, b.id))) {
    const listed = new Set<LabId>(student.preferences);
    const rest = labIds.filter((id) => !listed.has(id));
    const order = permutation(rng, rest.length);
    completed.set(student.id, [...student.preferences, ...order.map((i) => rest[i]!)]);
  }
  return completed;
}

/** 辞書順。ロケールに依らせないため、あえて localeCompare を使わない。 */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
