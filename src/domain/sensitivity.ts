/**
 * 抽選シードを振り直して、結果がどれだけぶれるかを見る。
 *
 * 同点は抽選で崩し、順位を付けなかった研究室はランダムに並べる。つまりシードは
 * 配属を左右する。左右の幅がどれくらいかは、結果を確定する前に知っておきたい。
 *
 * - ほとんど変わらない → 点数で決まっている。抽選は形式的なもの
 * - 何人も入れ替わる → 同点が多く、抽選が実質的に配属を決めている
 *
 * 後者なら、点数の付け方（配点や裁量点の刻み）を見直す判断材料になる。
 *
 * 定員は今の値のまま動かさない。定員の指定が無くて自動で決めた場合、それもシード
 * 次第で変わるが、ここで見たいのは「同じ土俵で抽選だけが変わったら」なので、
 * 土俵の方は固定する。
 */

import { Pcg32Rng } from "hospital-resident-matching";

import { assign, type Assignment } from "./solve.js";
import { STREAM, streamSeed } from "./streams.js";
import type { Instance, LabId, Params, StudentId } from "./types.js";

export interface StudentSpread {
  id: StudentId;
  /** 今の結果と同じ研究室になった割合（0〜1） */
  agreement: number;
  /** 行き先ごとの回数。多い順 */
  destinations: Array<{ lab: LabId | null; count: number }>;
}

export interface Sensitivity {
  runs: number;
  /** 今の結果と配属先が変わらなかった学生の数（全 runs で一致） */
  settled: number;
  /** 1 回あたり、今の結果と配属先が違った学生の数の平均 */
  averageChanged: number;
  /** 第 1 希望に入れた人数の、最小・平均・最大 */
  firstChoice: { min: number; mean: number; max: number };
  /** 配属先がぶれた学生。ぶれの大きい順 */
  unsettled: StudentSpread[];
}

/** 試行回数の上限。これ以上は待ち時間に見合わない。 */
export const MAX_RUNS = 1000;

export function measureSensitivity(
  instance: Instance,
  params: Params,
  baseline: Assignment,
  runs: number
): Sensitivity {
  if (runs < 1 || runs > MAX_RUNS) {
    throw new Error(`試行回数は 1〜${MAX_RUNS} の範囲で指定してください`);
  }

  // 振り直しのシードも、今のシードから決める（同じシードなら同じ分析結果になる）
  const seeds = new Pcg32Rng(streamSeed(params.seed, STREAM.sensitivity)).nextUint32Bulk(runs);

  const destinations = new Map<StudentId, Map<LabId | null, number>>(
    instance.students.map((student) => [student.id, new Map<LabId | null, number>()])
  );
  const firstChoices: number[] = [];
  let changedTotal = 0;

  for (const seed of seeds) {
    const result = assign(instance, { ...params, seed });

    let changed = 0;
    let firstChoice = 0;
    for (const student of instance.students) {
      const lab = result.studentToLab.get(student.id) ?? null;
      const counts = destinations.get(student.id)!;
      counts.set(lab, (counts.get(lab) ?? 0) + 1);

      if (lab !== (baseline.studentToLab.get(student.id) ?? null)) changed++;
      if (lab !== null && student.preferences[0] === lab) firstChoice++;
    }
    changedTotal += changed;
    firstChoices.push(firstChoice);
  }

  const spreads: StudentSpread[] = instance.students.map((student) => {
    const counts = destinations.get(student.id)!;
    const here = baseline.studentToLab.get(student.id) ?? null;
    return {
      id: student.id,
      agreement: (counts.get(here) ?? 0) / runs,
      destinations: [...counts]
        .map(([lab, count]) => ({ lab, count }))
        .sort((a, b) => b.count - a.count),
    };
  });

  return {
    runs,
    settled: spreads.filter((spread) => spread.agreement === 1).length,
    averageChanged: changedTotal / runs,
    firstChoice: {
      min: Math.min(...firstChoices),
      mean: firstChoices.reduce((a, b) => a + b, 0) / runs,
      max: Math.max(...firstChoices),
    },
    unsettled: spreads
      .filter((spread) => spread.agreement < 1)
      .sort((a, b) => a.agreement - b.agreement || (a.id < b.id ? -1 : 1)),
  };
}
