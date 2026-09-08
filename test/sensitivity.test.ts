import { describe, expect, it } from "vitest";

import { measureSensitivity, MAX_RUNS } from "../src/domain/sensitivity.js";
import { assign } from "../src/domain/solve.js";
import { defaultParams, type Instance, type Params } from "../src/domain/types.js";

const params: Params = { ...defaultParams, seed: 20260908 };

/** 点差がはっきりしていて、全員が全研究室に順位を付けた場合。 */
const decided: Instance = {
  students: [
    { id: "s1", gpa: 4.0, preferences: ["X", "Y"] },
    { id: "s2", gpa: 3.0, preferences: ["X", "Y"] },
    { id: "s3", gpa: 2.0, preferences: ["X", "Y"] },
    { id: "s4", gpa: 1.0, preferences: ["X", "Y"] },
  ],
  labs: [
    // 裁量点は一律。GPA だけで差が付くので、どの研究室でも順位は s1 > s2 > s3 > s4
    { id: "X", capacity: 2, scores: new Map([["s1", 10], ["s2", 10], ["s3", 10], ["s4", 10]]) },
    { id: "Y", capacity: 2, scores: new Map([["s1", 0], ["s2", 0], ["s3", 0], ["s4", 0]]) },
  ],
};

/** 二人が完全に同点で、席は一つ。 */
const tied: Instance = {
  students: [
    { id: "s1", gpa: 3.0, preferences: ["X", "Y"] },
    { id: "s2", gpa: 3.0, preferences: ["X", "Y"] },
  ],
  labs: [
    { id: "X", capacity: 1, scores: new Map([["s1", 42], ["s2", 42]]) },
    { id: "Y", capacity: 1, scores: new Map([["s1", 0], ["s2", 0]]) },
  ],
};

describe("measureSensitivity", () => {
  it("点数で決まっているなら、シードを変えても動かない", () => {
    const baseline = assign(decided, params);
    const result = measureSensitivity(decided, params, baseline, 50);

    expect(result.runs).toBe(50);
    expect(result.settled).toBe(decided.students.length);
    expect(result.averageChanged).toBe(0);
    expect(result.unsettled).toEqual([]);
  });

  it("同点なら、抽選が配属を決めていることが見える", () => {
    const baseline = assign(tied, params);
    const result = measureSensitivity(tied, params, baseline, 200);

    expect(result.settled).toBe(0);
    expect(result.unsettled).toHaveLength(2);
    // 二人とも半々くらいで入れ替わる
    for (const spread of result.unsettled) {
      expect(spread.agreement).toBeGreaterThan(0.3);
      expect(spread.agreement).toBeLessThan(0.7);
      expect(spread.destinations.map((entry) => entry.lab).sort()).toEqual(["X", "Y"]);
    }
    // 1 回あたり 2 人とも入れ替わるか、2 人とも同じか
    expect(result.averageChanged).toBeGreaterThan(0.5);
    expect(result.averageChanged).toBeLessThan(1.5);
  });

  it("第 1 希望に入れた人数の幅を出す", () => {
    const baseline = assign(tied, params);
    const result = measureSensitivity(tied, params, baseline, 100);
    // 席が一つなので、第 1 希望に入れるのは常に 1 人
    expect(result.firstChoice).toEqual({ min: 1, mean: 1, max: 1 });
  });

  it("同じシードなら同じ分析結果になる", () => {
    const baseline = assign(tied, params);
    expect(measureSensitivity(tied, params, baseline, 50)).toEqual(
      measureSensitivity(tied, params, baseline, 50)
    );
  });

  it("シードを変えれば分析結果も変わりうる", () => {
    const baseline = assign(tied, params);
    const a = measureSensitivity(tied, params, baseline, 50);
    const b = measureSensitivity(tied, { ...params, seed: params.seed + 100 }, baseline, 50);
    expect(a.unsettled[0]!.agreement).not.toBe(b.unsettled[0]!.agreement);
  });

  it("行き先の内訳は多い順に並べる", () => {
    const baseline = assign(tied, params);
    const spread = measureSensitivity(tied, params, baseline, 100).unsettled[0]!;
    const counts = spread.destinations.map((entry) => entry.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("回数が範囲外なら断る", () => {
    const baseline = assign(tied, params);
    expect(() => measureSensitivity(tied, params, baseline, 0)).toThrow(/1〜/);
    expect(() => measureSensitivity(tied, params, baseline, MAX_RUNS + 1)).toThrow(/1〜/);
  });
});
