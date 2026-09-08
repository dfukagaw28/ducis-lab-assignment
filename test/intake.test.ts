// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildInstance, guessRole, type SourceFile } from "../src/io/intake.js";
import { parsePreferences } from "../src/io/parsers.js";
import { readWorkbook, sheetOf } from "../src/io/xlsx.js";

const SEED = 20260907;

/** Excel のシートを行と列にして返す（ドロップゾーンがするのと同じこと）。 */
function sheetRows(name: string, sheet: string): string[][] {
  const bytes = new Uint8Array(readFileSync(resolve("samples", name)));
  return sheetOf(readWorkbook(bytes), sheet).rows;
}

function fromSamples(name: string, role: SourceFile["role"]): SourceFile {
  return { name, role, text: readFileSync(resolve("samples", name), "utf8") };
}

function scoreSheet(teacher: string): SourceFile {
  const name = `教員裁量点_${teacher}先生.xlsx`;
  return { name, role: "scores", text: "", rows: sheetRows(name, "教員裁量点") };
}

/**
 * 暫定 CSV 形式の一式。samples/ には eClass と Excel の見本しか置いていないので、
 * この形式の確かめはここで組み立てる。
 */
const csvFiles: SourceFile[] = [
  {
    name: "preferences.csv",
    role: "preferences",
    text: [
      "学籍番号,氏名,第1希望,第2希望,第3希望,第4希望",
      "S001,学生01,L01,L04,L02,L03",
      "S002,学生02,L03,L02,L04,L01",
      "S003,学生03,L02,L03,L04,L01",
      "S004,学生04,L01,L02,L04,L03",
      "S005,学生05,L04,L03,L01,L02",
      "S006,学生06,L02,L03,L04,L01",
      "S007,学生07,L03,L01,L02,L04",
      "S008,学生08,L04,L03,L02,L01",
      "S009,学生09,L04,L03,L02,L01",
      "S010,学生10,L04,L02,L03,L01",
      "S011,学生11,L03,L02,L01,L04",
      "S012,学生12,L04,L03,L01,L02",
    ].join("\n"),
  },
  {
    name: "gpa.csv",
    role: "gpa",
    text: ["学籍番号,GPA"]
      .concat(
        Array.from({ length: 12 }, (_, i) => `S${String(i + 1).padStart(3, "0")},${2 + (i % 5) * 0.4}`)
      )
      .join("\n"),
  },
  {
    name: "labs.csv",
    role: "labs",
    text: [
      "研究室,研究室名,定員",
      "L01,情報数理,3",
      "L02,知能情報,3",
      "L03,計算機科学,3",
      "L04,データ科学,3",
    ].join("\n"),
  },
  ...["L01", "L02", "L03", "L04"].map((lab, index) => ({
    name: `scores_${lab}.csv`,
    role: "scores" as const,
    text: ["研究室,学籍番号,裁量点"]
      .concat(
        Array.from(
          { length: 12 },
          (_, i) => `${lab},S${String(i + 1).padStart(3, "0")},${(i * 7 + index * 13) % 61}`
        )
      )
      .join("\n"),
  })),
];

