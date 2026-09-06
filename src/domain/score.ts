/**
 * 総合点の計算と、そこから研究室の選好リストを作る処理。
 *
 * 総合点は「GPA 点 + 教員裁量点」で、GPA 点は全研究室で共通、裁量点は研究室ごと。
 * 研究室の選好は総合点の降順、同点なら抽選番号の小さい順。
 *
 * 総合点の水準を研究室どうしで揃える必要はない。マッチングが使うのは研究室の
 * 中での順序だけなので、ある研究室が全員に高い裁量点を付けても結果は変わらない。
 */

import type { Lab, LabId, Params, Student, StudentId } from "./types.js";

export interface ScoredStudent {
  id: StudentId;
  gpaPoint: number;
  discretionaryPoint: number;
  total: number;
  lottery: number;
}

/** 学生 s の GPA 点（全研究室で共通）。 */
export function gpaPoint(student: Student, params: Params): number {
  if (params.gpaMax <= 0) throw new Error("gpaMax は正の数でなければなりません");
  return (student.gpa / params.gpaMax) * params.gpaWeight;
}

/**
 * 研究室 lab における学生の並び。総合点の降順、同点なら抽選番号の昇順。
 *
 * 裁量点が無い学生は、missingScore が "unacceptable" なら並びから外れる
 * （その研究室に配属されない）。
 */
export function rankStudents(
  lab: Lab,
  students: readonly Student[],
  params: Params,
  lottery: ReadonlyMap<StudentId, number>
): ScoredStudent[] {
  if (params.discretionaryMax <= 0) {
    throw new Error("discretionaryMax は正の数でなければなりません");
  }

  const scored: ScoredStudent[] = [];
  for (const student of students) {
    const raw = lab.scores.get(student.id);
    if (raw === undefined && params.missingScore === "unacceptable") continue;

    const number = lottery.get(student.id);
    if (number === undefined) {
      throw new Error(`学生 ${student.id} の抽選番号がありません`);
    }

    const gpa = gpaPoint(student, params);
    const discretionary = ((raw ?? 0) / params.discretionaryMax) * params.discretionaryWeight;
    scored.push({
      id: student.id,
      gpaPoint: gpa,
      discretionaryPoint: discretionary,
      total: gpa + discretionary,
      lottery: number,
    });
  }

  scored.sort((a, b) => b.total - a.total || a.lottery - b.lottery);
  return scored;
}

/** 研究室ごとの並びを一度に作る。 */
export function rankAll(
  labs: readonly Lab[],
  students: readonly Student[],
  params: Params,
  lottery: ReadonlyMap<StudentId, number>
): Map<LabId, ScoredStudent[]> {
  return new Map(labs.map((lab) => [lab.id, rankStudents(lab, students, params, lottery)]));
}
