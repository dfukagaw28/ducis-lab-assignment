// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildReport } from "../src/domain/report.js";
import { assign } from "../src/domain/solve.js";
import { defaultParams, type Params } from "../src/domain/types.js";
import { parseCsv } from "../src/io/csv.js";
import {
  labsCsv,
  outputFileName,
  resultWorkbook,
  studentsCsv,
  summaryCsv,
} from "../src/io/export.js";
import { buildInstance, type SourceFile } from "../src/io/intake.js";
import { readWorkbook, sheetOf } from "../src/io/xlsx.js";

function sheetRows(name: string, sheet: string): string[][] {
  const bytes = new Uint8Array(readFileSync(resolve("samples", name)));
  return sheetOf(readWorkbook(bytes), sheet).rows;
}

const files: SourceFile[] = [
  {
    name: "answer-utf8-sample.txt",
    role: "preferences",
    text: readFileSync(resolve("samples", "answer-utf8-sample.txt"), "utf8"),
  },
  { name: "GPA.xlsx", role: "gpa", text: "", rows: sheetRows("GPA.xlsx", "GPA") },
  ...["○○", "△△", "□□", "◇◇"].map((teacher) => ({
    name: `教員裁量点_${teacher}先生.xlsx`,
    role: "scores" as const,
    text: "",
    rows: sheetRows(`教員裁量点_${teacher}先生.xlsx`, "教員裁量点"),
  })),
];

const SEED = 20260906;
const params: Params = { ...defaultParams, seed: SEED };
const { instance } = buildInstance(files, SEED);
const report = buildReport(instance, assign(instance, params));

describe("studentsCsv", () => {
  const rows = parseCsv(studentsCsv(instance, report));

  it("見出しと学生の数だけ行を書く", () => {
    expect(rows).toHaveLength(instance.students.length + 1);
    expect(rows[0]).toEqual([
      "学籍番号", "氏名", "GPA", "抽選番号", "配属研究室", "研究室名", "希望順位", "希望外", "総合点", "研究室での順位",
    ]);
  });

  it("配属先と希望順位を入れる", () => {
    const row = rows[1]!;
    const student = report.students[0]!;
    expect(row[0]).toBe(student.id);
    expect(row[4]).toBe(student.lab ?? "");
    expect(row[6]).toBe(String(student.choice ?? ""));
    expect(row[7]).toBe(student.lab !== null && !student.listed ? "○" : "");
  });
});

describe("labsCsv", () => {
  const rows = parseCsv(labsCsv(instance, report));

  it("配属された学生を 1 行ずつ書く", () => {
    const assigned = report.labs.reduce((sum, lab) => sum + Math.max(lab.students.length, 1), 0);
    expect(rows).toHaveLength(assigned + 1);
  });

  it("配属順位を 1 から振る", () => {
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

describe("resultWorkbook", () => {
  it("3 つの表を 1 冊にまとめる", async () => {
    const bytes = await resultWorkbook(instance, report, params);
    const workbook = readWorkbook(bytes);
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual([
      "学生別",
      "研究室別",
      "サマリ",
    ]);
  });

  it("CSV と同じ中身を持つ", async () => {
    const workbook = readWorkbook(await resultWorkbook(instance, report, params));
    const asText = (rows: string[][]) => rows.map((row) => row.join("|")).join("\n");

    for (const [name, csv] of [
      ["学生別", studentsCsv(instance, report)],
      ["研究室別", labsCsv(instance, report)],
      ["サマリ", summaryCsv(report, params)],
    ] as const) {
      // 空欄は書き出さないので、読み戻すと末尾の空欄が落ちる。そこだけ揃える
      const fromCsv = parseCsv(csv).map((row) => [...row]);
      const fromSheet = sheetOf(workbook, name).rows.map((row) => [...row]);
      for (let i = 0; i < fromCsv.length; i++) {
        const wanted = fromCsv[i]!;
        const got = fromSheet[i] ?? [];
        while (got.length < wanted.length) got.push("");
        expect(got.slice(0, wanted.length).join("|")).toBe(wanted.join("|"));
      }
      expect(asText(fromSheet).length).toBeGreaterThan(0);
    }
  });

  it("数値は数値のまま入れる（Excel で集計できるように）", async () => {
    const workbook = readWorkbook(await resultWorkbook(instance, report, params));
    const rows = sheetOf(workbook, "学生別").rows;
    // GPA の列。文字列として入れていると Excel では計算できない
    expect(Number(rows[1]![2])).toBeGreaterThan(0);
  });
});

describe("outputFileName", () => {
  it("日付とシードの入った名前にする", () => {
    expect(outputFileName("students", 42, "csv", new Date(2026, 8, 6))).toBe(
      "haizoku_students_20260906_seed42.csv"
    );
  });

  it("拡張子を選べる", () => {
    expect(outputFileName("result", 42, "xlsx", new Date(2026, 8, 6))).toBe(
      "haizoku_result_20260906_seed42.xlsx"
    );
  });
});
