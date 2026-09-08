/** 抽選シードのぶれの表示。 */

import type { Sensitivity } from "../domain/sensitivity.js";
import type { Instance, StudentId } from "../domain/types.js";
import { escapeHtml } from "./dropzone.js";

export function renderSensitivity(
  root: HTMLElement,
  instance: Instance,
  result: Sensitivity
): void {
  const total = instance.students.length;
  const labName = new Map(instance.labs.map((lab) => [lab.id, lab.name ?? lab.id]));
  const studentName = new Map<StudentId, string>(
    instance.students.map((student) => [student.id, student.name ?? ""])
  );

  const rows = result.unsettled
    .map(
      (spread) => `<tr>
        <td><code>${escapeHtml(spread.id)}</code></td>
        <td>${escapeHtml(studentName.get(spread.id) ?? "")}</td>
        <td class="num">${percent(spread.agreement)}</td>
        <td>${spread.destinations
          .map(
            (entry) =>
              `${escapeHtml(entry.lab === null ? "未配属" : (labName.get(entry.lab) ?? entry.lab))}` +
              ` <span class="hint">${percent(entry.count / result.runs)}</span>`
          )
          .join("　")}</td>
      </tr>`
    )
    .join("");

  const verdict =
    result.unsettled.length === 0
      ? `<p class="ok">シードを変えても配属先は動きませんでした。この結果は抽選ではなく
         点数で決まっています。</p>`
      : `<p class="warn-note">${result.unsettled.length} 人の配属先はシード次第で変わります。
         同点が多いほどこの人数は増えます。多すぎると感じるなら、点数の付け方
         （配点や裁量点の刻み）を見直す余地があります。</p>`;

  root.innerHTML = `
    <h3>抽選シードによるぶれ</h3>
    <p class="hint">
      定員は今の値のまま、抽選シードだけを ${result.runs} 通りに振り直して解き直した
      結果です。今表示している配属と比べています。
    </p>
    <dl class="stats">
      <div><dt>配属先が動かなかった</dt><dd>${result.settled} / ${total} 人</dd></div>
      <div><dt>1 回あたり動いた人数</dt><dd>平均 ${result.averageChanged.toFixed(1)} 人</dd></div>
      <div><dt>第 1 希望に入れた人数</dt>
        <dd>${result.firstChoice.min} 〜 ${result.firstChoice.max} 人
          <span class="hint">（平均 ${result.firstChoice.mean.toFixed(1)}）</span></dd></div>
    </dl>
    ${verdict}
    ${
      rows === ""
        ? ""
        : `<table><thead><tr>
             <th>学籍番号</th><th>氏名</th><th class="num">今の配属先になった割合</th><th>行き先の内訳</th>
           </tr></thead><tbody>${rows}</tbody></table>`
    }
  `;
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(0)}%`;
}
