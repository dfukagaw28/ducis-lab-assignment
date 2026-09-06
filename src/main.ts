/**
 * M1: ドメイン層を合成データで動かす画面。
 *
 * 入力はまだ src/dev/sampleInstance.ts の合成データで、M2 でドラッグ＆ドロップ
 * した実ファイルに置き換える。抽選シードだけは本番と同じ扱いで、読み込み時に
 * ランダムな既定値を入れ、結果と一緒に表示する。
 */

import { buildReport, type Report } from "./domain/report.js";
import { assign } from "./domain/solve.js";
import { defaultParams, randomSeed, type Instance, type Params } from "./domain/types.js";
import { sampleInstance } from "./dev/sampleInstance.js";

const app = document.querySelector<HTMLElement>("#app");
if (app === null) throw new Error("#app is missing from index.html");

app.innerHTML = `
  <form id="controls" class="panel">
    <h2>パラメータ</h2>
    <div class="row">
      <label>抽選シード <span class="hint">同点処理に使う</span>
        <input id="seed" type="number" min="0" step="1" required />
      </label>
      <button type="button" id="reseed">引き直す</button>
    </div>
    <div class="row">
      <label>GPA 配点 <input id="gpaWeight" type="number" min="0" max="100" step="1" /></label>
      <label>裁量点 配点 <input id="discWeight" type="number" min="0" max="100" step="1" /></label>
      <label>GPA の満点 <input id="gpaMax" type="number" min="0.1" step="0.1" /></label>
    </div>
    <div class="row">
      <label>学生数 <input id="numStudents" type="number" min="1" max="2000" value="150" /></label>
      <label>研究室数 <input id="numLabs" type="number" min="1" max="200" value="10" /></label>
    </div>
    <button type="submit" class="primary">配属を計算する</button>
  </form>
  <section id="output"></section>
`;

const form = app.querySelector<HTMLFormElement>("#controls")!;
const field = (id: string) => app.querySelector<HTMLInputElement>(`#${id}`)!;

// ページを開くたびに新しいシードを引く
field("seed").value = String(randomSeed());
field("gpaWeight").value = String(defaultParams.gpaWeight);
field("discWeight").value = String(defaultParams.discretionaryWeight);
field("gpaMax").value = String(defaultParams.gpaMax);

app.querySelector<HTMLButtonElement>("#reseed")!.addEventListener("click", () => {
  field("seed").value = String(randomSeed());
  run();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  run();
});

function run(): void {
  const seed = Number(field("seed").value);
  const params: Params = {
    ...defaultParams,
    seed,
    gpaWeight: Number(field("gpaWeight").value),
    discretionaryWeight: Number(field("discWeight").value),
    gpaMax: Number(field("gpaMax").value),
  };

  // 合成データも同じシードから作るので、シードを変えると名簿ごと変わる。
  // 実データに差し替わればインスタンスはシードに依存しなくなる。
  const instance = sampleInstance({
    numStudents: Number(field("numStudents").value),
    numLabs: Number(field("numLabs").value),
    seed,
  });

  render(instance, buildReport(instance, assign(instance, params)));
}

function render(instance: Instance, report: Report): void {
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
        <td><code>${row.id}</code></td>
        <td>${row.name ?? ""}</td>
        <td class="num">${row.gpa.toFixed(2)}</td>
        <td class="num">${row.lottery}</td>
        <td${row.lab === null ? ' class="unmatched"' : ""}>${
          row.lab === null ? "未配属" : labName.get(row.lab)
        }</td>
        <td class="num">${row.choice === null ? "-" : `第${row.choice}希望`}</td>
        <td class="num">${row.total === null ? "-" : row.total.toFixed(1)}</td>
      </tr>`
    )
    .join("");

  const labRows = report.labs
    .map(
      (lab) => `<tr>
        <td>${lab.name ?? lab.id}</td>
        <td class="num">${lab.filled} / ${lab.capacity}</td>
        <td>${lab.students.map((id) => `<code>${id}</code>`).join(" ")}</td>
      </tr>`
    )
    .join("");

  const stability =
    summary.blockingPairs.length === 0
      ? `<p class="ok">安定性の検査: ブロッキングペアはありません。</p>`
      : `<p class="error">安定性の検査: ブロッキングペアが ${summary.blockingPairs.length} 件あります。</p>`;

  app!.querySelector("#output")!.innerHTML = `
    <h2>結果</h2>
    <dl class="stats">
      <div><dt>抽選シード</dt><dd><code>${summary.seed}</code></dd></div>
      <div><dt>学生</dt><dd>${summary.numStudents} 人</dd></div>
      <div><dt>研究室</dt><dd>${summary.numLabs} 室（定員計 ${summary.totalCapacity}）</dd></div>
      <div><dt>配属</dt><dd>${summary.matched} 人</dd></div>
      <div><dt>未配属</dt><dd>${summary.unmatched} 人</dd></div>
    </dl>
    ${stability}

    <h3>希望順位の内訳</h3>
    <table><thead><tr><th>希望</th><th class="num">人数</th><th class="num">割合</th></tr></thead>
      <tbody>${distribution}</tbody></table>

    <h3>研究室別</h3>
    <table><thead><tr><th>研究室</th><th class="num">配属 / 定員</th><th>学生</th></tr></thead>
      <tbody>${labRows}</tbody></table>

    <h3>学生別</h3>
    <table><thead><tr>
      <th>学籍番号</th><th>氏名</th><th class="num">GPA</th><th class="num">抽選</th>
      <th>配属先</th><th class="num">希望</th><th class="num">総合点</th>
    </tr></thead><tbody>${studentRows}</tbody></table>
  `;
}

function percent(count: number, total: number): string {
  return total === 0 ? "-" : `${((count / total) * 100).toFixed(1)}%`;
}

run();
