import { describe, expect, it } from "vitest";

import { buildReport, findBlockingPairs } from "../src/domain/report.js";
import { assign, type Assignment } from "../src/domain/solve.js";
import { defaultParams, type Instance, type Params } from "../src/domain/types.js";
import { sampleInstance } from "../src/dev/sampleInstance.js";

const params: Params = { ...defaultParams, seed: 20260906 };

describe("buildReport", () => {
  const instance = sampleInstance({ numStudents: 150, numLabs: 10, seed: 4242 });
  const report = buildReport(instance, assign(instance, params));

  it("定員が足りていれば全員が配属される", () => {
    expect(report.summary.totalCapacity).toBeGreaterThanOrEqual(report.summary.numStudents);
    expect(report.summary.unmatched).toBe(0);
  });

  it("希望順位の内訳が配属人数と一致する", () => {
    const sum = report.summary.choiceCounts.reduce((a, b) => a + b, 0);
    expect(sum).toBe(report.summary.matched);
  });

  it("研究室の配属人数が定員を超えない", () => {
    for (const lab of report.labs) expect(lab.filled).toBeLessThanOrEqual(lab.capacity);
  });

  it("学生の行と研究室の行が食い違わない", () => {
    for (const lab of report.labs) {
      for (const id of lab.students) {
        expect(report.students.find((row) => row.id === id)!.lab).toBe(lab.id);
      }
    }
  });

  it("安定マッチングなのでブロッキングペアは無い", () => {
    expect(report.summary.blockingPairs).toEqual([]);
  });

  it("研究室ごとにまとめ、研究室の中は学生 ID 順に並べる", () => {
    const order = instance.labs.map((lab) => lab.id);
    let previousLab = -1;
    let previousId = "";
    for (const row of report.students) {
      const at = row.lab === null ? order.length : order.indexOf(row.lab);
      expect(at).toBeGreaterThanOrEqual(previousLab);
      if (at === previousLab) expect(row.id > previousId).toBe(true);
      else previousId = "";
      previousLab = at;
      previousId = row.id;
    }
  });

  it("未配属の学生は最後に並べる", () => {
    const tight: Instance = {
      students: [
        { id: "s2", gpa: 3, preferences: ["X"] },
        { id: "s1", gpa: 4, preferences: ["X"] },
      ],
      labs: [{ id: "X", capacity: 1, scores: new Map([["s1", 10], ["s2", 0]]) }],
    };
    const rows = buildReport(tight, assign(tight, params)).students;
    expect(rows.map((row) => row.id)).toEqual(["s1", "s2"]);
    expect(rows[1]!.lab).toBeNull();
  });

  it("シードを結果に残す", () => {
    expect(report.summary.seed).toBe(params.seed);
  });
});

describe("findBlockingPairs", () => {
  it("わざと壊した配属からブロッキングペアを見つける", () => {
    const instance: Instance = {
      students: [
        { id: "s1", gpa: 3, preferences: ["X", "Y"] },
        { id: "s2", gpa: 3, preferences: ["X", "Y"] },
      ],
      labs: [
        { id: "X", capacity: 1, scores: new Map([["s1", 60], ["s2", 0]]) },
        { id: "Y", capacity: 1, scores: new Map([["s1", 60], ["s2", 0]]) },
      ],
    };
    // X も Y も s1 を上に見るのに、s1 を第 2 希望の Y へ回した配属
    const rankings = assign(instance, params).rankings;
    const broken: Assignment = {
      seed: params.seed,
      studentToLab: new Map([
        ["s1", "Y"],
        ["s2", "X"],
      ]),
      labToStudents: new Map([
        ["X", ["s2"]],
        ["Y", ["s1"]],
      ]),
      lottery: new Map([
        ["s1", 0],
        ["s2", 1],
      ]),
      preferenceRest: new Map([
        ["s1", []],
        ["s2", []],
      ]),
      rankings,
    };
    expect(findBlockingPairs(instance, broken)).toEqual([{ student: "s1", lab: "X" }]);
  });
});
