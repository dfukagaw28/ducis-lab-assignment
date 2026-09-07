import { describe, expect, it } from "vitest";

import { tightCapacities } from "../src/domain/capacity.js";
import type { Student } from "../src/domain/types.js";

const labIds = ["A", "B", "C", "D"];

/** A を第 1 希望に挙げる学生が最も多く、次が B。 */
const students: Student[] = [
  { id: "s1", gpa: 3, preferences: ["A", "B", "C", "D"] },
  { id: "s2", gpa: 3, preferences: ["A", "C", "B", "D"] },
  { id: "s3", gpa: 3, preferences: ["A", "D", "B", "C"] },
  { id: "s4", gpa: 3, preferences: ["B", "A", "C", "D"] },
  { id: "s5", gpa: 3, preferences: ["B", "C", "A", "D"] },
  { id: "s6", gpa: 3, preferences: ["C", "A", "B", "D"] },
];

describe("tightCapacities", () => {
  it("合計がちょうど学生数になる", () => {
    for (let n = 1; n <= students.length; n++) {
      const seats = tightCapacities(students.slice(0, n), labIds, 1);
      expect([...seats.values()].reduce((a, b) => a + b, 0)).toBe(n);
    }
  });

  it("割り切れるときは全研究室が同じ定員", () => {
    const seats = tightCapacities(students.slice(0, 4), labIds, 1);
    expect([...seats.values()]).toEqual([1, 1, 1, 1]);
  });

  it("余った席を第 1 希望に挙げた学生の多い研究室に渡す", () => {
    // 学生 6 人 ÷ 研究室 4 室 = 1 余り 2 → A と B が 2 人
    const seats = tightCapacities(students, labIds, 1);
    expect(seats.get("A")).toBe(2);
    expect(seats.get("B")).toBe(2);
    expect(seats.get("C")).toBe(1);
    expect(seats.get("D")).toBe(1);
  });

  it("誰も挙げていない研究室には運が良くなければ渡らない", () => {
    // A だけを挙げる学生が 5 人。余りは 1 席で、それは A に行く
    const oneSided: Student[] = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`,
      gpa: 3,
      preferences: ["A"],
    }));
    const seats = tightCapacities(oneSided, labIds, 1);
    expect(seats.get("A")).toBe(2);
    expect([...seats.values()].reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("人気が並んだら乱数で決める", () => {
    // 誰も希望を出していないので、全研究室が同じ人気
    const blank: Student[] = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`,
      gpa: 3,
      preferences: [],
    }));
    const winners = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const seats = tightCapacities(blank, labIds, seed);
      winners.add([...seats].find(([, n]) => n === 2)![0]);
    }
    expect(winners.size).toBeGreaterThan(1);
  });

  it("同じシードなら同じ割り当てになる", () => {
    expect(tightCapacities(students, labIds, 7)).toEqual(tightCapacities(students, labIds, 7));
  });

  it("入力の順序を変えても結果は変わらない", () => {
    const shuffled = [...students].reverse();
    const reversed = [...labIds].reverse();
    expect(tightCapacities(shuffled, reversed, 7)).toEqual(tightCapacities(students, labIds, 7));
  });

  it("研究室が学生より多ければ、席は 0 の研究室が出る", () => {
    const seats = tightCapacities(students.slice(0, 2), labIds, 1);
    expect([...seats.values()].reduce((a, b) => a + b, 0)).toBe(2);
    expect([...seats.values()].filter((n) => n === 0)).toHaveLength(2);
  });
});
