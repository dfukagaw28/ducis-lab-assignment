/** 結果の描画。 */

import { followUps, type Report } from "../domain/report.js";
import type { Instance } from "../domain/types.js";
import { escapeHtml } from "./dropzone.js";

export function renderReport(
  root: HTMLElement,
  instance: Instance,
  report: Report,
  /** 何から出した結果なのか。取り違えに気づけるよう、結果と一緒に出す。 */
  source: string
): void {
  const { summary } = report;
  const labName = new Map(instance.labs.map((lab) => [lab.id, lab.name ?? lab.id]));

  const distribution = distributionRows(summary);

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
        <td class="num">${
          row.choice !== null
            ? `第${row.choice}希望`
            : row.lab === null
              ? "-"
              : '<span class="unlisted">希望外</span>'
        }</td>
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
        <td class="num">${lab.firstChoice}${
          lab.capacity > 0
            ? ` <span class="hint">${(lab.firstChoice / lab.capacity).toFixed(1)}倍</span>`
            : ""
        }</td>
        <td class="num">${lab.ranked}</td>
        <td class="num">${
          lab.cutoff === null
            ? '<span class="hint">なし</span>'
            : lab.cutoff.toFixed(1)
        }</td>
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
    <p class="source">入力: ${escapeHtml(source)}</p>
    <dl class="stats">
      <div><dt>抽選シード</dt><dd><code>${summary.seed}</code></dd></div>
      <div><dt>学生</dt><dd>${summary.numStudents} 人</dd></div>
      <div><dt>研究室</dt><dd>${summary.numLabs} 室（定員計 ${summary.totalCapacity}）</dd></div>
      <div><dt>配属</dt><dd>${summary.matched} 人</dd></div>
      <div><dt>未配属</dt><dd>${summary.unmatched} 人</dd></div>
      <div><dt>希望外に配属</dt><dd>${summary.unlisted} 人</dd></div>
    </dl>
    ${stability}

    <div class="row" id="downloads">
      <button type="button" class="primary" data-download="workbook">Excel（3 シート）</button>
      <button type="button" data-download="students">学生別 CSV</button>
      <button type="button" data-download="labs">研究室別 CSV</button>
      <button type="button" data-download="summary">サマリ CSV</button>
    </div>

    <h3>希望順位の内訳</h3>
    <table class="distribution">
      <thead><tr>
        <th>希望</th><th class="num">人数</th><th class="num">割合</th><th class="bar-head"></th>
      </tr></thead>
      <tbody>${distribution}</tbody>
    </table>

    <h3>研究室別</h3>
    <p class="hint">
      「第 1 希望」は、その研究室を第 1 希望に挙げた学生の数と、定員に対する倍率。
      「希望者」はどこかに挙げた学生の数。どちらも希望を出した学生だけを数えています。
      合格ラインは、希望を出した学生がその研究室に入るのに要した総合点で、定員に
      空きがあるか、希望を出さなかった学生が入っている研究室にはありません（希望
      すれば入れたということなので「なし」）。
    </p>
    <table><thead><tr>
      <th>研究室</th><th class="num">配属 / 定員</th><th class="num">第 1 希望</th>
      <th class="num">希望者</th><th class="num">合格ライン</th><th>学生</th>
    </tr></thead>
      <tbody>${labRows}</tbody></table>

    ${followUpSection(report, labName)}

    <section class="panel" id="sensitivity">
      <h3>抽選シードによるぶれ</h3>
      <p class="hint">
        抽選シードを何通りか振り直して解き直し、配属先がどれだけ変わるかを見ます。
        結果を確定する前に、抽選がどれくらい効いているかを確かめるためのものです。
      </p>
      <div class="row">
        <label>試行回数 <input id="runs" type="number" min="1" max="1000" value="100" /></label>
        <button type="button" id="runSensitivity">試す</button>
      </div>
      <div id="sensitivityOut"></div>
    </section>

    <h3>学生別</h3>
    <p class="hint">
      「抽選」は総合点が同点のときだけ効きます（1 点でも違えば結果に影響しません）。
      番号は小さいほど優先で、0 が最も優先。全研究室で同じ番号を使うので、研究室に
      よって有利不利が変わることはありません。
    </p>
    <table><thead><tr>
      <th>学籍番号</th><th>氏名</th><th class="num">GPA</th><th class="num">抽選</th>
      <th>配属先</th><th class="num">希望</th><th class="num">総合点</th><th class="num">研究室での順位</th>
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

/** 気に留めておきたい学生を一箇所に。 */
function followUpSection(report: Report, labName: ReadonlyMap<string, string>): string {
  const worseThan = 3;
  const found = followUps(report, worseThan);
  if (found.length === 0) {
    return `<p class="ok">未配属・未提出・希望外・第${worseThan}希望以下の学生はいません。</p>`;
  }

  const rows = found
    .map(
      ({ student, reason }) => `<tr>
        <td>${escapeHtml(reason)}</td>
        <td><code>${escapeHtml(student.id)}</code></td>
        <td>${escapeHtml(student.name ?? "")}</td>
        <td>${student.lab === null ? "—" : escapeHtml(labName.get(student.lab) ?? student.lab)}</td>
        <td class="num">${student.choice === null ? "—" : `第${student.choice}希望`}</td>
      </tr>`
    )
    .join("");

  return `
    <h3>要確認 <span class="hint">${found.length} 人</span></h3>
    <p class="hint">
      未配属、希望を出さなかった、挙げた研究室に入れなかった、第${worseThan}希望以下に
      なった学生です。重い理由の順に並べています。
    </p>
    <table><thead><tr>
      <th>理由</th><th>学籍番号</th><th>氏名</th><th>配属先</th><th class="num">希望順位</th>
    </tr></thead><tbody>${rows}</tbody></table>
  `;
}

/**
 * 希望順位の内訳。数字の横に帯を添える。
 *
 * 帯の長さは学生数に対する割合。ここに並ぶのは学生を分け合った区分なので、
 * 最大値ではなく全体に対して測る方が「ほとんどが第 1 希望に入った」がそのまま
 * 長さになる。数字は表のまま残してあるので、帯は読みを速くするだけのもの。
 */
function distributionRows(summary: Report["summary"]): string {
  const last = summary.choiceCounts.reduce(
    (found, count, index) => (count > 0 ? index : found),
    -1
  );

  const entries: Array<{ label: string; count: number; kind: string }> = summary.choiceCounts
    .slice(0, last + 1)
    .map((count, index) => ({ label: `第${index + 1}希望`, count, kind: "choice" }));

  if (summary.unlisted > 0) {
    entries.push({ label: "希望外", count: summary.unlisted, kind: "unlisted" });
  }
  if (summary.unmatched > 0) {
    entries.push({ label: "未配属", count: summary.unmatched, kind: "unmatched" });
  }

  return entries
    .map(({ label, count, kind }) => {
      const share = summary.numStudents === 0 ? 0 : count / summary.numStudents;
      return `<tr>
        <td class="${kind}">${label}</td>
        <td class="num">${count}</td>
        <td class="num">${percent(count, summary.numStudents)}</td>
        <td class="bar-cell">${
          count === 0 ? "" : `<div class="bar ${kind}" style="width: ${(share * 100).toFixed(1)}%"></div>`
        }</td>
      </tr>`;
    })
    .join("");
}
