import { describe, expect, it } from "vitest";

import { completePreferences } from "../src/domain/preferences.js";
import { buildReport } from "../src/domain/report.js";
import { assign } from "../src/domain/solve.js";
import { defaultParams, type Instance, type Lab, type Params, type Student } from "../src/domain/types.js";

const labs: Lab[] = ["A", "B", "C", "D"].map((id) => ({
  id,
  capacity: 1,
  scores: new Map([
    ["s1", 30],
    ["s2", 30],
    ["s3", 30],
    ["s4", 30],
  ]),
}));

const students: Student[] = [
  { id: "s1", gpa: 3, preferences: ["B", "A"] },
  { id: "s2", gpa: 3, preferences: [] },
  { id: "s3", gpa: 3, preferences: ["A", "B", "C", "D"] },
  { id: "s4", gpa: 3, preferences: ["D"] },
];

describe("completePreferences", () => {
  const completed = completePreferences(students, labs, 20260907);

  it("順位を付けた研究室をそのままの順で上位に置く", () => {
    expect(completed.get("s1")!.slice(0, 2)).toEqual(["B", "A"]);
    expect(completed.get("s4")![0]).toBe("D");
  });

  it("残りの研究室を下位に足して全研究室を並べる", () => {
    for (const student of students) {
      const list = completed.get(student.id)!;
      expect(list).toHaveLength(labs.length);
      expect(new Set(list).size).toBe(labs.length);
    }
  });

  it("順位を一つも付けていない学生には全研究室を並べる", () => {
    expect(new Set(completed.get("s2")!)).toEqual(new Set(["A", "B", "C", "D"]));
  });

  it("もともと完全な表はそのまま", () => {
    expect(completed.get("s3")).toEqual(["A", "B", "C", "D"]);
  });

  it("同じシードなら同じ並びになる", () => {
    expect(completePreferences(students, labs, 20260907)).toEqual(completed);
  });

  it("入力の順序を変えても結果は変わらない", () => {
    const shuffled = [students[2]!, students[0]!, students[3]!, students[1]!];
    const reversed = [...labs].reverse();
    expect(completePreferences(shuffled, reversed, 20260907)).toEqual(completed);
  });

  it("シードを変えれば下位の並びは変わりうる", () => {
    const tails = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      tails.add(completePreferences(students, labs, seed).get("s4")!.join(","));
    }
    expect(tails.size).toBeGreaterThan(1);
  });
});

describe("希望が不完全なときの配属", () => {
  const instance: Instance = { students, labs };
  const params: Params = { ...defaultParams, seed: 20260907 };
  const report = buildReport(instance, assign(instance, params));

  it("定員が足りていれば、希望を出していない学生も配属される", () => {
    expect(report.summary.totalCapacity).toBe(4);
    expect(report.summary.unmatched).toBe(0);
  });

  it("自分で順位を付けていない研究室に入った学生を希望外として数える", () => {
    const blank = report.students.find((row) => row.id === "s2")!;
    expect(blank.lab).not.toBeNull();
    expect(blank.listed).toBe(false);
    expect(blank.choice).toBeNull();
    expect(report.summary.unlisted).toBeGreaterThanOrEqual(1);
  });

  it("希望外の配属をブロッキングペアとして数え上げない", () => {
    expect(report.summary.blockingPairs).toEqual([]);
  });

  it("希望順位の内訳は自分で付けた順位だけを数える", () => {
    const listed = report.students.filter((row) => row.listed).length;
    expect(report.summary.choiceCounts.reduce((a, b) => a + b, 0)).toBe(listed);
    expect(listed + report.summary.unlisted).toBe(report.summary.matched);
  });
});
