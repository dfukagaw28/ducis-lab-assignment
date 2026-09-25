// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { zipSync } from "fflate";

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

describe("数値セルの表記", () => {
  /** セル 1 つだけの最小の .xlsx を組み立てる。 */
  function sheetWith(cell: string): string[][] {
    const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const rel = "http://schemas.openxmlformats.org/package/2006/relationships";
    const doc = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const files: Record<string, Uint8Array> = {};
    const put = (path: string, xml: string) => {
      files[path] = new TextEncoder().encode(xml);
    };
    put(
      "[Content_Types].xml",
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`
    );
    put(
      "_rels/.rels",
      `<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${doc}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    );
    put(
      "xl/workbook.xml",
      `<workbook xmlns="${main}" xmlns:r="${doc}"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`
    );
    put(
      "xl/_rels/workbook.xml.rels",
      `<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${doc}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
    );
    put(
      "xl/worksheets/sheet1.xml",
      `<worksheet xmlns="${main}"><sheetData><row r="1">${cell}</row></sheetData></worksheet>`
    );
    return sheetOf(readWorkbook(zipSync(files))).rows;
  }

  it("整数は、書き方が違っても同じ桁で読む", () => {
    // 学籍番号が数値のセルに入っていると、道具によって書き方が変わる
    expect(sheetWith(`<c r="A1"><v>1234560001</v></c>`)[0]).toEqual(["1234560001"]);
    expect(sheetWith(`<c r="A1"><v>1234560001.0</v></c>`)[0]).toEqual(["1234560001"]);
    expect(sheetWith(`<c r="A1"><v>1.234560001E+09</v></c>`)[0]).toEqual(["1234560001"]);
  });

  it("小数はそのまま渡す", () => {
    expect(sheetWith(`<c r="A1"><v>3.97</v></c>`)[0]).toEqual(["3.97"]);
    expect(sheetWith(`<c r="A1"><v>0.5</v></c>`)[0]).toEqual(["0.5"]);
  });

  it("文字列のセルは触らない（先頭の 0 を落とさない）", () => {
    expect(sheetWith(`<c r="A1" t="inlineStr"><is><t>0012</t></is></c>`)[0]).toEqual(["0012"]);
  });
});

describe("readWorkbook（壊れた入力）", () => {
  it("Excel でないものは断る", () => {
    expect(() => readWorkbook(new TextEncoder().encode("これは Excel ではない"))).toThrow();
  });
});
