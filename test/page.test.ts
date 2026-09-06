// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

/** main.ts が読み込み時に落ちず、結果の表まで描くことだけを見る煙感知器。 */
describe("page", () => {
  it("読み込むとシードを引いて配属結果を描く", async () => {
    document.body.innerHTML = `<main id="app"></main>`;
    await import("../src/main.js");
    const app = document.querySelector("#app")!;

    const seed = app.querySelector<HTMLInputElement>("#seed")!;
    expect(Number(seed.value)).toBeGreaterThanOrEqual(0);

    expect(app.querySelectorAll("table").length).toBeGreaterThanOrEqual(3);
    expect(app.textContent).toContain("ブロッキングペアはありません");
    expect(app.textContent).toContain(seed.value);
  });
});
