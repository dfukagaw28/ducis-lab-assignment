/** 結果の描画。 */

import type { Report } from "../domain/report.js";
import type { Instance } from "../domain/types.js";
import { escapeHtml } from "./dropzone.js";

export function renderReport(root: HTMLElement, instance: Instance, report: Report): void {
  const { summary } = report;
  const labName = new Map(instance.labs.map((lab) => [lab.id, lab.name ?? lab.id]));

  const distribution = summary.choiceCounts
    .map((count, index) =>
      count === 0
        ? ""
        : `<tr><td>第${index + 1}希望</td><td class="num">${count}</td>
           <td class="num">${percent(count, summary.numStudents)}</td></tr>`
    )
    .join("");

  const studentRows = report.students
    .map(
      (row) => `<tr>
        <td><code>${escapeHtml(row.id)}</code></td>
        <td>${escapeHtml(row.name ?? "")}</td>
        <td class="num">${row.gpa.toFixed(2)}</td>
        <td class="num">${row.lottery}</td>
        <td${row.lab === null ? ' class="unmatched"' : ""}>${
          row.lab === null ? "未配属" : escapeHtml(labName.get(row.lab)!)
        }</td>
        <td class="num">${row.choice === null ? "-" : `第${row.choice}希望`}</td>
        <td class="num">${row.total === null ? "-" : row.total.toFixed(1)}</td>
        <td class="num">${row.rankInLab ?? "-"}</td>
      </tr>`
    )
    .join("");

  const labRows = report.labs
    .map(
      (lab) => `<tr>
        <td>${escapeHtml(lab.name ?? lab.id)}</td>
        <td class="num">${lab.filled} / ${lab.capacity}</td>
        <td>${lab.students.map((id) => `<code>${escapeHtml(id)}</code>`).join(" ")}</td>
      </tr>`
    )
    .join("");

  const stability =
    summary.blockingPairs.length === 0
      ? `<p class="ok">安定性の検査: ブロッキングペアはありません。</p>`
      : `<p class="error">安定性の検査: ブロッキングペアが ${summary.blockingPairs.length} 件あります。
         データか実装を疑ってください。</p>`;

  root.innerHTML = `
    <h2>結果</h2>
    <dl class="stats">
      <div><dt>抽選シード</dt><dd><code>${summary.seed}</code></dd></div>
      <div><dt>学生</dt><dd>${summary.numStudents} 人</dd></div>
      <div><dt>研究室</dt><dd>${summary.numLabs} 室（定員計 ${summary.totalCapacity}）</dd></div>
      <div><dt>配属</dt><dd>${summary.matched} 人</dd></div>
      <div><dt>未配属</dt><dd>${summary.unmatched} 人</dd></div>
    </dl>
    ${stability}

    <div class="row" id="downloads">
      <button type="button" data-download="students">学生別 CSV</button>
      <button type="button" data-download="labs">研究室別 CSV</button>
      <button type="button" data-download="summary">サマリ CSV</button>
    </div>

    <h3>希望順位の内訳</h3>
    <table><thead><tr><th>希望</th><th class="num">人数</th><th class="num">割合</th></tr></thead>
      <tbody>${distribution}</tbody></table>

    <h3>研究室別</h3>
    <table><thead><tr><th>研究室</th><th class="num">配属 / 定員</th><th>学生</th></tr></thead>
      <tbody>${labRows}</tbody></table>

    <h3>学生別</h3>
    <table><thead><tr>
      <th>学籍番号</th><th>氏名</th><th class="num">GPA</th><th class="num">抽選</th>
      <th>配属先</th><th class="num">希望</th><th class="num">総合点</th><th class="num">室内順位</th>
    </tr></thead><tbody>${studentRows}</tbody></table>
  `;
}

export function renderMessages(root: HTMLElement, warnings: readonly string[]): void {
  root.hidden = warnings.length === 0;
  root.innerHTML =
    warnings.length === 0
      ? ""
      : `<b>確認してください</b><ul>${warnings
          .map((warning) => `<li>${escapeHtml(warning)}</li>`)
          .join("")}</ul>`;
}

function percent(count: number, total: number): string {
  return total === 0 ? "-" : `${((count / total) * 100).toFixed(1)}%`;
}
