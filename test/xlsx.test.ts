// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { readWorkbook, sheetOf } from "../src/io/xlsx.js";

// jsdom の下では import.meta.url がファイルの場所を指さないので、実行位置から辿る
function open(name: string) {
  return readWorkbook(new Uint8Array(readFileSync(resolve("samples", name))));
}

describe("readWorkbook（教員裁量点）", () => {
  const workbook = open("教員裁量点_○○先生.xlsx");

  it("シートを名前つきで並べる", () => {
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(["教員裁量点", "教員氏名リスト"]);
  });

  it("見出しにふりがなを混ぜない", () => {
    // 共有文字列の <rPh> を一緒に読むと「教員氏名キョウインシメイ」になる
    expect(sheetOf(workbook, "教員裁量点").rows[0]).toEqual([
      "学生ID",
      "学生氏名",
      "教員氏名",
      "教員裁量点",
    ]);
  });

  it("学生の行を読む", () => {
    const rows = sheetOf(workbook, "教員裁量点").rows;
    expect(rows).toHaveLength(11);
    expect(rows[1]!.slice(0, 2)).toEqual(["1234560001", "田中　ダミー"]);
    expect(rows[10]!.slice(0, 2)).toEqual(["1234560010", "伊藤　ヌル"]);
  });

  it("教員氏名リストのシートも読める", () => {
    const rows = sheetOf(workbook, "教員氏名リスト").rows;
    expect(rows[0]).toEqual(["教員氏名リスト"]);
    expect(rows.slice(1).map((row) => row[0])).toEqual([
      "○○　○○",
      "△△　△△",
      "□□　□□",
      "◇◇　◇◇",
    ]);
  });

  it("名前を言わなければ最初のシート", () => {
    expect(sheetOf(workbook).name).toBe("教員裁量点");
  });

  it("無いシートは、あるシートを挙げて断る", () => {
    expect(() => sheetOf(workbook, "無い")).toThrow(/教員氏名リスト/);
  });
});

describe("readWorkbook（GPA）", () => {
  const rows = sheetOf(open("GPA.xlsx"), "GPA").rows;

  it("見出しと学生の行を読む", () => {
    expect(rows[0]).toEqual(["学生ID", "学生氏名", "GPA"]);
    expect(rows).toHaveLength(11);
    expect(rows[1]).toEqual(["1234560001", "田中　ダミー", "3.97"]);
  });

  it("シートが 1 つだけなら、それが最初のシート", () => {
    expect(sheetOf(open("GPA.xlsx")).name).toBe("GPA");
  });
});

describe("readWorkbook（記入済みの中身）", () => {
  const rows = sheetOf(open("教員裁量点_○○先生.xlsx"), "教員裁量点").rows;

  it("教員氏名と裁量点が入っている", () => {
    for (const row of rows.slice(1)) {
      expect(row[2]).toBe("○○　○○");
      expect(Number(row[3])).toBeGreaterThanOrEqual(0);
      expect(Number(row[3])).toBeLessThanOrEqual(60);
    }
  });

  it("学生 10 人ぶんある", () => {
    expect(rows).toHaveLength(11);
  });
});

describe("readWorkbook（壊れた入力）", () => {
  it("Excel でないものは断る", () => {
    expect(() => readWorkbook(new TextEncoder().encode("これは Excel ではない"))).toThrow();
  });
});
