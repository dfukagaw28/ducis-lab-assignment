/** 配属結果の集計と、安定性の自己検査。 */

import { completedPreferences } from "./preferences.js";
import type { Assignment } from "./solve.js";
import type { Instance, LabId, StudentId } from "./types.js";

export interface StudentRow {
  id: StudentId;
  name?: string;
  gpa: number;
  lottery: number;
  /** 配属先。未配属なら null */
  lab: LabId | null;
  /** 第何希望か。自分で順位を付けていない研究室に配属されたか、未配属なら null */
  choice: number | null;
  /** 配属先が学生自身の希望順位表にあったか */
  listed: boolean;
  /** 配属先での総合点。未配属なら null */
  total: number | null;
  /**
   * 配属先の研究室が付けた順位（1 始まり、その研究室が点を付けた全学生の中で）。
   * 「配属された学生の中で何番目か」ではない。未配属なら null。
   */
  rankInLab: number | null;
}

export interface LabRow {
  id: LabId;
  name?: string;
  capacity: number;
  filled: number;
  students: StudentId[];
  /**
   * 希望を出した学生にとっての合格ライン。ここを下回った提出者は入れなかった。
   *
   * 出せるのは、定員が埋まっていて、かつ埋めているのが全員提出者のときだけ。
   * 空きがあるか、未提出者が入っているなら、その研究室を希望した提出者は全員
   * 入れたということなので、線は無い（null）。
   *
   * 安定マッチングの性質から、この線は「下回った提出者は入れなかった」と同時に
   * 「上回った提出者は入れた（か、もっと上の希望に入った）」も意味する。
   */
  cutoff: number | null;
}

export interface BlockingPair {
  student: StudentId;
  lab: LabId;
}

export interface Summary {
  seed: number;
  numStudents: number;
  numLabs: number;
  totalCapacity: number;
  matched: number;
  unmatched: number;
  /** choiceCounts[k] は第 k+1 希望に配属された人数 */
  choiceCounts: number[];
  /** 自分で順位を付けていない研究室に配属された人数 */
  unlisted: number;
  blockingPairs: BlockingPair[];
}

export interface Report {
  summary: Summary;
  students: StudentRow[];
  labs: LabRow[];
}

export function buildReport(instance: Instance, assignment: Assignment): Report {
  const positions = rankPositions(assignment);

  const students: StudentRow[] = instance.students.map((student) => {
    const lab = assignment.studentToLab.get(student.id) ?? null;
    const scored =
      lab === null
        ? undefined
        : assignment.rankings.get(lab)!.find((entry) => entry.id === student.id);
    // 希望順位は学生が自分で付けた表で数える。補完で足した研究室は「希望外」。
    const choice = lab === null ? -1 : student.preferences.indexOf(lab);
    return {
      id: student.id,
      ...(student.name === undefined ? {} : { name: student.name }),
      gpa: student.gpa,
      lottery: assignment.lottery.get(student.id)!,
      lab,
      choice: choice < 0 ? null : choice + 1,
      listed: choice >= 0,
      total: scored?.total ?? null,
      rankInLab: lab === null ? null : positions.get(lab)!.get(student.id)! + 1,
    };
  });

  // 表示と書き出しの並び。研究室ごとにまとめ、研究室の中は学生 ID 順。未配属は最後。
  // 抽選や補完が学籍番号を並べるのと同じ辞書順で揃えてある。
  const labOrder = new Map(instance.labs.map((lab, index) => [lab.id, index]));
  const placeOf = (row: StudentRow): number =>
    row.lab === null ? instance.labs.length : labOrder.get(row.lab)!;
  students.sort((a, b) => placeOf(a) - placeOf(b) || compareIds(a.id, b.id));

  const labs: LabRow[] = instance.labs.map((lab) => {
    const assigned = assignment.labToStudents.get(lab.id) ?? [];
    const scored = new Map(assignment.rankings.get(lab.id)!.map((entry) => [entry.id, entry]));
    const placed = assigned.map((id) => scored.get(id)!);

    const full = lab.capacity > 0 && assigned.length >= lab.capacity;
    const allSubmitted = placed.every((entry) => entry.submitted);
    const cutoff =
      full && allSubmitted && placed.length > 0
        ? Math.min(...placed.map((entry) => entry.total))
        : null;

    return {
      id: lab.id,
      ...(lab.name === undefined ? {} : { name: lab.name }),
      capacity: lab.capacity,
      filled: assigned.length,
      students: assigned,
      cutoff,
    };
  });

  const longest = instance.students.reduce((max, s) => Math.max(max, s.preferences.length), 0);
  const choiceCounts = new Array<number>(longest).fill(0);
  for (const row of students) {
    if (row.choice !== null) choiceCounts[row.choice - 1]! += 1;
  }

  const matched = students.filter((row) => row.lab !== null).length;

  return {
    summary: {
      seed: assignment.seed,
      numStudents: instance.students.length,
      numLabs: instance.labs.length,
      totalCapacity: instance.labs.reduce((sum, lab) => sum + lab.capacity, 0),
      matched,
      unmatched: students.length - matched,
      choiceCounts,
      unlisted: students.filter((row) => row.lab !== null && !row.listed).length,
      blockingPairs: findBlockingPairs(instance, assignment, positions),
    },
    students,
    labs,
  };
}

