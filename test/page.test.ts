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
    expect(output.querySelectorAll("[data-download]")).toHaveLength(3);

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
