/**
 * 定員が指定されていないときの割り当て。
 *
 * 合計をちょうど学生数にする。全研究室に「学生数 ÷ 研究室数」の切り捨てを配り、
 * 余った席を一つずつ、希望の多い研究室から渡す。多いとは、第 1 希望に挙げた学生が
 * 多いこと、それが同数なら第 2 希望に挙げた学生が多いこと、以下同様。それでも
 * 並ばなければ乱数で決める。
 *
 * ライブラリの `HospitalResident.setCapacities(-1, true)`（tight）と同じ方式で、
 * 人気を数える `popularityKeys` と、鍵を比べる `compareKeys` はそのまま借りている。
 *
 * 数えるのは学生が自分で書いた希望順位表。補完で足した分まで数えると、誰も挙げて
 * いない研究室が人気であるかのように見えてしまう。
 */

import { compareKeys, Pcg32Rng, popularityKeys } from "hospital-resident-matching";

import { STREAM, streamSeed } from "./streams.js";
import type { LabId, Student } from "./types.js";

export function tightCapacities(
  students: readonly Student[],
  labIds: readonly LabId[],
  seed: number
): Map<LabId, number> {
  const numLabs = labIds.length;
  if (numLabs === 0) throw new Error("研究室がありません");

  // 研究室の番号は辞書順に振る。入力ファイルの行順に依らせないため。
  const sorted = [...labIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const numberOf = new Map(sorted.map((id, index) => [id, index]));

  const numStudents = students.length;
  const base = Math.floor(numStudents / numLabs);
  const spare = numStudents - numLabs * base;
  const seats = new Array<number>(numLabs).fill(base);

  if (spare > 0) {
    const prefs = students.map((student) =>
      student.preferences.map((id) => numberOf.get(id)).filter((n): n is number => n !== undefined)
    );
    const popularity = popularityKeys(prefs, numLabs);
    const draw = new Pcg32Rng(streamSeed(seed, STREAM.capacity)).nextUint32Bulk(numLabs);

    const order = Array.from({ length: numLabs }, (_, lab) => lab).sort(
      (a, b) => compareKeys(popularity[a]!, popularity[b]!) || draw[a]! - draw[b]!
    );
    for (let i = 0; i < spare; i++) seats[order[i]!]! += 1;
  }

  return new Map(sorted.map((id, index) => [id, seats[index]!]));
}
