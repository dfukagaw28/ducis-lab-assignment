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
    expect(guessRole("answer-utf8-sample.txt")).toBe("preferences");
    expect(guessRole("eclass-scores-L01.csv")).toBe("scores");
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

  it("定員の列が無ければ学生数から割り出し、そう言う", () => {
    const noCapacity = files.map((file) =>
      file.role === "labs"
        ? {
            ...file,
            text: file.text
              .replace("研究室,研究室名,定員", "研究室,研究室名")
              .replace(/^(L\d+),([^,]*),\d+$/gm, "$1,$2"),
          }
        : file
    );
    const { instance, warnings } = buildInstance(noCapacity);
    // 学生 12 人 ÷ 研究室 4 室 = 3
    expect(instance.labs.map((lab) => lab.capacity)).toEqual([3, 3, 3, 3]);
    expect(warnings.join()).toMatch(/定員の指定が無いので/);
  });

  it("一部の研究室だけ定員が空欄なら、書き忘れとみて止まる", () => {
    const partial = files.map((file) =>
      file.role === "labs" ? { ...file, text: file.text.replace("L02,知能情報,3", "L02,知能情報,") } : file
    );
    expect(() => buildInstance(partial)).toThrow(/L02 の定員が空欄/);
  });

  it("エラーにファイル名を添える", () => {
    const broken = files.map((file) =>
      file.role === "gpa" ? { ...file, text: "学籍番号,GPA\nS001,あ\n" } : file
    );
    expect(() => buildInstance(broken)).toThrow(/gpa\.csv/);
  });
});

describe("buildInstance（eClass のファイルから）", () => {
  const eclassFiles: SourceFile[] = [
    sample("answer-utf8-sample.txt", "preferences"),
    sample("eclass-gpa.csv", "gpa"),
    sample("eclass-labs.csv", "labs"),
    sample("eclass-scores-L01.csv", "scores"),
    sample("eclass-scores-L02.csv", "scores"),
    sample("eclass-scores-L03.csv", "scores"),
    sample("eclass-scores-L04.csv", "scores"),
  ];

  it("暫定 CSV でなくても、そうと見分けて読む", () => {
    const { instance } = buildInstance(eclassFiles);
    expect(instance.students).toHaveLength(9);
    expect(instance.labs).toHaveLength(4);
  });

  it("選択肢ラベルを研究室 ID に読み替える", () => {
    const { instance } = buildInstance(eclassFiles);
    const taro = instance.students.find((student) => student.id === "1234560002")!;
    expect(taro.name).toBe("架空　太郎");
    // 回答は 4, 1, 3, 2
    expect(taro.preferences).toEqual(["L04", "L01", "L03", "L02"]);
  });

  it("回答しなかった学生は希望なしのまま通す", () => {
    const { instance } = buildInstance(eclassFiles);
    const blank = instance.students.find((student) => student.id === "1234560005")!;
    expect(blank.preferences).toEqual([]);
  });

  it("選択肢ラベルの列が無ければ研究室名で突き合わせる", () => {
    const byName = eclassFiles.map((file) =>
      file.role === "labs"
        ? {
            ...file,
            // 選択肢ラベルの列を落とし、研究室名をラベルと同じにする
            text: file.text
              .replace("研究室,研究室名,定員,選択肢ラベル", "研究室,研究室名,定員")
              .replace(/^(L\d+),[^,]*,(\d+),(.*)$/gm, "$1,$3,$2"),
          }
        : file
    );
    const { instance } = buildInstance(byName);
    const taro = instance.students.find((student) => student.id === "1234560002")!;
    expect(taro.preferences).toEqual(["L04", "L01", "L03", "L02"]);
  });

  it("空白の入れ方が違っても突き合わせる", () => {
    const spaced = eclassFiles.map((file) =>
      file.role === "labs" ? { ...file, text: file.text.replace(/　/g, " ") } : file
    );
    const { instance } = buildInstance(spaced);
    expect(instance.students[0]!.preferences).toHaveLength(4);
  });

  it("定員の列が無ければ切り上げるので、割り切れなくても全員が収まる", () => {
    const noCapacity = eclassFiles.map((file) =>
      file.role === "labs"
        ? {
            ...file,
            text: file.text
              .replace("研究室,研究室名,定員,選択肢ラベル", "研究室,研究室名,選択肢ラベル")
              .replace(/^(L\d+),([^,]*),\d+,(.*)$/gm, "$1,$2,$3"),
          }
        : file
    );
    const { instance, warnings } = buildInstance(noCapacity);
    // 学生 9 人 ÷ 研究室 4 室 = 2.25 → 3
    expect(instance.labs.map((lab) => lab.capacity)).toEqual([3, 3, 3, 3]);
    expect(instance.labs.reduce((sum, lab) => sum + lab.capacity, 0)).toBeGreaterThanOrEqual(
      instance.students.length
    );
    expect(warnings.join()).toMatch(/定員の指定が無いので/);
  });

  it("突き合わせられない研究室があれば、その名前を言って止まる", () => {
    const broken = eclassFiles.map((file) =>
      file.role === "labs" ? { ...file, text: file.text.replace("◇◇研究室（◇◇　◇◇）", "別名") } : file
    );
    expect(() => buildInstance(broken)).toThrow(/◇◇研究室（◇◇　◇◇）/);
    expect(() => buildInstance(broken)).toThrow(/選択肢ラベル/);
  });

  it("同じ名前の研究室が二つあれば止まる", () => {
    const clashing = eclassFiles.map((file) =>
      file.role === "labs"
        ? { ...file, text: file.text.replace("△△研究室（△△　△△）", "○○研究室（○○　○○）") }
        : file
    );
    expect(() => buildInstance(clashing)).toThrow(/同じ名前/);
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
