/**
 * 結果の書き出し。
 *
 * Excel が文字化けしないよう、UTF-8 の BOM を付ける。改行は toCsv が CRLF。
 */

import type { Report } from "../domain/report.js";
import type { Instance, Params } from "../domain/types.js";
import { toCsv, type CsvValue } from "./csv.js";

export function studentsCsv(instance: Instance, report: Report): string {
  return toCsv(studentRows(instance, report));
}

export function labsCsv(instance: Instance, report: Report): string {
  return toCsv(labRows(instance, report));
}

export function summaryCsv(report: Report, params: Params): string {
  return toCsv(summaryRows(report, params));
}

/**
 * 3 つの表を 1 冊にまとめた Excel。
 *
 * 中身は CSV と同じ行なので、どちらを配っても同じものが読める。Excel を書く道具は
 * 押されたときに初めて取りに行く（動的 import）。
 */
export async function resultWorkbook(
  instance: Instance,
  report: Report,
  params: Params
): Promise<Uint8Array> {
  const { writeWorkbook } = await import("./xlsxWrite.js");
  return writeWorkbook([
    { name: "学生別", rows: studentRows(instance, report) },
    { name: "研究室別", rows: labRows(instance, report) },
    { name: "サマリ", rows: summaryRows(report, params) },
  ]);
}

export function studentRows(instance: Instance, report: Report): CsvValue[][] {
  const labName = new Map(instance.labs.map((lab) => [lab.id, lab.name ?? lab.id]));
  const rows: CsvValue[][] = [
    // 「研究室での順位」は、その研究室が全学生に付けた順位。研究室別シートの
    // 「配属順位」（配属された学生の中での順)とは別物なので、名前を分けてある。
    ["学籍番号", "氏名", "GPA", "抽選番号", "配属研究室", "研究室名", "希望順位", "希望外", "総合点", "研究室での順位"],
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
      row.lab !== null && !row.listed ? "○" : "",
      row.total === null ? "" : round(row.total),
      row.rankInLab ?? "",
    ]);
  }
  return rows;
}

export function labRows(instance: Instance, report: Report): CsvValue[][] {
  const studentName = new Map(instance.students.map((s) => [s.id, s.name ?? ""]));
  const byId = new Map(report.students.map((row) => [row.id, row]));
  const rows: CsvValue[][] = [
    ["研究室", "研究室名", "定員", "配属人数", "配属順位", "学籍番号", "氏名", "総合点", "希望順位"],
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
  return rows;
}

export function summaryRows(report: Report, params: Params): CsvValue[][] {
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
    ["希望外に配属", summary.unlisted],
    ["ブロッキングペア", summary.blockingPairs.length],
    [],
    ["希望順位", "人数"],
  ];
  summary.choiceCounts.forEach((count, index) => rows.push([`第${index + 1}希望`, count]));
  return rows;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** ブラウザにファイルとして渡す。 */
export function downloadCsv(fileName: string, csv: string): void {
  // Excel は BOM が無いと UTF-8 と気づかない
  download(fileName, new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
}

export function downloadWorkbook(fileName: string, bytes: Uint8Array): void {
  download(
    fileName,
    new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );
}

function download(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** `haizoku_students_20260906_seed1234.csv` のような、いつのどのシードの結果かわかる名前。 */
export function outputFileName(
  kind: string,
  seed: number,
  extension = "csv",
  now = new Date()
): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `haizoku_${kind}_${stamp}_seed${seed}.${extension}`;
}
