import { describe, expect, it } from "vitest";

import { assign } from "../src/domain/solve.js";
import { defaultParams, type Instance, type Params } from "../src/domain/types.js";
import { sampleInstance } from "../src/dev/sampleInstance.js";

const params: Params = { ...defaultParams, seed: 20260906 };

/** X は s2 を、Y は s1 を高く評価する。二人とも X が第 1 希望。 */
const instance: Instance = {
  students: [
    { id: "s1", gpa: 4.0, preferences: ["X", "Y"] },
    { id: "s2", gpa: 2.0, preferences: ["X", "Y"] },
  ],
  labs: [
    { id: "X", capacity: 1, scores: new Map([["s1", 0], ["s2", 60]]) },
    { id: "Y", capacity: 1, scores: new Map([["s1", 30], ["s2", 30]]) },
  ],
};

describe("assign", () => {
  it("研究室の点数の高い学生を優先して配属する", () => {
    // X での総合点は s1: 40+0=40, s2: 20+60=80
    const result = assign(instance, params);
    expect(result.studentToLab.get("s2")).toBe("X");
    expect(result.studentToLab.get("s1")).toBe("Y");
  });

  it("使ったシードを結果に残す", () => {
    expect(assign(instance, params).seed).toBe(params.seed);
  });

  it("定員が足りなければ未配属が出る", () => {
    const tight: Instance = {
      students: instance.students,
      labs: [{ id: "X", capacity: 1, scores: new Map([["s1", 0], ["s2", 60]]) }],
    };
    const result = assign(
      { students: tight.students.map((s) => ({ ...s, preferences: ["X"] })), labs: tight.labs },
      params
    );
    expect(result.studentToLab.get("s2")).toBe("X");
    expect(result.studentToLab.get("s1")).toBeUndefined();
  });

  it("希望に無い研究室を指していれば拒む", () => {
    const broken: Instance = {
      students: [{ id: "s1", gpa: 4, preferences: ["Z"] }],
      labs: instance.labs,
    };
    expect(() => assign(broken, params)).toThrow(/Z/);
  });

  it("同じシードなら何度解いても同じ結果になる", () => {
    const big = sampleInstance({ numStudents: 120, numLabs: 8, seed: 777 });
    const a = assign(big, params);
    const b = assign(big, params);
    expect([...a.studentToLab]).toEqual([...b.studentToLab]);
  });

  it("完全に同点なら、勝つ学生はシード次第で入れ替わる", () => {
    const tied: Instance = {
      students: [
        { id: "s1", gpa: 3.0, preferences: ["X"] },
        { id: "s2", gpa: 3.0, preferences: ["X"] },
      ],
      labs: [{ id: "X", capacity: 1, scores: new Map([["s1", 42], ["s2", 42]]) }],
    };
    const winners = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      winners.add(assign(tied, { ...params, seed }).labToStudents.get("X")![0]!);
    }
    expect(winners).toEqual(new Set(["s1", "s2"]));
  });
});
