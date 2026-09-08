/**
 * 希望順位表を全研究室に広げる。
 *
 * 学生が順位を付けた研究室をそのまま上位に置き、残りをランダムに並べて下に付ける。
 * 一つも順位を付けなかった学生（全部未解答など）は、全研究室がランダムな順になる。
 *
 * 持つのは足した分だけで、繋いだ表は必要なところで作る。学生自身の表は
 * `Student.preferences` にあるので、繋いだ表を持つとそれを二重に抱えることに
 * なるうえ、どこまでが学生の書いた分なのかが表から読めなくなる。ライブラリが
 * `residentPrefs` と `residentPrefsRest` を分けて持ち、`residentPrefsCompleted()`
 * で繋ぐのと同じ形。
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
 * 持っているのは二つの理由による。
 *
 * - `tieLast` は添字で組まれた `HospitalResident` の機能で、`stableMatch` には無い。
 *   使うには学生と研究室を添字に直し、結果を名前に戻すことになる。
 * - `setTieLast` のシャッフルは学生の添字順に乱数を消費するので、入力ファイルの
 *   行順で結果が変わる。
 *
 * もう一つ、`HospitalResident.solve()` は研究室側の選好リストが完全であることを
 * 前提にしている（載っていない学生の順位が -1 で、それが最上位として扱われる）。
 * いまは全学生がどの研究室の並びにも載るので実害は無いが、乗り換えるなら踏む前に
 * 知っておくべき穴ではある。`stableMatch` は相互に載っていることを求めるので、
 * この問題は無い。
 */

import { Pcg32Rng, permutation } from "hospital-resident-matching";

import { STREAM, streamSeed } from "./streams.js";
import type { Lab, LabId, Student, StudentId } from "./types.js";

/**
 * 学生ごとに、順位を付けなかった研究室をランダムに並べたもの。
 *
 * ライブラリの `residentPrefsRest` にあたる。
 */
export function drawPreferenceRest(
  students: readonly Student[],
  labs: readonly Lab[],
  seed: number
): Map<StudentId, LabId[]> {
  const rng = new Pcg32Rng(streamSeed(seed, STREAM.preferenceRest));
  const labIds = labs.map((lab) => lab.id).sort(compare);

  const drawn = new Map<StudentId, LabId[]>();
  for (const student of [...students].sort((a, b) => compare(a.id, b.id))) {
    const listed = new Set<LabId>(student.preferences);
    const rest = labIds.filter((id) => !listed.has(id));
    const order = permutation(rng, rest.length);
    drawn.set(
      student.id,
      order.map((i) => rest[i]!)
    );
  }
  return drawn;
}

/**
 * 学生が書いた表と、足した分を繋いだ、実際に解くのに使う表。
 *
 * ライブラリの `residentPrefsCompleted()` にあたる。
 */
export function completedPreferences(
  preferences: readonly LabId[],
  rest: readonly LabId[] = []
): LabId[] {
  return [...preferences, ...rest];
}

/** 辞書順。ロケールに依らせないため、あえて localeCompare を使わない。 */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
