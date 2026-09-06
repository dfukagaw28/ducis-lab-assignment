/**
 * 合成データ。実ファイルのパーサ (M3) ができるまでの、画面とテストの入力。
 *
 * 実データを置き換える段になったら消える。
 */

import { Pcg32Rng, permutation } from "hospital-resident-matching";
import type { Instance, Lab, Student } from "../domain/types.js";

export interface SampleOptions {
  numStudents: number;
  numLabs: number;
  seed: number;
  /** 定員の合計が学生数の何倍か */
  slack?: number;
}

export function sampleInstance({
  numStudents,
  numLabs,
  seed,
  slack = 1.1,
}: SampleOptions): Instance {
  const rng = new Pcg32Rng(seed);
  const labIds = Array.from({ length: numLabs }, (_, i) => `L${String(i + 1).padStart(2, "0")}`);

  const students: Student[] = Array.from({ length: numStudents }, (_, i) => {
    const order = permutation(rng, numLabs);
    return {
      id: `S${String(i + 1).padStart(3, "0")}`,
      name: `学生${i + 1}`,
      // 1.50 〜 4.00 を 0.01 刻みで
      gpa: Math.round((1.5 + rng.nextFloat() * 2.5) * 100) / 100,
      preferences: order.map((index) => labIds[index]!),
    };
  });

  const perLab = Math.ceil((numStudents * slack) / numLabs);
  const labs: Lab[] = labIds.map((id) => ({
    id,
    name: `${id} 研究室`,
    capacity: perLab,
    // 全学生に 0〜60 点。研究室ごとに独立
    scores: new Map(students.map((s) => [s.id, Math.floor(rng.nextFloat() * 61)])),
  }));

  return { students, labs };
}
