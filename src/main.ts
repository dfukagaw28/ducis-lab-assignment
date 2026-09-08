/**
 * 画面の配線。
 *
 * 入力ファイル → インスタンス → 配属 → 表示と CSV 出力。
 * 実ファイルのパーサはまだ無いので、読むのは暫定の CSV (src/io/parsers.ts)。
 * 合成データでも試せるように「サンプルを読み込む」を置いてある。
 */

import { buildReport, type Report } from "./domain/report.js";
import { measureSensitivity } from "./domain/sensitivity.js";
import { assign, type Assignment } from "./domain/solve.js";
import {
  defaultParams,
  randomSeed,
  type Instance,
  type MissingScorePolicy,
  type Params,
} from "./domain/types.js";
import { sampleInstance } from "./dev/sampleInstance.js";
import {
  downloadCsv,
  downloadWorkbook,
  labsCsv,
  outputFileName,
  resultWorkbook,
  studentsCsv,
  summaryCsv,
} from "./io/export.js";
import { buildInstance } from "./io/intake.js";
import { createDropZone, message } from "./ui/dropzone.js";
import { renderMessages, renderReport } from "./ui/render.js";
import { renderSensitivity } from "./ui/sensitivity.js";

const app = document.querySelector<HTMLElement>("#app");
if (app === null) throw new Error("#app is missing from index.html");

app.innerHTML = `
  <section class="panel">
    <h2>1. 入力ファイル</h2>
    <div id="intake"></div>
    <p class="hint">
      希望順位・GPA・教員裁量点の 3 種類。裁量点は研究室ごとに分かれていて構いません。
      研究室・定員のファイルは任意で、無ければ希望順位から研究室を読み取り、定員は
      合計が学生数になるように決めます。形式は README を参照してください。
    </p>
    <button type="button" id="useSample">サンプルデータを読み込む</button>
  </section>

  <form class="panel" id="controls">
    <h2>2. パラメータ</h2>
    <div class="row">
      <label>抽選シード <span class="hint">同点処理に使う</span>
        <input id="seed" type="number" min="0" step="1" required />
      </label>
      <button type="button" id="reseed">引き直す</button>
    </div>
    <div class="row">
      <label>GPA 配点 <input id="gpaWeight" type="number" min="0" max="100" step="1" /></label>
      <label>GPA の満点 <input id="gpaMax" type="number" min="0.1" step="0.1" /></label>
      <label>裁量点 配点 <input id="discWeight" type="number" min="0" max="100" step="1" /></label>
      <label>裁量点の満点 <input id="discMax" type="number" min="0.1" step="0.1" /></label>
    </div>
    <div class="row">
      <label>裁量点が無い学生
        <select id="missingScore">
          <option value="zero">0 点として扱う</option>
          <option value="unacceptable">受け入れ不可にする</option>
        </select>
      </label>
    </div>
    <button type="submit" class="primary">配属を計算する</button>
    <p id="error" class="error" hidden></p>
  </form>

  <p id="warnings" class="warnings" hidden></p>
  <section id="output"></section>
`;

const field = (id: string) => app.querySelector<HTMLInputElement>(`#${id}`)!;
const missingScoreField = app.querySelector<HTMLSelectElement>("#missingScore")!;
const errorBox = app.querySelector<HTMLElement>("#error")!;
const warningBox = app.querySelector<HTMLElement>("#warnings")!;
const output = app.querySelector<HTMLElement>("#output")!;

// ページを開くたびに新しいシードを引く
field("seed").value = String(randomSeed());
field("gpaWeight").value = String(defaultParams.gpaWeight);
field("gpaMax").value = String(defaultParams.gpaMax);
field("discWeight").value = String(defaultParams.discretionaryWeight);
field("discMax").value = String(defaultParams.discretionaryMax);

const dropZone = createDropZone(app.querySelector<HTMLElement>("#intake")!);

/** 直近の結果。ダウンロードのために持っておく。 */
let latest: {
  instance: Instance;
  report: Report;
  params: Params;
  assignment: Assignment;
} | null = null;
/** サンプルを使っているときだけ入る。ファイルを入れれば消える。 */
let sample: Instance | null = null;