/** eClass の書き出しと Excel の一式（samples/ にあるもの）。 */
const eclassFiles: SourceFile[] = [
  fromSamples("answer-utf8-sample.txt", "preferences"),
  { name: "GPA.xlsx", role: "gpa", text: "", rows: sheetRows("GPA.xlsx", "GPA") },
  fromSamples("labs.csv", "labs"),
  ...["○○", "△△", "□□", "◇◇"].map(scoreSheet),
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
    const { instance, warnings } = buildInstance(csvFiles, SEED);
    expect(instance.students).toHaveLength(12);
    expect(instance.labs).toHaveLength(4);
    expect(warnings).toEqual([]);

    const first = instance.students[0]!;
    expect(first.id).toBe("S001");
    expect(first.name).toBe("学生01");
    expect(first.preferences).toEqual(["L01", "L04", "L02", "L03"]);
    expect(first.gpa).toBe(2);

    const lab = instance.labs.find((entry) => entry.id === "L01")!;
    expect(lab.name).toBe("情報数理");
    expect(lab.capacity).toBe(3);
    expect(lab.scores.get("S001")).toBe(0);
    expect(lab.scores.get("S002")).toBe(7);
  });

  it("研究室ごとの裁量点ファイルをまとめて受ける", () => {
    const { instance } = buildInstance(csvFiles, SEED);
    for (const lab of instance.labs) expect(lab.scores.size).toBe(12);
  });

  it("足りないファイルを教える", () => {
    expect(() => buildInstance(csvFiles.filter((file) => file.role !== "gpa"), SEED)).toThrow(/GPA/);
    expect(() => buildInstance(csvFiles.filter((file) => file.role !== "scores"), SEED)).toThrow(/裁量点/);
  });

  it("同じ種類が二つあれば拒む", () => {
    expect(() => buildInstance([...csvFiles, csvFiles.find((file) => file.role === "gpa")!], SEED)).toThrow(/2 個/);
  });

  it("研究室一覧に無い研究室を希望していれば、その旨を伝えて止まる", () => {
    const broken = csvFiles.map((file) =>
      file.role === "preferences"
        ? { ...file, text: file.text.replace("L04", "L09") }
        : file
    );
    expect(() => buildInstance(broken, SEED)).toThrow(/L09/);
  });

  it("GPA の無い学生を警告する", () => {
    const missing = csvFiles.map((file) =>
      file.role === "gpa" ? { ...file, text: file.text.replace(/^S001,.*$/m, "") } : file
    );
    const { warnings, instance } = buildInstance(missing, SEED);
    expect(warnings.some((warning) => warning.includes("S001"))).toBe(true);
    expect(instance.students[0]!.gpa).toBe(0);
  });

  it("定員が足りなければ未配属が出ることを警告する", () => {
    const tight = csvFiles.map((file) =>
      file.role === "labs" ? { ...file, text: file.text.replaceAll(",3", ",2") } : file
    );
    expect(buildInstance(tight, SEED).warnings.some((w) => w.includes("未配属"))).toBe(true);
  });

  it("定員の列が無ければ、合計がちょうど学生数になるよう割り当て、そう言う", () => {
    const noCapacity = csvFiles.map((file) =>
      file.role === "labs"
        ? {
            ...file,
            text: file.text
              .replace("研究室,研究室名,定員", "研究室,研究室名")
              .replace(/^(L\d+),([^,]*),\d+$/gm, "$1,$2"),
          }
        : file
    );
    const { instance, warnings } = buildInstance(noCapacity, SEED);
    // 学生 12 人 ÷ 研究室 4 室 = 3 で割り切れる
    expect(instance.labs.map((lab) => lab.capacity)).toEqual([3, 3, 3, 3]);
    expect(warnings.join()).toMatch(/合計がちょうど学生数（12 人）/);
  });

  it("一部の研究室だけ定員が空欄なら、書き忘れとみて止まる", () => {
    const partial = csvFiles.map((file) =>
      file.role === "labs" ? { ...file, text: file.text.replace("L02,知能情報,3", "L02,知能情報,") } : file
    );
    expect(() => buildInstance(partial, SEED)).toThrow(/L02 の定員が空欄/);
  });

  it("エラーにファイル名を添える", () => {
    const broken = csvFiles.map((file) =>
      file.role === "gpa" ? { ...file, text: "学籍番号,GPA\nS001,あ\n" } : file
    );
    expect(() => buildInstance(broken, SEED)).toThrow(/gpa\.csv/);
  });
});

