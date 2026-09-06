import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildReport } from "../src/domain/report.js";
import { assign } from "../src/domain/solve.js";
import { defaultParams, type Params } from "../src/domain/types.js";
import { parseCsv } from "../src/io/csv.js";
import { labsCsv, outputFileName, studentsCsv, summaryCsv } from "../src/io/export.js";
import { buildInstance, type SourceFile } from "../src/io/intake.js";

const names = [
  ["preferences.csv", "preferences"],
  ["gpa.csv", "gpa"],
  ["labs.csv", "labs"],
  ["scores_L01.csv", "scores"],
  ["scores_L02.csv", "scores"],
  ["scores_L03.csv", "scores"],
  ["scores_L04.csv", "scores"],
] as const;

const files: SourceFile[] = names.map(([name, role]) => ({
  name,
  role,
  text: readFileSync(new URL(`../samples/${name}`, import.meta.url), "utf8"),
}));

const params: Params = { ...defaultParams, seed: 20260906 };
const { instance } = buildInstance(files);
const report = buildReport(instance, assign(instance, params));

describe("studentsCsv", () => {
  const rows = parseCsv(studentsCsv(instance, report));

  it("見出しと学生の数だけ行を書く", () => {
    expect(rows).toHaveLength(instance.students.length + 1);
    expect(rows[0]).toEqual([
      "学籍番号", "氏名", "GPA", "抽選番号", "配属研究室", "研究室名", "希望順位", "総合点", "研究室内順位",
    ]);
  });

  it("配属先と希望順位を入れる", () => {
    const row = rows[1]!;
    const student = report.students[0]!;
    expect(row[0]).toBe(student.id);
    expect(row[4]).toBe(student.lab ?? "");
    expect(row[6]).toBe(String(student.choice ?? ""));
  });
});

describe("labsCsv", () => {
  const rows = parseCsv(labsCsv(instance, report));

  it("配属された学生を 1 行ずつ書く", () => {
    const assigned = report.labs.reduce((sum, lab) => sum + Math.max(lab.students.length, 1), 0);
    expect(rows).toHaveLength(assigned + 1);
  });

  it("研究室内順位を 1 から振る", () => {
    const first = report.labs.find((lab) => lab.students.length > 0)!;
    const row = rows.find((entry) => entry[0] === first.id && entry[4] === "1")!;
    expect(row[5]).toBe(first.students[0]);
  });
});

describe("summaryCsv", () => {
  const text = summaryCsv(report, params);

  it("再現に要るパラメータを残す", () => {
    expect(text).toContain(`抽選シード,${params.seed}`);
    expect(text).toContain(`GPA 配点,${params.gpaWeight}`);
    expect(text).toContain(`裁量点 配点,${params.discretionaryWeight}`);
  });

  it("希望順位の内訳を書く", () => {
    const counts = report.summary.choiceCounts;
    expect(text).toContain(`第1希望,${counts[0]}`);
  });
});

describe("outputFileName", () => {
  it("日付とシードの入った名前にする", () => {
    expect(outputFileName("students", 42, new Date(2026, 8, 6))).toBe(
      "haizoku_students_20260906_seed42.csv"
    );
  });
});
