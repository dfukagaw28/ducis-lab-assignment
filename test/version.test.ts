import { describe, expect, it } from "vitest";

import { VERSION, versionLine } from "../src/version.js";

describe("VERSION", () => {
  it("define が埋まらない経路でも落ちず、不明と分かる値になる", () => {
    // vitest は vitest.config.ts を使うので __COMMIT__ は定義されない。
    // ここで落ちると、ビルド以外の経路（テスト・node での実行）が全部止まる
    expect(VERSION.commit).toBe("不明");
    expect(VERSION.builtAt).toBe("不明");
  });
});

describe("versionLine", () => {
  it("画面とサマリで同じ一行になる", () => {
    expect(versionLine({ commit: "v1.0-3-g710d9b2", builtAt: "2026-09-25 14:03 JST" })).toBe(
      "v1.0-3-g710d9b2（2026-09-25 14:03 JST ビルド）"
    );
  });
});
