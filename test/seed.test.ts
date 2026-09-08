import { describe, expect, it } from "vitest";

import { canonical, seedFromInput, type SeedInputLab } from "../src/domain/seed.js";
import type { Student } from "../src/domain/types.js";

const students: Student[] = [
  { id: "s2", gpa: 3.0, preferences: ["B", "A"] },
  { id: "s1", gpa: 2.5, preferences: ["A", "B"] },
];

const labs: SeedInputLab[] = [
  { id: "B", capacity: null, scores: new Map([["s1", 10], ["s2", 20]]) },
  { id: "A", capacity: 3, scores: new Map([["s2", 40], ["s1", 30]]) },
];

describe("seedFromInput", () => {
  it("同じ入力なら同じシードになる", () => {
    expect(seedFromInput(students, labs)).toBe(seedFromInput(students, labs));
  });

  it("入力の順序を変えても同じシードになる", () => {
    const shuffled = [...students].reverse();
    const reordered = [...labs].reverse();
    expect(seedFromInput(shuffled, reordered)).toBe(seedFromInput(students, labs));
  });

  it("裁量点の並び順にも依らない", () => {
    const resorted = labs.map((lab) => ({
      ...lab,
      scores: new Map([...lab.scores].reverse()),
    }));
    expect(seedFromInput(students, resorted)).toBe(seedFromInput(students, labs));
  });

  it("中身が変われば別のシードになる", () => {
    const gpaChanged = students.map((s) => (s.id === "s1" ? { ...s, gpa: 2.6 } : s));
    const prefChanged = students.map((s) => (s.id === "s1" ? { ...s, preferences: ["B", "A"] } : s));
    const scoreChanged = labs.map((lab) =>
      lab.id === "A" ? { ...lab, scores: new Map([...lab.scores, ["s1", 31]] as const) } : lab
    );
    const capacityChanged = labs.map((lab) => (lab.id === "A" ? { ...lab, capacity: 4 } : lab));

    const base = seedFromInput(students, labs);
    expect(seedFromInput(gpaChanged, labs)).not.toBe(base);
    expect(seedFromInput(prefChanged, labs)).not.toBe(base);
    expect(seedFromInput(students, scoreChanged)).not.toBe(base);
    expect(seedFromInput(students, capacityChanged)).not.toBe(base);
  });

  it("32bit の非負整数を返す", () => {
    const seed = seedFromInput(students, labs);
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});

describe("canonical", () => {
  it("学籍番号と研究室 ID を辞書順に並べる", () => {
    expect(canonical(students, labs)).toBe(
      [
        "S\ts1\t2.5\tA,B",
        "S\ts2\t3\tB,A",
        "L\tA\t3\ts1:30,s2:40",
        "L\tB\t-\ts1:10,s2:20",
      ].join("\n")
    );
  });
});
