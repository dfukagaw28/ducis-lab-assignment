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
  preferencesCsv,
  rankingCsv,
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
const SEED_SOURCE = "手で指定";
const params: Params = { ...defaultParams, seed: SEED };
const { instance } = buildInstance(files, SEED);
const assignment = assign(instance, params);
const report = buildReport(instance, assignment);

describe("studentsCsv", () => {
  const rows = parseCsv(studentsCsv(instance, report));

  it("見出しと学生の数だけ行を書く", () => {
    expect(rows).toHaveLength(instance.students.length + 1);
    expect(rows[0]).toEqual([
      "学籍番号", "氏名", "GPA", "抽選番号", "配属研究室", "研究室名", "希望順位", "希望外", "未提出", "総合点", "研究室での順位",
    ]);
  });

  it("配属先と希望順位を入れる", () => {
    const row = rows[1]!;
    const student = report.students[0]!;
    expect(row[0]).toBe(student.id);
    expect(row[4]).toBe(student.lab ?? "");
    expect(row[6]).toBe(String(student.choice ?? ""));
    expect(row[7]).toBe(student.lab !== null && !student.listed ? "○" : "");
    expect(row[8]).toBe(student.submitted ? "" : "○");
  });
});

describe("labsCsv", () => {
  const rows = parseCsv(labsCsv(instance, report));

  it("希望の集中度と合格ラインを書く", () => {
    for (const lab of report.labs) {
      const row = rows.find((entry) => entry[0] === lab.id)!;
      expect(row[4]).toBe(String(lab.firstChoice));
      expect(row[5]).toBe(String(Math.round((lab.firstChoice / lab.capacity) * 100) / 100));
      expect(row[6]).toBe(String(lab.ranked));
      expect(row[7]).toBe(lab.cutoff === null ? "" : String(Math.round(lab.cutoff * 100) / 100));
    }
  });

  it("配属された学生を 1 行ずつ書く", () => {
    const assigned = report.labs.reduce((sum, lab) => sum + Math.max(lab.students.length, 1), 0);
    expect(rows).toHaveLength(assigned + 1);
  });

  it("配属順位を 1 から振る", () => {
    const first = report.labs.find((lab) => lab.students.length > 0)!;
    const row = rows.find((entry) => entry[0] === first.id && entry[8] === "1")!;
    expect(row[9]).toBe(first.students[0]);
  });
});

describe("summaryCsv", () => {
  const text = summaryCsv(report, params, SEED_SOURCE);

  it("再現に要るパラメータを残す", () => {
    expect(text).toContain(`抽選シード,${params.seed}`);
    expect(text).toContain("シードの決め方,手で指定");
    expect(text).toContain(`GPA 配点,${params.gpaWeight}`);
    expect(text).toContain(`裁量点 配点,${params.discretionaryWeight}`);
  });

  it("希望順位の内訳を書く", () => {
    const counts = report.summary.choiceCounts;
    expect(text).toContain(`第1希望,${counts[0]}`);
  });
});

describe("rankingCsv", () => {
  const rows = parseCsv(rankingCsv(instance, assignment));
  const header = rows[0]!;
  const body = rows.slice(1);
  const at = (name: string) => header.indexOf(name);

  it("研究室ごとに、全学生を 1 行ずつ並べる", () => {
    expect(header).toEqual([
      "研究室", "研究室名", "順位", "学籍番号", "氏名", "提出",
      "GPA点", "裁量点", "総合点", "抽選番号", "配属",
    ]);
    expect(body).toHaveLength(instance.labs.length * instance.students.length);
  });

  it("順位は研究室ごとに 1 から振る", () => {
    for (const lab of instance.labs) {
      const ranks = body.filter((row) => row[0] === lab.id).map((row) => Number(row[at("順位")]));
      expect(ranks).toEqual(instance.students.map((_, i) => i + 1));
    }
  });

  it("提出した学生が先に並び、その中では総合点の高い順", () => {
    for (const lab of instance.labs) {
      const inLab = body.filter((row) => row[0] === lab.id);
      const submitted = inLab.map((row) => row[at("提出")] !== "未提出");
      // 提出した学生の塊のあとに未提出の塊が来る
      expect(submitted).toEqual([...submitted].sort((a, b) => Number(b) - Number(a)));

      for (const group of [true, false]) {
        const totals = inLab
          .filter((row) => (row[at("提出")] !== "未提出") === group)
          .map((row) => Number(row[at("総合点")]));
        expect(totals).toEqual([...totals].sort((a, b) => b - a));
      }
    }
  });

  it("点の内訳を足すと総合点になる", () => {
    for (const row of body) {
      const parts = Number(row[at("GPA点")]) + Number(row[at("裁量点")]);
      expect(Math.abs(parts - Number(row[at("総合点")]))).toBeLessThan(0.02);
    }
  });

  it("配属された学生に ○ が付く", () => {
    for (const lab of report.labs) {
      const marked = body
        .filter((row) => row[0] === lab.id && row[at("配属")] === "○")
        .map((row) => row[at("学籍番号")]);
      expect(marked.sort()).toEqual([...lab.students].sort());
    }
  });
});