describe("buildInstance（eClass と Excel のファイルから）", () => {
  it("暫定 CSV でなくても、そうと見分けて読む", () => {
    const { instance } = buildInstance(eclassFiles, SEED);
    // 回答したのは 9 人。名簿（GPA）にはもう 1 人いる
    expect(instance.students.filter((student) => student.preferences.length > 0)).toHaveLength(8);
    expect(instance.students).toHaveLength(10);
    expect(instance.labs).toHaveLength(4);
  });

  it("選択肢ラベルを研究室 ID に読み替える", () => {
    const { instance } = buildInstance(eclassFiles, SEED);
    const taro = instance.students.find((student) => student.id === "1234560002")!;
    expect(taro.name).toBe("架空　太郎");
    // 回答は 4, 1, 3, 2
    expect(taro.preferences).toEqual(["L04", "L01", "L03", "L02"]);
  });

  it("回答しなかった学生は希望なしのまま通す", () => {
    const { instance } = buildInstance(eclassFiles, SEED);
    const blank = instance.students.find((student) => student.id === "1234560005")!;
    expect(blank.preferences).toEqual([]);
  });

  it("希望順位を出していない学生も、希望なしとして配属の対象にする", () => {
    const { instance, warnings } = buildInstance(eclassFiles, SEED);
    // 回答したのは 9 人、GPA には 10 人いる
    expect(instance.students).toHaveLength(10);
    const absent = instance.students.find((student) => student.id === "1234560007")!;
    expect(absent.preferences).toEqual([]);
    expect(absent.gpa).toBe(3.21);
    expect(warnings.join()).toMatch(/1 人が希望順位を出していません（1234560007）/);
  });

  it("希望順位を出していない学生の氏名を裁量点の表から取る", () => {
    const withExcel: SourceFile[] = [
      ...eclassFiles.filter((file) => file.role !== "scores"),
      {
        name: "教員裁量点_○○先生.xlsx",
        role: "scores",
        text: "",
        rows: sheetRows("教員裁量点_○○先生.xlsx", "教員裁量点"),
      },
    ];
    const { instance } = buildInstance(withExcel, SEED);
    const absent = instance.students.find((student) => student.id === "1234560007")!;
    expect(absent.name).toBe("鈴木 サンプル");
  });

  it("選択肢ラベルの列が無ければ研究室名で突き合わせる", () => {
    const byName = eclassFiles.map((file) =>
      file.role === "labs"
        ? {
            ...file,
            // 選択肢ラベルの列を落とし、研究室名をラベルと同じにする
            text: file.text
              .replace("研究室,研究室名,定員,選択肢ラベル,教員氏名", "研究室,研究室名,定員,教員氏名")
              .replace(/^(L\d+),[^,]*,(\d+),([^,]*),(.*)$/gm, "$1,$3,$2,$4"),
          }
        : file
    );
    const { instance } = buildInstance(byName, SEED);
    const taro = instance.students.find((student) => student.id === "1234560002")!;
    expect(taro.preferences).toEqual(["L04", "L01", "L03", "L02"]);
  });

  it("空白の入れ方が違っても突き合わせる", () => {
    const spaced = eclassFiles.map((file) =>
      file.role === "labs" ? { ...file, text: file.text.replace(/　/g, " ") } : file
    );
    const { instance } = buildInstance(spaced, SEED);
    expect(instance.students[0]!.preferences).toHaveLength(4);
  });

  it("割り切れないときは余りを配り、合計をちょうど学生数にする", () => {
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
    const { instance, warnings } = buildInstance(noCapacity, SEED);
    const seats = instance.labs.map((lab) => lab.capacity);

    // 学生 10 人 ÷ 研究室 4 室 = 2 余り 2。2 室が 3 人になる
    expect(seats.reduce((a, b) => a + b, 0)).toBe(instance.students.length);
    expect(seats.filter((n) => n === 3)).toHaveLength(2);
    expect(seats.filter((n) => n === 2)).toHaveLength(2);
    expect(warnings.join()).toMatch(/希望の多い .* は \+1 人/);
  });

  it("教員ごとの Excel を、教員氏名で研究室に結びつける", () => {
    const withExcel: SourceFile[] = [
      ...eclassFiles.filter((file) => file.role !== "scores"),
      ...["○○", "△△", "□□", "◇◇"].map(scoreSheet),
    ];
    const { instance } = buildInstance(withExcel, SEED);
    const lab = instance.labs.find((entry) => entry.id === "L01")!;
    // テンプレートは 10 人ぶんあり、回答したのは 9 人
    expect(lab.scores.size).toBe(10);
    expect(lab.scores.get("1234560002")).toBeGreaterThanOrEqual(0);
  });

  it("名簿と裁量点の表が揃っていれば何も言わない", () => {
    const withExcel: SourceFile[] = [
      ...eclassFiles.filter((file) => file.role !== "scores"),
      ...["○○", "△△", "□□", "◇◇"].map(scoreSheet),
    ];
    const { warnings } = buildInstance(withExcel, SEED);
    expect(warnings.filter((warning) => /点数がありません|名簿に無い/.test(warning))).toEqual([]);
  });

  it("教員の表から学生の行が消えていれば、そう言う", () => {
    const rows = sheetRows("教員裁量点_○○先生.xlsx", "教員裁量点");
    const withExcel: SourceFile[] = [
      ...eclassFiles.filter((file) => file.role !== "scores"),
      {
        name: "教員裁量点_○○先生.xlsx",
        role: "scores",
        text: "",
        // 1234560007 の行を消す（空欄なら読み取りが止まるが、行が無いと 0 点になる）
        rows: rows.filter((row) => row[0] !== "1234560007"),
      },
    ];
    const { warnings } = buildInstance(withExcel, SEED);
    expect(warnings.join()).toMatch(/教員裁量点_○○先生\.xlsx: 名簿にいる 1 人の点数がありません（1234560007）/);
  });

  it("名簿に無い学生の点数があれば、そう言って無視する", () => {
    const rows = sheetRows("教員裁量点_○○先生.xlsx", "教員裁量点");
    const withExcel: SourceFile[] = [
      ...eclassFiles.filter((file) => file.role !== "scores"),
      {
        name: "教員裁量点_○○先生.xlsx",
        role: "scores",
        text: "",
        rows: [...rows, ["9999999999", "他学科　学生", "○○　○○", "60"]],
      },
    ];
    const { instance, warnings } = buildInstance(withExcel, SEED);
    expect(warnings.join()).toMatch(/名簿に無い 1 人の点数があります（9999999999）/);
    expect(instance.students.some((student) => student.id === "9999999999")).toBe(false);
  });

  it("教員氏名が研究室一覧に無ければ、入れるべき列を言って止まる", () => {
    const noTeacher = [
      ...eclassFiles.filter((file) => file.role !== "scores" && file.role !== "labs"),
      {
        ...eclassFiles.find((file) => file.role === "labs")!,
        text: eclassFiles
          .find((file) => file.role === "labs")!
          .text.replace(",教員氏名", "")
          .replace(/,[^,]*$/gm, ""),
      },
      {
        name: "教員裁量点_○○先生.xlsx",
        role: "scores" as const,
        text: "",
        rows: sheetRows("教員裁量点_○○先生.xlsx", "教員裁量点"),
      },
    ];
    expect(() => buildInstance(noTeacher, SEED)).toThrow(/教員氏名/);
  });

  it("突き合わせられない研究室があれば、その名前を言って止まる", () => {
    const broken = eclassFiles.map((file) =>
      file.role === "labs" ? { ...file, text: file.text.replace("◇◇研究室（◇◇　◇◇）", "別名") } : file
    );
    expect(() => buildInstance(broken, SEED)).toThrow(/◇◇研究室（◇◇　◇◇）/);
    expect(() => buildInstance(broken, SEED)).toThrow(/選択肢ラベル/);
  });

  it("同じ名前の研究室が二つあれば止まる", () => {
    const clashing = eclassFiles.map((file) =>
      file.role === "labs"
        ? { ...file, text: file.text.replace("△△研究室（△△　△△）", "○○研究室（○○　○○）") }
        : file
    );
    expect(() => buildInstance(clashing, SEED)).toThrow(/同じ名前/);
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
