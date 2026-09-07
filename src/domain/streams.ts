/**
 * シードから引く乱数の流れ。
 *
 * 用途ごとに種をずらして、別々の列を辿るようにする。同じ種から二つ引くと、
 * 抽選の結果と補完の結果が同じ乱数列に乗ってしまう。
 */

/** 用途ごとの、シードからのずらし幅。 */
export const STREAM = {
  /** 同点処理の抽選番号 */
  lottery: 0,
  /** 順位を付けなかった研究室の並べ方 */
  preferenceRest: 1,
  /** 定員の余り一席をどの研究室に渡すか */
  capacity: 2,
} as const;

export type Stream = (typeof STREAM)[keyof typeof STREAM];

export function streamSeed(seed: number, stream: Stream): number {
  return seed + stream;
}