describe("preferencesCsv", () => {
  const rows = parseCsv(preferencesCsv(instance, assignment));
  const header = rows[0]!;
  const body = rows.slice(1);
  const at = (name: string) => header.indexOf(name);

  it("学生ごとに、全研究室を 1 行ずつ並べる", () => {
    expect(header).toEqual([
      "学籍番号", "氏名", "順位", "研究室", "研究室名", "定員", "研究室での順位", "出所", "配属",
    ]);
    expect(body).toHaveLength(instance.students.length * instance.labs.length);
  });

  it("学籍番号の順に並べる", () => {
    const ids = [...new Set(body.map((row) => row[0]!))];
    expect(ids).toEqual([...ids].sort());
  });

  it("本人が書いた分を先に、補完で足した分を後に置く", () => {
    for (const student of instance.students) {
      const mine = body.filter((row) => row[0] === student.id);
      expect(mine.map((row) => row[at("研究室")]).slice(0, student.preferences.length)).toEqual([
        ...student.preferences,
      ]);
      expect(mine.slice(0, student.preferences.length).every((row) => row[at("出所")] === "希望")).toBe(true);
      expect(mine.slice(student.preferences.length).every((row) => row[at("出所")] === "補完")).toBe(true);
    }
  });

  it("希望を出していない学生は全部が補完になる", () => {
    const absent = instance.students.find((student) => student.preferences.length === 0)!;
    const mine = body.filter((row) => row[0] === absent.id);
    expect(mine.every((row) => row[at("出所")] === "補完")).toBe(true);
  });

  it("研究室での順位は、研究室の並び（rankingCsv）と同じものを指す", () => {
    const ranking = parseCsv(rankingCsv(instance, assignment));
    const rankHeader = ranking[0]!;
    const rank = new Map(
      ranking
        .slice(1)
        .map((row) => [
          `${row[0]}\t${row[rankHeader.indexOf("学籍番号")]}`,
          row[rankHeader.indexOf("順位")],
        ])
    );

    for (const row of body) {
      expect(row[at("研究室での順位")]).toBe(rank.get(`${row[at("研究室")]}\t${row[0]}`));
    }
  });

  it("配属された研究室での順位は、定員以内か、それより上の希望に入れなかった結果", () => {
    for (const student of instance.students) {
      const mine = body.filter((row) => row[0] === student.id);
      const placed = mine.find((row) => row[at("配属")] === "○")!;
      // 上の希望はすべて、定員の中に入れなかった研究室
      for (const row of mine.slice(0, mine.indexOf(placed))) {
        expect(Number(row[at("研究室での順位")])).toBeGreaterThan(Number(row[at("定員")]));
      }
    }
  });

  it("配属先に ○ が 1 つだけ付く", () => {
    for (const student of instance.students) {
      const marked = body.filter((row) => row[0] === student.id && row[at("配属")] === "○");
      expect(marked).toHaveLength(1);
      expect(marked[0]![at("研究室")]).toBe(assignment.studentToLab.get(student.id));
    }
  });
});

describe("resultWorkbook", () => {
  it("3 つの表を 1 冊にまとめる", async () => {
    const bytes = await resultWorkbook(instance, report, params, SEED_SOURCE);
    const workbook = readWorkbook(bytes);
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual([
      "学生別",
      "研究室別",
      "サマリ",
    ]);
  });

  it("CSV と同じ中身を持つ", async () => {
    const workbook = readWorkbook(await resultWorkbook(instance, report, params, SEED_SOURCE));
    const asText = (rows: string[][]) => rows.map((row) => row.join("|")).join("\n");

    for (const [name, csv] of [
      ["学生別", studentsCsv(instance, report)],
      ["研究室別", labsCsv(instance, report)],
      ["サマリ", summaryCsv(report, params, SEED_SOURCE)],
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
    const workbook = readWorkbook(await resultWorkbook(instance, report, params, SEED_SOURCE));
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