dropZone.onChange(() => {
  // 入力が変わった時点で、表示中の結果は前の入力のもの。残すと、いま入れた
  // ファイルの結果だと思って読まれるし、ダウンロードもそちらを書き出す。
  sample = null;
  clear();
});

function clear(): void {
  latest = null;
  output.innerHTML = "";
  warningBox.hidden = true;
  errorBox.hidden = true;
}

app.querySelector<HTMLButtonElement>("#useSample")!.addEventListener("click", () => {
  sample = sampleInstance({ numStudents: 150, numLabs: 10, seed: 4242 });
  run();
});

app.querySelector<HTMLButtonElement>("#reseed")!.addEventListener("click", () => {
  field("seed").value = String(randomSeed());
  if (latest !== null) run();
});

app.querySelector<HTMLFormElement>("#controls")!.addEventListener("submit", (event) => {
  event.preventDefault();
  run();
});

output.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest("#runSensitivity") !== null) {
    runSensitivity();
    return;
  }

  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-download]");
  if (button === null || latest === null) return;
  const { instance, report, params } = latest;
  const kind = button.dataset["download"]!;

  if (kind === "workbook") {
    void resultWorkbook(instance, report, params)
      .then((bytes) => downloadWorkbook(outputFileName("result", params.seed, "xlsx"), bytes))
      .catch((cause: unknown) => {
        errorBox.textContent = `Excel を作れませんでした: ${message(cause)}`;
        errorBox.hidden = false;
      });
    return;
  }

  const csv =
    kind === "students"
      ? studentsCsv(instance, report)
      : kind === "labs"
        ? labsCsv(instance, report)
        : summaryCsv(report, params);
  downloadCsv(outputFileName(kind, params.seed), csv);
});

function readParams(): Params {
  return {
    seed: Number(field("seed").value),
    gpaWeight: Number(field("gpaWeight").value),
    gpaMax: Number(field("gpaMax").value),
    discretionaryWeight: Number(field("discWeight").value),
    discretionaryMax: Number(field("discMax").value),
    missingScore: missingScoreField.value as MissingScorePolicy,
  };
}

function runSensitivity(): void {
  if (latest === null) return;
  const box = output.querySelector<HTMLElement>("#sensitivityOut");
  const field = output.querySelector<HTMLInputElement>("#runs");
  if (box === null || field === null) return;

  const { instance, params, assignment } = latest;
  box.innerHTML = `<p class="hint">計算中…</p>`;
  // 一度描いてから計算する（学生数が多いと数秒かかることがある）
  window.setTimeout(() => {
    try {
      const result = measureSensitivity(instance, params, assignment, Number(field.value));
      renderSensitivity(box, instance, result);
    } catch (cause) {
      box.innerHTML = "";
      errorBox.textContent = message(cause);
      errorBox.hidden = false;
    }
  }, 0);
}

/** 何から出した結果なのかを、結果と一緒に出すための一行。 */
function source(files: readonly { name: string }[]): string {
  return sample === null
    ? files.map((file) => file.name).join("、")
    : "サンプルデータ（合成、実ファイルではありません）";
}

function run(): void {
  errorBox.hidden = true;
  try {
    const files = dropZone.files();
    if (files.length === 0 && sample === null) {
      throw new Error("入力ファイルを読み込むか、サンプルデータを使ってください");
    }

    const params = readParams();
    const built =
      sample === null ? buildInstance(files, params.seed) : { instance: sample, warnings: [] };
    const assignment = assign(built.instance, params);
    const report = buildReport(built.instance, assignment);

    latest = { instance: built.instance, report, params, assignment };
    renderMessages(warningBox, built.warnings);
    renderReport(output, built.instance, report, source(files));
  } catch (cause) {
    latest = null;
    output.innerHTML = "";
    warningBox.hidden = true;
    errorBox.textContent = message(cause);
    errorBox.hidden = false;
  }
}