/**
 * ブロッキングペアを探す。安定マッチングなら空になるはずで、空でなければ
 * 実装かデータの取り違えを疑う。
 *
 * 学生 s と研究室 h がブロッキングペアなのは、s が今の配属先より h を好み、かつ
 * h に空きがあるか h が今抱えている誰かより s を好むとき。
 *
 * 学生の好みは、解くのに使った（全研究室まで広げた）順位表で見る。学生が自分で
 * 順位を付けた分だけで見ると、希望外に配属された学生がすべての研究室を今より
 * 好むことになり、ありもしないブロッキングペアが並ぶ。
 */
export function findBlockingPairs(
  instance: Instance,
  assignment: Assignment,
  positions = rankPositions(assignment)
): BlockingPair[] {
  const capacities = new Map(instance.labs.map((lab) => [lab.id, lab.capacity]));
  const pairs: BlockingPair[] = [];

  for (const student of instance.students) {
    const preferences = completedPreferences(
      student.preferences,
      assignment.preferenceRest.get(student.id)
    );
    const current = assignment.studentToLab.get(student.id);
    // 未配属ならどの希望も今より良い
    const currentChoice =
      current === undefined ? preferences.length : preferences.indexOf(current);

    for (let i = 0; i < currentChoice; i++) {
      const labId = preferences[i]!;
      const rank = positions.get(labId)?.get(student.id);
      if (rank === undefined) continue; // その研究室にとって受け入れ不可

      const assigned = assignment.labToStudents.get(labId) ?? [];
      if (assigned.length < capacities.get(labId)!) {
        pairs.push({ student: student.id, lab: labId });
        continue;
      }
      const worst = assigned.reduce(
        (max, id) => Math.max(max, positions.get(labId)!.get(id) ?? -1),
        -1
      );
      if (rank < worst) pairs.push({ student: student.id, lab: labId });
    }
  }

  return pairs;
}

/** 辞書順。ロケールに依らせないため、あえて localeCompare を使わない。 */
function compareIds(a: StudentId, b: StudentId): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 研究室ごとの、学生の選好順位（0 始まり）。受け入れ不可の学生は載らない。 */
export function rankPositions(assignment: Assignment): Map<LabId, Map<StudentId, number>> {
  return new Map(
    [...assignment.rankings].map(([labId, scored]) => [
      labId,
      new Map(scored.map((entry, position) => [entry.id, position])),
    ])
  );
}
