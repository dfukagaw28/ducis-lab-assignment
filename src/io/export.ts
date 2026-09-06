/**
 * 結果の書き出し。
 *
 * Excel が文字化けしないよう、UTF-8 の BOM を付ける。改行は toCsv が CRLF。
 */

import type { Report } from "../domain/report.js";
import type { Instance, Params } from "../domain/types.js";
import { toCsv, type CsvValue } from "./csv.js";

export function studentsCsv(instance: Instance, report: Report): string {
  const labName = new Map(instance.labs.map((lab) => [lab.id, lab.name ?? lab.id]));
  const rows: CsvValue[][] = [
    ["学籍番号", "氏名", "GPA", "抽選番号", "配属研究室", "研究室名", "希望順位", "総合点", "研究室内順位"],
  ];
  for (const row of report.students) {
    rows.push([
      row.id,
      row.name ?? "",
      row.gpa,
      row.lottery,
      row.lab ?? "",
      row.lab === null ? "" : labName.get(row.lab)!,
      row.choice ?? "",
      row.total === null ? "" : round(row.total),
      row.rankInLab ?? "",
    ]);
  }
  return toCsv(rows);
}

export function labsCsv(instance: Instance, report: Report): string {
  const studentName = new Map(instance.students.map((s) => [s.id, s.name ?? ""]));
  const byId = new Map(report.students.map((row) => [row.id, row]));
  const rows: CsvValue[][] = [
    ["研究室", "研究室名", "定員", "配属人数", "研究室内順位", "学籍番号", "氏名", "総合点", "希望順位"],
  ];
  for (const lab of report.labs) {
    if (lab.students.length === 0) {
      rows.push([lab.id, lab.name ?? "", lab.capacity, 0, "", "", "", "", ""]);
      continue;
    }
    lab.students.forEach((id, index) => {
      const row = byId.get(id)!;
      rows.push([
        lab.id,
        lab.name ?? "",
        lab.capacity,
        lab.filled,
        index + 1,
        id,
        studentName.get(id) ?? "",
        row.total === null ? "" : round(row.total),
        row.choice ?? "",
      ]);
    });
  }
  return toCsv(rows);
}

export function summaryCsv(report: Report, params: Params): string {
  const { summary } = report;
  const rows: CsvValue[][] = [
    ["項目", "値"],
    ["抽選シード", summary.seed],
    ["GPA 配点", params.gpaWeight],
    ["GPA の満点", params.gpaMax],
    ["裁量点 配点", params.discretionaryWeight],
    ["裁量点の満点", params.discretionaryMax],
    ["裁量点が無い学生", params.missingScore === "zero" ? "0 点として扱う" : "受け入れ不可"],
    ["学生数", summary.numStudents],
    ["研究室数", summary.numLabs],
    ["定員の合計", summary.totalCapacity],
    ["配属", summary.matched],
    ["未配属", summary.unmatched],
    ["ブロッキングペア", summary.blockingPairs.length],
    [],
    ["希望順位", "人数"],
  ];
  summary.choiceCounts.forEach((count, index) => rows.push([`第${index + 1}希望`, count]));
  return toCsv(rows);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** ブラウザにファイルとして渡す。 */
export function downloadCsv(fileName: string, csv: string): void {
  // Excel は BOM が無いと UTF-8 と気づかない
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** `haizoku_students_20260906_seed1234.csv` のような、いつのどのシードの結果かわかる名前。 */
export function outputFileName(kind: string, seed: number, now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `haizoku_${kind}_${stamp}_seed${seed}.csv`;
}
