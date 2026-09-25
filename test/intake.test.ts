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
 * 暫定 CSV 形式の一式。samples/ には e-class と Excel の見本しか置いていないので、
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

/** e-class の書き出しと Excel の一式（samples/ にあるもの）。 */
const eclassFiles: SourceFile[] = [
  fromSamples("answer-utf8-sample.txt", "preferences"),
  { name: "GPA.xlsx", role: "gpa", text: "", rows: sheetRows("GPA.xlsx", "GPA") },
  ...["○○", "△△", "□□", "◇◇"].map(scoreSheet),
];

/**
 * 研究室一覧。samples/ には置いていない（無くても動くので）が、これを渡したときの
 * 振る舞いも確かめたいので、ここで組み立てる。
 */
const labsCsv: SourceFile = {
  name: "labs.csv",
  role: "labs",
  text: [
    "研究室,研究室名,定員,選択肢ラベル,教員氏名",
    "L01,○○研究室,3,○○研究室（○○　○○）,○○　○○",
    "L02,△△研究室,3,△△研究室（△△　△△）,△△　△△",
    "L03,□□研究室,3,□□研究室（□□　□□）,□□　□□",
    "L04,◇◇研究室,3,◇◇研究室（◇◇　◇◇）,◇◇　◇◇",
  ].join("\n"),
};

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

  it("研究室一覧が無ければ、希望順位に出てくる研究室を集める", () => {
    const noLabs = csvFiles.filter((file) => file.role !== "labs");
    const { instance, warnings } = buildInstance(noLabs, SEED);
    expect(instance.labs.map((lab) => lab.name)).toEqual(["L01", "L02", "L03", "L04"]);
    expect(warnings.join()).toMatch(/研究室・定員のファイルが無いので、希望順位から 4 室/);
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

describe("buildInstance（e-class と Excel のファイルから）", () => {
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
    expect(taro.preferences).toEqual(["L02", "L04", "L03", "L01"]);
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

  it("学生 ID が一つも一致しなければ、全員未提出とはみなさず止まる", () => {
    // GPA 側の ID の書き方が違う（末尾に .0 が付いた、など）場合を想定する
    const shifted = eclassFiles.map((file) =>
      file.role === "gpa" && file.rows !== undefined
        ? {
            ...file,
            rows: file.rows.map((row, index) =>
              index === 0 ? row : [`${row[0]}.0`, ...row.slice(1)]
            ),
          }
        : file
    );
    // 進めてしまうと、GPA 側の 10 人が別人として名簿に足され、定員もその人数で決まる
    expect(() => buildInstance(shifted, SEED)).toThrow(/一つも一致しません/);
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
    const byName = [...eclassFiles, labsCsv].map((file) =>
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
    expect(taro.preferences).toEqual(["L02", "L04", "L03", "L01"]);
  });

  it("空白の入れ方が違っても突き合わせる", () => {
    const spaced = [...eclassFiles, labsCsv].map((file) =>
      file.role === "labs" ? { ...file, text: file.text.replace(/　/g, " ") } : file
    );
    const { instance } = buildInstance(spaced, SEED);
    expect(instance.students[0]!.preferences).toHaveLength(4);
  });

  it("割り切れないときは余りを配り、合計をちょうど学生数にする", () => {
    const noCapacity = [...eclassFiles, labsCsv].map((file) =>
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

  it("研究室一覧に教員氏名の列も、括弧の中の教員氏名も無ければ、止まる", () => {
    // 選択肢ラベルの括弧が教員氏名でない年（研究室の通称など）を想定する
    const noTeacher = [
      ...eclassFiles.map((file) =>
        file.role === "preferences"
          ? { ...file, text: file.text.replace(/（○○　○○）/g, "（情報数理）") }
          : file
      ),
      {
        ...labsCsv,
        text: labsCsv.text
          .replace(",教員氏名", "")
          .replace(/,[^,]*$/gm, "")
          .replace("○○研究室（○○　○○）", "○○研究室（情報数理）"),
      },
    ];
    expect(() => buildInstance(noTeacher, SEED)).toThrow(/教員氏名/);
  });

  it("研究室一覧が無くても、選択肢から研究室を読み取って配属できる", () => {
    const noLabs = eclassFiles;
    const { instance, warnings } = buildInstance(noLabs, SEED);

    expect(instance.labs).toHaveLength(4);
    // 選択肢の番号の順に L01… を振り、括弧の前を研究室名にする
    expect(instance.labs.map((lab) => lab.id)).toEqual(["L01", "L02", "L03", "L04"]);
    expect(instance.labs.map((lab) => lab.name)).toEqual([
      "○○研究室",
      "△△研究室",
      "□□研究室",
      "◇◇研究室",
    ]);
    expect(warnings.join()).toMatch(/希望順位から 4 室/);

    // 選択肢ラベルの括弧の中を教員氏名とみて、裁量点のファイルと繋がる
    expect(instance.labs.every((lab) => lab.scores.size === 10)).toBe(true);
    const taro = instance.students.find((student) => student.id === "1234560002")!;
    expect(taro.preferences).toEqual(["L02", "L04", "L03", "L01"]);
  });

  it("誰も挙げなかった研究室も選択肢から拾う", () => {
    // 回答から option4 を抜く。選択肢の行はそのままなので、研究室は 4 つ残る
    const noFourth = eclassFiles
      .filter((file) => file.role !== "labs")
      .map((file) =>
        file.role === "preferences"
          ? {
              ...file,
              text: file.text.replace(
                /"([\d,\s]*\d)"/g,
                (_, list: string) =>
                  `"${list
                    .split(",")
                    .map((value) => value.trim())
                    .filter((value) => value !== "4")
                    .join(", ")}"`
              ),
            }
          : file
      );
    const { instance } = buildInstance(noFourth, SEED);

    expect(instance.labs).toHaveLength(4);
    // 希望順位から集めていたら、誰も挙げていない L04 は落ちてしまう
    expect(instance.labs.map((lab) => lab.id)).toContain("L04");
    expect(instance.students.every((student) => !student.preferences.includes("L04"))).toBe(true);
  });

  it("括弧の中が教員氏名でなければ、入れるべき列を言って止まる", () => {
    const renamed = eclassFiles
      .filter((file) => file.role !== "labs")
      .map((file) =>
        file.role === "preferences"
          ? { ...file, text: file.text.replace(/（○○　○○）/g, "（別の人）") }
          : file
      );
    expect(() => buildInstance(renamed, SEED)).toThrow(/教員氏名/);
  });

  it("突き合わせられない研究室があれば、その名前を言って止まる", () => {
    const broken = [...eclassFiles, labsCsv].map((file) =>
      file.role === "labs" ? { ...file, text: file.text.replace("◇◇研究室（◇◇　◇◇）", "別名") } : file
    );
    expect(() => buildInstance(broken, SEED)).toThrow(/◇◇研究室（◇◇　◇◇）/);
    expect(() => buildInstance(broken, SEED)).toThrow(/選択肢ラベル/);
  });

  it("同じ名前の研究室が二つあれば止まる", () => {
    const clashing = [...eclassFiles, labsCsv].map((file) =>
      file.role === "labs"
        ? { ...file, text: file.text.replace("△△研究室（△△　△△）", "○○研究室（○○　○○）") }
        : file
    );
    expect(() => buildInstance(clashing, SEED)).toThrow(/同じ名前/);
  });
});

describe("見出しの全角・半角", () => {
  /** Excel の見出しは、書く人によって `学生ID` と `学生ＩＤ` が混ざる。 */
  const widen = (text: string) =>
    text.replace(/[A-Za-z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));

  it("`学生ＩＤ` でも学生 ID の列として読む", () => {
    const fullwidth = eclassFiles.map((file) =>
      file.role === "gpa" && file.rows !== undefined
        ? { ...file, rows: file.rows.map((row, i) => (i === 0 ? row.map(widen) : row)) }
        : file
    );
    const { instance } = buildInstance(fullwidth, SEED);
    expect(instance.students).toHaveLength(10);
    expect(instance.students.every((student) => student.gpa > 0)).toBe(true);
  });

  it("裁量点の表の見出しが全角でも読む", () => {
    const fullwidth = eclassFiles.map((file) =>
      file.role === "scores" && file.rows !== undefined
        ? { ...file, rows: file.rows.map((row, i) => (i === 0 ? row.map(widen) : row)) }
        : file
    );
    const { instance } = buildInstance(fullwidth, SEED);
    for (const lab of instance.labs) expect(lab.scores.size).toBe(10);
  });

  it("裁量点が全角数字でも読む", () => {
    const fullwidth = eclassFiles.map((file) =>
      file.role === "scores" && file.rows !== undefined
        ? {
            ...file,
            rows: file.rows.map((row, i) => (i === 0 ? row : [...row.slice(0, 3), widen(row[3] ?? "")])),
          }
        : file
    );
    const { instance } = buildInstance(fullwidth, SEED);
    const lab = instance.labs.find((entry) => entry.id === "L01")!;
    expect([...lab.scores.values()].some((score) => score > 0)).toBe(true);
  });

  it("学生 ID が全角数字でも、半角で書かれた側と同じ学生として扱う", () => {
    // 裁量点の表だけ全角。揃えないと裁量点が届かず、総合点が GPA 点だけになる
    const fullwidth = eclassFiles.map((file) =>
      file.role === "scores" && file.rows !== undefined
        ? {
            ...file,
            rows: file.rows.map((row, i) => (i === 0 ? row : [widen(row[0] ?? ""), ...row.slice(1)])),
          }
        : file
    );
    const { instance, warnings } = buildInstance(fullwidth, SEED);
    for (const lab of instance.labs) {
      expect([...lab.scores.keys()].every((id) => /^[0-9]+$/.test(id))).toBe(true);
    }
    expect(warnings.filter((w) => /点数がありません|名簿に無い/.test(w))).toEqual([]);
  });

  it("見出しに但し書きが付いていても読む", () => {
    // 教員に配る表の見出しは、注意書きを足されることがある
    const annotated = eclassFiles.map((file) => {
      if (file.rows === undefined) return file;
      if (file.role === "scores") {
        return {
          ...file,
          rows: file.rows.map((row, i) =>
            i === 0 ? [row[0]!, row[1]!, "教員氏名（リストから選択）", "裁量点最大60"] : row
          ),
        };
      }
      if (file.role === "gpa") {
        return {
          ...file,
          rows: file.rows.map((row, i) => (i === 0 ? ["学生ID（学籍番号）", row[1]!, "GPA（4.0満点）"] : row)),
        };
      }
      return file;
    });
    const { instance } = buildInstance(annotated, SEED);
    expect(instance.students.every((student) => student.gpa > 0)).toBe(true);
    for (const lab of instance.labs) expect(lab.scores.size).toBe(10);
  });

  it("似た見出しが並んでいても取り違えない", () => {
    // `研究室` と `研究室名` は片方が他方の頭に含まれる。完全一致を先に見るので
    // 研究室 ID の列が研究室名の列に取られない
    const labs: SourceFile = {
      name: "labs.csv",
      role: "labs",
      text: [
        "研究室名,研究室,定員,選択肢ラベル",
        "○○研究室,L01,3,○○研究室（○○　○○）",
        "△△研究室,L02,3,△△研究室（△△　△△）",
        "□□研究室,L03,3,□□研究室（□□　□□）",
        "◇◇研究室,L04,3,◇◇研究室（◇◇　◇◇）",
      ].join("\n"),
    };
    const { instance } = buildInstance([...eclassFiles, labs], SEED);
    expect(instance.labs.map((lab) => lab.id)).toEqual(["L01", "L02", "L03", "L04"]);
  });

  it("教員氏名の列は別名でも但し書き付きでも読む", () => {
    for (const heading of ["教員氏名", "教員名", "担当教員", "教員", "先生", "教員名（記入者）"]) {
      const renamed = eclassFiles.map((file) =>
        file.role === "scores" && file.rows !== undefined
          ? {
              ...file,
              rows: file.rows.map((row, i) => (i === 0 ? [row[0]!, row[1]!, heading, row[3]!] : row)),
            }
          : file
      );
      const { instance } = buildInstance(renamed, SEED);
      for (const lab of instance.labs) expect(lab.scores.size).toBe(10);
    }
  });

  it("但し書き付きの見出し探しが、別の列を奪わない", () => {
    // `教員` は教員氏名の別名で、`教員裁量点` はその頭に一致する。奪われると
    // 点数が研究室の名前として扱われ、見当違いの場所を疑うことになる
    const unknown = eclassFiles.map((file) =>
      file.role === "scores" && file.rows !== undefined
        ? {
            ...file,
            rows: file.rows.map((row, i) => (i === 0 ? [row[0]!, row[1]!, "記入者", row[3]!] : row)),
          }
        : file
    );
    expect(() => buildInstance(unknown, SEED)).toThrow(/研究室または教員氏名の列/);
    expect(() => buildInstance(unknown, SEED)).not.toThrow(/研究室一覧に見つかりません/);
  });

  describe("配属の対象から外す", () => {
    /** GPA の表に `除外` の列を足す */
    const withExclusions = (marks: Record<string, string>) =>
      eclassFiles.map((file) =>
        file.role === "gpa" && file.rows !== undefined
          ? {
              ...file,
              rows: file.rows.map((row, i) =>
                i === 0 ? [...row, "除外"] : [...row, marks[row[0]!] ?? ""]
              ),
            }
          : file
      );

    it("印を付けた学生を名簿から外す", () => {
      // 1234560002 は希望を出している。GPA から行を消すだけでは外れない
      const { instance, warnings } = buildInstance(withExclusions({ "1234560002": "○" }), SEED);
      expect(instance.students.some((student) => student.id === "1234560002")).toBe(false);
      expect(instance.students).toHaveLength(9);
      expect(warnings.join()).toMatch(/1 人を配属の対象から外しました（1234560002）/);
    });

    it("希望を出していない学生も外せる", () => {
      const { instance } = buildInstance(withExclusions({ "1234560007": "○" }), SEED);
      expect(instance.students.some((student) => student.id === "1234560007")).toBe(false);
    });

    it("定員は外した後の人数で決まる", () => {
      const { instance } = buildInstance(
        withExclusions({ "1234560002": "○", "1234560007": "○" }),
        SEED
      );
      expect(instance.labs.reduce((sum, lab) => sum + lab.capacity, 0)).toBe(8);
    });

    it("外した学生の点数が裁量点の表に残っていても、余計なことを言わない", () => {
      const { warnings } = buildInstance(withExclusions({ "1234560002": "○" }), SEED);
      expect(warnings.filter((w) => /名簿に無い/.test(w))).toEqual([]);
    });

    it("読めない印は、勝手に解釈せず止まる", () => {
      // 「否」のように逆の意味で書かれた値を除外と読むと、学生が黙って落ちる
      expect(() => buildInstance(withExclusions({ "1234560002": "たぶん" }), SEED)).toThrow(
        /除外の欄に「たぶん」と書かれていますが、読めません/
      );
    });

    it("全員を外したら止まる", () => {
      const all = Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [`123456${String(i + 1).padStart(4, "0")}`, "○"])
      );
      expect(() => buildInstance(withExclusions(all), SEED)).toThrow(/一人もいません/);
    });
  });

  describe("1 つのファイルは 1 人の教員のもの", () => {
    /** ○○先生のファイルだけに手を入れる */
    const only = (f: (row: string[], index: number) => string[]) =>
      eclassFiles.map((file) =>
        file.name === "教員裁量点_○○先生.xlsx" && file.rows !== undefined
          ? { ...file, rows: file.rows.map(f) }
          : file
      );
    const blankTeacher = (row: string[]) => [row[0]!, row[1]!, "", row[3]!];

    it("1 行でも書かれていれば、空の行をその教員で埋める", () => {
      const sparse = only((row, i) => (i <= 1 ? row : blankTeacher(row)));
      const { instance, warnings } = buildInstance(sparse, SEED);
      expect(instance.labs.find((lab) => lab.id === "L01")!.scores.size).toBe(10);
      expect(warnings.filter((w) => /教員氏名/.test(w))).toEqual([]);
    });

    it("書かれているのが最後の 1 行でも埋める", () => {
      const sparse = only((row, i) => (i === 0 || i === 10 ? row : blankTeacher(row)));
      const { instance } = buildInstance(sparse, SEED);
      expect(instance.labs.find((lab) => lab.id === "L01")!.scores.size).toBe(10);
    });

    it("教員氏名が 2 種類あれば止まる", () => {
      const mixed = only((row, i) => (i === 3 ? [row[0]!, row[1]!, "△△　△△", row[3]!] : row));
      expect(() => buildInstance(mixed, SEED)).toThrow(
        /教員氏名が 2 種類あります（○○　○○、△△　△△）/
      );
    });

    it("空の行が混じっていても、2 種類あれば止まる", () => {
      const mixed = only((row, i) =>
        i === 3 ? [row[0]!, row[1]!, "△△　△△", row[3]!] : i <= 1 ? row : blankTeacher(row)
      );
      expect(() => buildInstance(mixed, SEED)).toThrow(/教員氏名が 2 種類あります/);
    });

    it("1 つも書かれていなければ止まる", () => {
      const none = only((row, i) => (i === 0 ? row : blankTeacher(row)));
      expect(() => buildInstance(none, SEED)).toThrow(/教員氏名がどの行にも書かれていません/);
    });

    it("研究室の列でまとめた CSV は、複数の研究室が並んでも止めない", () => {
      const combined: SourceFile = {
        name: "scores.csv",
        role: "scores",
        text: ["研究室,学籍番号,裁量点"]
          .concat(
            ["L01", "L02", "L03", "L04"].flatMap((lab) =>
              Array.from({ length: 10 }, (_, i) => `${lab},123456000${i + 1},30`)
            )
          )
          .join("\n"),
      };
      const labs: SourceFile = {
        name: "labs.csv",
        role: "labs",
        text: [
          "研究室,選択肢ラベル",
          "L01,○○研究室（○○　○○）",
          "L02,△△研究室（△△　△△）",
          "L03,□□研究室（□□　□□）",
          "L04,◇◇研究室（◇◇　◇◇）",
        ].join("\n"),
      };
      const files = [...eclassFiles.filter((file) => file.role !== "scores"), combined, labs];
      const { instance, warnings } = buildInstance(files, SEED);
      expect(instance.labs).toHaveLength(4);
      expect(warnings.filter((w) => /種類あります/.test(w))).toEqual([]);
    });
  });

  it("裁量点の欄が空なら 0 点とし、誰の分かを知らせる", () => {
    const blanks = eclassFiles.map((file) =>
      file.name === "教員裁量点_○○先生.xlsx" && file.rows !== undefined
        ? {
            ...file,
            rows: file.rows.map((row, i) => (i === 1 || i === 3 ? [...row.slice(0, 3), ""] : row)),
          }
        : file
    );
    const { instance, warnings } = buildInstance(blanks, SEED);

    const lab = instance.labs.find((entry) => entry.id === "L01")!;
    // 行は残るので、名簿の突き合わせでは欠けたことにならない
    expect(lab.scores.size).toBe(10);
    expect(lab.scores.get("1234560001")).toBe(0);
    expect(warnings.join()).toMatch(/裁量点の欄が空の学生が 2 人います（1234560001、1234560003）/);
  });

  it("裁量点の列が無ければ、空欄ではなく列が無いと言う", () => {
    const noScore = eclassFiles.map((file) =>
      file.role === "scores" && file.rows !== undefined
        ? { ...file, rows: file.rows.map((row, i) => (i === 0 ? [...row.slice(0, 3), "備考"] : row)) }
        : file
    );
    expect(() => buildInstance(noScore, SEED)).toThrow(/裁量点の列 .* が見つかりません/);
  });

  it("学生 ID の列が本当に無ければ、その列を名指しして止まる", () => {
    const renamed = eclassFiles.map((file) =>
      file.role === "gpa" && file.rows !== undefined
        ? { ...file, rows: file.rows.map((row, i) => (i === 0 ? ["番号", ...row.slice(1)] : row)) }
        : file
    );
    expect(() => buildInstance(renamed, SEED)).toThrow(/学生IDの列 .* が見つかりません/);
  });

  it("研究室の名前も全角・半角の違いを無視して突き合わせる", () => {
    const labs: SourceFile = {
      name: "labs.csv",
      role: "labs",
      // 括弧を半角、区切りの空白も半角にした研究室一覧
      text: [
        "研究室,研究室名,定員,選択肢ラベル",
        "L01,○○研究室,3,○○研究室(○○ ○○)",
        "L02,△△研究室,3,△△研究室(△△ △△)",
        "L03,□□研究室,3,□□研究室(□□ □□)",
        "L04,◇◇研究室,3,◇◇研究室(◇◇ ◇◇)",
      ].join("\n"),
    };
    const { instance } = buildInstance([...eclassFiles, labs], SEED);
    const taro = instance.students.find((student) => student.id === "1234560002")!;
    expect(taro.preferences).toEqual(["L02", "L04", "L03", "L01"]);
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
