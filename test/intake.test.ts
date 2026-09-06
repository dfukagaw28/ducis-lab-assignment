import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildInstance, guessRole, type SourceFile } from "../src/io/intake.js";
import { parsePreferences } from "../src/io/parsers.js";

function sample(name: string, role: SourceFile["role"]): SourceFile {
  return { name, role, text: readFileSync(new URL(`../samples/${name}`, import.meta.url), "utf8") };
}

const files: SourceFile[] = [
  sample("preferences.csv", "preferences"),
  sample("gpa.csv", "gpa"),
  sample("labs.csv", "labs"),
  sample("scores_L01.csv", "scores"),
  sample("scores_L02.csv", "scores"),
  sample("scores_L03.csv", "scores"),
  sample("scores_L04.csv", "scores"),
];

describe("guessRole", () => {
  it("ファイル名から種類を当てる", () => {
    expect(guessRole("preferences.csv")).toBe("preferences");
    expect(guessRole("2026_希望調査.csv")).toBe("preferences");
    expect(guessRole("gpa.csv")).toBe("gpa");
    expect(guessRole("成績一覧.csv")).toBe("gpa");
    expect(guessRole("labs.csv")).toBe("labs");
    expect(guessRole("研究室定員.csv")).toBe("labs");
    expect(guessRole("L01.csv")).toBe("scores");
  });
});

describe("buildInstance", () => {
  it("サンプル一式を読み込む", () => {
    const { instance, warnings } = buildInstance(files);
    expect(instance.students).toHaveLength(12);
    expect(instance.labs).toHaveLength(4);
    expect(warnings).toEqual([]);

    const first = instance.students[0]!;
    expect(first.id).toBe("S001");
    expect(first.name).toBe("学生01");
    expect(first.preferences).toEqual(["L01", "L04", "L02", "L03"]);
    expect(first.gpa).toBe(1.9);

    const lab = instance.labs.find((entry) => entry.id === "L01")!;
    expect(lab.name).toBe("情報数理");
    expect(lab.capacity).toBe(3);
    expect(lab.scores.get("S001")).toBe(12);
  });

  it("研究室ごとの裁量点ファイルをまとめて受ける", () => {
    const { instance } = buildInstance(files);
    for (const lab of instance.labs) expect(lab.scores.size).toBe(12);
  });

  it("足りないファイルを教える", () => {
    expect(() => buildInstance(files.filter((file) => file.role !== "gpa"))).toThrow(/GPA/);
    expect(() => buildInstance(files.filter((file) => file.role !== "scores"))).toThrow(/裁量点/);
  });

  it("同じ種類が二つあれば拒む", () => {
    expect(() => buildInstance([...files, sample("gpa.csv", "gpa")])).toThrow(/2 個/);
  });

  it("研究室一覧に無い研究室を希望していれば、その旨を伝えて止まる", () => {
    const broken = files.map((file) =>
      file.role === "preferences"
        ? { ...file, text: file.text.replace("L04", "L09") }
        : file
    );
    expect(() => buildInstance(broken)).toThrow(/L09/);
  });

  it("GPA の無い学生を警告する", () => {
    const missing = files.map((file) =>
      file.role === "gpa" ? { ...file, text: file.text.replace(/^S001,.*$/m, "") } : file
    );
    const { warnings, instance } = buildInstance(missing);
    expect(warnings.some((warning) => warning.includes("S001"))).toBe(true);
    expect(instance.students[0]!.gpa).toBe(0);
  });

  it("定員が足りなければ未配属が出ることを警告する", () => {
    const tight = files.map((file) =>
      file.role === "labs" ? { ...file, text: file.text.replaceAll(",3", ",2") } : file
    );
    expect(buildInstance(tight).warnings.some((w) => w.includes("未配属"))).toBe(true);
  });

  it("エラーにファイル名を添える", () => {
    const broken = files.map((file) =>
      file.role === "gpa" ? { ...file, text: "学籍番号,GPA\nS001,あ\n" } : file
    );
    expect(() => buildInstance(broken)).toThrow(/gpa\.csv/);
  });
});

describe("parsePreferences", () => {
  it("第N希望の列を番号順に読む", () => {
    const rows = parsePreferences("学籍番号,氏名,第2希望,第1希望\nS1,甲,B,A\n");
    expect(rows[0]!.preferences).toEqual(["A", "B"]);
  });

  it("第N希望の列が無ければ残りの列を左から読む", () => {
    const rows = parsePreferences("学籍番号,氏名,1,2\nS1,甲,A,B\n");
    expect(rows[0]!.preferences).toEqual(["A", "B"]);
  });

  it("空欄の希望を落とす", () => {
    const rows = parsePreferences("学籍番号,第1希望,第2希望,第3希望\nS1,A,,C\n");
    expect(rows[0]!.preferences).toEqual(["A", "C"]);
  });

  it("学籍番号の列が無ければ止まる", () => {
    expect(() => parsePreferences("氏名,第1希望\n甲,A\n")).toThrow(/学籍番号/);
  });
});
