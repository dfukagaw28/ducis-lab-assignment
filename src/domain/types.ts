/** 正規化されたデータモデル。パーサ層が組み立て、ドメイン層が読む。 */

export type StudentId = string;
export type LabId = string;

export interface Student {
  /** 学籍番号 */
  id: StudentId;
  name?: string;
  /** 換算前の素点 */
  gpa: number;
  /** 第1希望から順に並べた研究室 */
  preferences: readonly LabId[];
}

export interface Lab {
  id: LabId;
  name?: string;
  capacity: number;
  /** 教員裁量点（素点）。載っていない学生の扱いは Params で決める。 */
  scores: ReadonlyMap<StudentId, number>;
}

export interface Instance {
  students: readonly Student[];
  labs: readonly Lab[];
}

/** 裁量点ファイルに載っていない学生をどう扱うか。 */
export type MissingScorePolicy =
  /** 0 点として扱う（その研究室に配属されうる） */
  | "zero"
  /** 受け入れ不可として扱う（その研究室には配属されない） */
  | "unacceptable";

export interface Params {
  /** 同点処理の抽選に使う。結果に必ず記録する。 */
  seed: number;
  /** GPA の配点（既定 40 点） */
  gpaWeight: number;
  /** GPA の素点の満点。gpa / gpaMax * gpaWeight で換算する。 */
  gpaMax: number;
  /** 教員裁量点の配点（既定 60 点） */
  discretionaryWeight: number;
  /** 教員裁量点の素点の満点 */
  discretionaryMax: number;
  missingScore: MissingScorePolicy;
}

/** 32 bit の乱数シード。ページ読み込みごとに引き直す。 */
export function randomSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0]!;
}

export const defaultParams: Omit<Params, "seed"> = {
  gpaWeight: 40,
  gpaMax: 4,
  discretionaryWeight: 60,
  discretionaryMax: 60,
  missingScore: "zero",
};
