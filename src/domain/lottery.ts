/**
 * 同点処理に使う抽選番号。
 *
 * 学籍番号を辞書順に整列してからシード付きの乱数順列で並べ替えるので、入力
 * ファイルの行順を変えても、同じシードと同じ名簿からは同じ抽選結果が出る。
 * 番号は全研究室で共通に使う (single tie-breaking)。
 */

import { Pcg32Rng, permutation } from "hospital-resident-matching";
import type { StudentId } from "./types.js";

/** 学生ごとの抽選番号。0 が最も優先される。 */
export function drawLottery(
  studentIds: Iterable<StudentId>,
  seed: number
): Map<StudentId, number> {
  const sorted = [...studentIds].sort(compareIds);

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1] === sorted[i]) {
      throw new Error(`学籍番号 ${sorted[i]} が重複しています`);
    }
  }

  const order = permutation(new Pcg32Rng(seed), sorted.length);
  const lottery = new Map<StudentId, number>();
  order.forEach((index, number) => lottery.set(sorted[index]!, number));
  return lottery;
}

/** 辞書順。ロケールに依らせないため、あえて localeCompare を使わない。 */
function compareIds(a: StudentId, b: StudentId): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
