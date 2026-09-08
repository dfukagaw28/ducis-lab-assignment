// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";

/** 画面が組み上がり、計算まで届くことだけを見る煙感知器。 */
describe("page", () => {
  let app: HTMLElement;

  beforeAll(async () => {
    document.body.innerHTML = `<main id="app"></main>`;
    await import("../src/main.js");
    app = document.querySelector<HTMLElement>("#app")!;
  });

  it("読み込み時にシードを引き、入力の受け口を出す", () => {
    const seed = app.querySelector<HTMLInputElement>("#seed")!;
    expect(Number(seed.value)).toBeGreaterThanOrEqual(0);
    expect(app.querySelector("#drop")).not.toBeNull();
    expect(app.querySelector("#output")!.innerHTML).toBe("");
  });

  it("入力が無いまま計算しようとすると理由を出す", () => {
    const form = app.querySelector<HTMLFormElement>("#controls")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    const error = app.querySelector<HTMLElement>("#error")!;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain("サンプル");
  });

  it("サンプルデータなら結果と書き出しボタンまで出る", () => {
    app.querySelector<HTMLButtonElement>("#useSample")!.click();

    const output = app.querySelector<HTMLElement>("#output")!;
    expect(output.textContent).toContain("サンプルデータ（合成、実ファイルではありません）");
    expect(output.querySelectorAll("table").length).toBeGreaterThanOrEqual(3);
    expect(output.textContent).toContain("ブロッキングペアはありません");
    // Excel 1 つと CSV 3 つ
    expect(output.querySelectorAll("[data-download]")).toHaveLength(4);
    expect(output.querySelector('[data-download="workbook"]')).not.toBeNull();

    const seed = app.querySelector<HTMLInputElement>("#seed")!;
    expect(output.textContent).toContain(seed.value);
    expect(app.querySelector<HTMLElement>("#error")!.hidden).toBe(true);
  });

  it("引き直すとシードが変わり、結果に反映される", () => {
    const seed = app.querySelector<HTMLInputElement>("#seed")!;
    const before = seed.value;
    app.querySelector<HTMLButtonElement>("#reseed")!.click();

    expect(seed.value).not.toBe(before);
    expect(app.querySelector<HTMLElement>("#output")!.textContent).toContain(seed.value);
  });

  it("希望順位の内訳に帯を添える", () => {
    const table = app.querySelector<HTMLElement>("table.distribution")!;
    const bars = table.querySelectorAll<HTMLElement>(".bar");
    expect(bars.length).toBeGreaterThan(0);

    for (const bar of bars) {
      // 帯の長さは学生数に対する割合
      expect(bar.style.width).toMatch(/^\d+(\.\d+)?%$/);
    }

    // 色だけに頼らせない。区分の名前と人数はどの行にも文字で出る
    for (const row of table.querySelectorAll("tbody tr")) {
      expect(row.children[0]!.textContent).toMatch(/希望|未配属/);
      expect(row.children[1]!.textContent).toMatch(/^\d+$/);
    }
  });

  it("シードのぶれを試すと、その場に結果が出る", async () => {
    const runs = app.querySelector<HTMLInputElement>("#runs")!;
    runs.value = "20";
    app.querySelector<HTMLButtonElement>("#runSensitivity")!.click();

    const box = app.querySelector<HTMLElement>("#sensitivityOut")!;
    expect(box.textContent).toContain("計算中");

    // 描いてから計算するので、一度譲る
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(box.textContent).toContain("配属先が動かなかった");
    expect(box.textContent).toContain("20 通り");
  });

  it("ファイルを入れると、前の入力で出した結果を消す", async () => {
    const output = app.querySelector<HTMLElement>("#output")!;
    expect(output.textContent).toContain("サンプルデータ");

    // ドロップゾーンにファイルを落とす（jsdom には DataTransfer が無いので手で作る）
    const file = new File(["研究室,研究室名,定員\nL01,甲,3\n"], "labs.csv", { type: "text/csv" });
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
    app.querySelector<HTMLElement>("#drop")!.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 残っていると、いま入れたファイルの結果だと思って読まれてしまう
    expect(output.innerHTML).toBe("");
    expect(app.querySelector<HTMLElement>("#warnings")!.hidden).toBe(true);
    expect(app.querySelector("#fileTable")).not.toBeNull();
  });
});
