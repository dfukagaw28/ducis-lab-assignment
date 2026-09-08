import { describe, expect, it } from "vitest";

import { gpaPoint, rankStudents } from "../src/domain/score.js";
import { defaultParams, type Lab, type Params, type Student } from "../src/domain/types.js";

const params: Params = { ...defaultParams, seed: 0 };

const students: Student[] = [
  { id: "a", gpa: 4.0, preferences: ["L"] },
  { id: "b", gpa: 2.0, preferences: ["L"] },
  { id: "c", gpa: 3.0, preferences: ["L"] },
];

function lab(scores: Record<string, number>): Lab {
  return { id: "L", capacity: 1, scores: new Map(Object.entries(scores)) };
}

describe("gpaPoint", () => {
  it("素点を配点に換算する", () => {
    expect(gpaPoint({ id: "x", gpa: 4, preferences: [] }, params)).toBe(40);
    expect(gpaPoint({ id: "x", gpa: 2, preferences: [] }, params)).toBe(20);
  });
});

describe("rankStudents", () => {
  const lottery = new Map([
    ["a", 2],
    ["b", 0],
    ["c", 1],
  ]);

  it("総合点の降順に並べる", () => {
    // a: 40 + 0 = 40, b: 20 + 60 = 80, c: 30 + 30 = 60
    const ranked = rankStudents(lab({ a: 0, b: 60, c: 30 }), students, params, lottery);
    expect(ranked.map((entry) => entry.id)).toEqual(["b", "c", "a"]);
    expect(ranked.map((entry) => entry.total)).toEqual([80, 60, 40]);
  });

  it("同点は抽選番号の小さい方を先にする", () => {
    // a: 40 + 20 = 60, b: 20 + 40 = 60, c: 30 + 30 = 60 の三つ巴
    const ranked = rankStudents(lab({ a: 20, b: 40, c: 30 }), students, params, lottery);
    expect(ranked.map((entry) => entry.id)).toEqual(["b", "c", "a"]);
  });

  it("裁量点が無い学生は既定では 0 点として並びに入る", () => {
    const ranked = rankStudents(lab({ a: 0, b: 60 }), students, params, lottery);
    expect(ranked.map((entry) => entry.id)).toContain("c");
    expect(ranked.find((entry) => entry.id === "c")!.discretionaryPoint).toBe(0);
  });

  it("unacceptable なら裁量点が無い学生を並びから外す", () => {
    const strict: Params = { ...params, missingScore: "unacceptable" };
    const ranked = rankStudents(lab({ a: 0, b: 60 }), students, strict, lottery);
    expect(ranked.map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("希望順位を出していない学生を、点数にかかわらず後ろに置く", () => {
    // b は最高点だが希望を一つも出していない
    const withAbsent: Student[] = [
      { id: "a", gpa: 4.0, preferences: ["L"] },
      { id: "b", gpa: 2.0, preferences: [] },
      { id: "c", gpa: 3.0, preferences: ["L"] },
    ];
    const ranked = rankStudents(lab({ a: 0, b: 60, c: 30 }), withAbsent, params, lottery);
    expect(ranked.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
    // b の総合点は 80 で最高のまま。順序だけが後ろになる
    expect(ranked[2]!.total).toBe(80);
    expect(ranked[2]!.submitted).toBe(false);
  });

  it("未提出者どうしは今まで通り総合点で並べる", () => {
    const allAbsent: Student[] = students.map((student) => ({ ...student, preferences: [] }));
    const ranked = rankStudents(lab({ a: 0, b: 60, c: 30 }), allAbsent, params, lottery);
    expect(ranked.map((entry) => entry.id)).toEqual(["b", "c", "a"]);
  });

  it("一部だけ順位を付けた学生は提出者として扱う", () => {
    const partial: Student[] = [{ id: "a", gpa: 4.0, preferences: ["L"] }];
    expect(rankStudents(lab({ a: 0 }), partial, params, lottery)[0]!.submitted).toBe(true);
  });

  it("研究室が裁量点を一律に高くしても順序は変わらない", () => {
    const modest = rankStudents(lab({ a: 10, b: 20, c: 30 }), students, params, lottery);
    const generous = rankStudents(lab({ a: 40, b: 50, c: 60 }), students, params, lottery);
    expect(generous.map((entry) => entry.id)).toEqual(modest.map((entry) => entry.id));
  });
});
