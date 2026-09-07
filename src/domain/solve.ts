/**
 * 配属の計算。抽選 → 研究室の選好リスト → 安定マッチング。
 *
 * `stableMatch()` は学生側最適の受入保留アルゴリズムなので、学生にとっては
 * 希望を正直に出すのが最適戦略になる。
 */

import { stableMatch, type Hospital, type Resident } from "hospital-resident-matching";

import { drawLottery } from "./lottery.js";
import { completedPreferences, drawPreferenceRest } from "./preferences.js";
import { rankAll, type ScoredStudent } from "./score.js";
import type { Instance, LabId, Params, StudentId } from "./types.js";

export interface Assignment {
  /** 再現に必要なので、使ったシードをそのまま持つ */
  seed: number;
  /** 配属先。未配属なら undefined */
  studentToLab: Map<StudentId, LabId | undefined>;
  /** 研究室に配属された学生。選好の高い順 */
  labToStudents: Map<LabId, StudentId[]>;
  lottery: Map<StudentId, number>;
  /**
   * 学生が順位を付けなかった研究室を、補完のために並べたもの。
   * 学生自身の表と繋ぐと、実際に解くのに使った表になる（completedPreferences）。
   */
  preferenceRest: Map<StudentId, LabId[]>;
  /** 研究室ごとの、点数をつけて並べた全学生 */
  rankings: Map<LabId, ScoredStudent[]>;
}

export function assign(instance: Instance, params: Params): Assignment {
  const { students, labs } = instance;

  const labIds = new Set(labs.map((lab) => lab.id));
  for (const student of students) {
    for (const labId of student.preferences) {
      if (!labIds.has(labId)) {
        throw new Error(`学生 ${student.id} の希望にない研究室 ${labId} があります`);
      }
    }
  }

  const lottery = drawLottery(
    students.map((student) => student.id),
    params.seed
  );
  const rankings = rankAll(labs, students, params, lottery);

  // 順位を付けなかった研究室はランダムに並べて下に付ける
  const preferenceRest = drawPreferenceRest(students, labs, params.seed);

  const residents: Resident[] = students.map((student) => ({
    id: student.id,
    preferences: completedPreferences(student.preferences, preferenceRest.get(student.id)),
  }));
  const hospitals: Hospital[] = labs.map((lab) => ({
    id: lab.id,
    capacity: lab.capacity,
    preferences: rankings.get(lab.id)!.map((scored) => scored.id),
  }));

  const result = stableMatch(residents, hospitals);

  return {
    seed: params.seed,
    studentToLab: new Map(students.map((s) => [s.id, result.residents[s.id]])),
    labToStudents: new Map(labs.map((lab) => [lab.id, result.hospitals[lab.id] ?? []])),
    lottery,
    preferenceRest,
    rankings,
  };
}
