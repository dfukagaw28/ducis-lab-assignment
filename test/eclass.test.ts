import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import {
  BLOCKS,
  findBlock,
  parseEclassPreferences,
  parseOptionLabels,
  parseUserAnswers,
  splitSections,
  stripHtml,
  type EclassBlock,
} from "../src/io/eclass.js";

/**
 * 実ファイルは個人情報を含むので置けない。形だけを真似た作り物で、構造の
 * 切り分けだけを見る。実ファイルの列が分かったら、この雛形を差し替える。
 */
const fixture = [
  "教材名,研究室配属アンケート",
  "出力日時,2026/09/07 12:00",
  "コース,情報学科",
  "作成者,---",
  "備考,---",
  "",
  // 引用符の中に改行とカンマを入れて、行がずれないことを確かめる
  "question,option1,option2",
  'どの研究室を希望しますか,"<p>情報数理</p>","<p>知能情報, 第2</p>"',
  "",
  `[${BLOCKS.answers}]`,
  "a,b",
  "",
  `[${BLOCKS.survey}]`,
  "c,d",
  "",
  `[${BLOCKS.perUser}]`,
  "学籍番号,option1,option2",
  "S001,1,2",
  "S002,2,1",
  "",
  `[${BLOCKS.perUserTime}]`,
  "S001,42",
  "",
  `[${BLOCKS.counts}]`,
  "e,f",
  "",
].join("\n");

describe("splitSections", () => {
  const sections = splitSections(fixture);

  it("冒頭の 5 行をヘッダとして分ける", () => {
    expect(sections.preamble).toHaveLength(5);
    expect(sections.preamble[0]).toEqual(["教材名", "研究室配属アンケート"]);
  });

  it("パラメータの 2 行を取り出す", () => {
    expect(sections.parameters).toHaveLength(2);
    expect(sections.parameters[0]).toEqual(["question", "option1", "option2"]);
    expect(sections.parameters[1]![2]).toBe("<p>知能情報, 第2</p>");
  });

  it("ブロックを見出しの順に並べる", () => {
    expect(sections.blocks.map((block) => block.title)).toEqual([
      BLOCKS.answers,
      BLOCKS.survey,
      BLOCKS.perUser,
      BLOCKS.perUserTime,
      BLOCKS.counts,
    ]);
  });

  it("ブロックの中身を行のまま渡す", () => {
    expect(findBlock(sections, BLOCKS.perUser).rows).toEqual([
      ["学籍番号", "option1", "option2"],
      ["S001", "1", "2"],
      ["S002", "2", "1"],
    ]);
  });

  it("説明どおりの形なら注意書きは出ない", () => {
    expect(sections.notes).toEqual([]);
  });

  it("ヘッダが 6 行でも通し、出力オプションの差なので注意もしない", () => {
    const six = splitSections(fixture.replace("備考,---\n", "備考,---\n追記,---\n"));
    expect(six.preamble).toHaveLength(6);
    expect(six.parameters).toHaveLength(2);
    expect(six.blocks).toHaveLength(5);
    expect(six.notes).toEqual([]);
  });

  it("想定の範囲を外れた行数なら notes に残す", () => {
    const many = splitSections(fixture.replace("備考,---\n", "備考,---\na,1\nb,2\nc,3\n"));
    expect(many.preamble).toHaveLength(8);
    expect(many.blocks).toHaveLength(5);
    expect(many.notes.join()).toMatch(/ヘッダが 8 行/);
  });

  it("ヘッダとパラメータの間に空行が無ければ、パラメータを見失ったと言う", () => {
    expect(() => splitSections(fixture.replace("備考,---\n\n", "備考,---\n"))).toThrow(
      /パラメータの行がありません/
    );
  });

  it("末尾の空行やカンマだけの行はブロックの行に数えない", () => {
    // e-class は最後のブロックの後ろに空の行を並べることがある
    const padded = splitSections(`${fixture}\n,,\n,,\n\n\n`);
    const last = padded.blocks[padded.blocks.length - 1]!;
    expect(last.title).toBe(BLOCKS.counts);
    expect(last.rows).toEqual([["e", "f"]]);
  });

  it("見出しだけで中身の無いブロックは 0 行になる", () => {
    const empty = splitSections(fixture.replace("[回答一覧]\na,b\n", "[回答一覧]\n"));
    expect(findBlock(empty, BLOCKS.answers).rows).toEqual([]);
  });

  it("見出しの行に余分な欄があっても見出しとして扱い、次のブロックと繋げない", () => {
    const messy = splitSections(
      fixture.replace(`[${BLOCKS.counts}]`, `[${BLOCKS.counts}],QNo.,件数`)
    );
    expect(messy.blocks).toHaveLength(5);
    expect(findBlock(messy, BLOCKS.counts).rows).toEqual([["e", "f"]]);
    expect(messy.notes.join()).toMatch(/余分な欄/);
  });

  it("角括弧の後ろに但し書きが続く見出しも見出しとして扱う", () => {
    const withRemark = splitSections(
      `${fixture}\n[解答の正否リスト](最新結果のみ表示しています)\ni,j\n`
    );
    const last = withRemark.blocks[withRemark.blocks.length - 1]!;
    expect(last.title).toBe("解答の正否リスト");
    expect(last.remark).toBe("(最新結果のみ表示しています)");
    expect(last.rows).toEqual([["i", "j"]]);
    // 但し書きは見出しに含めないので、素の名前で引ける
    expect(findBlock(withRemark, "解答の正否リスト")).toBe(last);
  });

  it("但し書き付きの見出しでも、前のブロックを終わらせる", () => {
    const withRemark = splitSections(
      `${fixture}\n[解答の正否リスト](最新結果のみ表示しています)\ni,j\n`
    );
    expect(findBlock(withRemark, BLOCKS.counts).rows).toEqual([["e", "f"]]);
  });

  it("同じ見出しが繰り返されたら notes で知らせる", () => {
    const twice = splitSections(`${fixture}\n[${BLOCKS.answers}]\ng,h\n`);
    expect(twice.blocks).toHaveLength(6);
    expect(twice.notes.join()).toMatch(/\[回答一覧\] のブロックが 2 個/);
  });

  it("パラメータもブロックも無ければ止まる", () => {
    expect(() => splitSections("a\nb\n")).toThrow(/パラメータの行がありません/);
  });
});

describe("findBlock", () => {
  const sections = splitSections(fixture);

  it("全角と半角の括弧の違いを無視する", () => {
    expect(findBlock(sections, "ユーザ毎の回答時間リスト（単位：秒）").title).toBe(
      BLOCKS.perUserTime
    );
  });

  it("無い見出しは名前を言って止まる", () => {
    expect(() => findBlock(sections, "存在しない")).toThrow(/存在しない/);
  });
});

describe("stripHtml", () => {
  it("タグを外して中のテキストだけにする", () => {
    expect(stripHtml("<p>情報数理</p>")).toBe("情報数理");
    expect(stripHtml('<p class="x">知能情報</p>')).toBe("知能情報");
  });

  it("実体参照を戻す", () => {
    expect(stripHtml("<p>A&amp;B</p>")).toBe("A&B");
  });

  it("前後の空白を落とす", () => {
    expect(stripHtml("<p>  情報数理　</p>")).toBe("情報数理");
  });
});

describe("parseOptionLabels", () => {
  const labels = parseOptionLabels(splitSections(fixture).parameters);

  it("option の列から 選択肢番号 → 研究室 の対応を作る", () => {
    expect(labels.get(1)).toBe("情報数理");
    expect(labels.get(2)).toBe("知能情報, 第2");
  });

  it("使われていない選択肢を落とす", () => {
    const sparse = parseOptionLabels([
      ["question", "option1", "option2", "option3"],
      ["どれ", "<p>甲</p>", "", "<p>丙</p>"],
    ]);
    expect([...sparse.keys()]).toEqual([1, 3]);
  });

  it("option の列が無ければ止まる", () => {
    expect(() => parseOptionLabels([["question"], ["どれ"]])).toThrow(/選択肢が一つも/);
  });
});

describe("parseUserAnswers", () => {
  const labels = new Map([
    [1, "○○研究室"],
    [2, "△△研究室"],
    [3, "□□研究室"],
    [4, "◇◇研究室"],
  ]);

  function block(...rows: string[][]): EclassBlock {
    return {
      title: BLOCKS.perUser,
      rows: [["<科目名>", "<ユーザ名>", "<学生ID>", "<回答時刻>", "<設問1/設問2/・・・>"], ...rows],
    };
  }

  it("並び順が順位、値が選択肢の番号", () => {
    // 1 位が option4、2 位が option1、3 位が option3、4 位が option2
    const rows = parseUserAnswers(block(["科目", "架空 太郎", "S001", "時刻", "4, 1, 3, 2"]), labels);
    expect(rows).toEqual([
      {
        id: "S001",
        name: "架空 太郎",
        preferences: ["◇◇研究室", "○○研究室", "□□研究室", "△△研究室"],
      },
    ]);
  });

  it("未解答は飛ばして順位を詰める", () => {
    const rows = parseUserAnswers(block(["科目", "甲", "S001", "時刻", "4, 未解答, 3, 未解答"]), labels);
    expect(rows[0]!.preferences).toEqual(["◇◇研究室", "□□研究室"]);
  });

  it("全部未解答なら希望なしとして通す", () => {
    const answer = "未解答, 未解答, 未解答, 未解答";
    const rows = parseUserAnswers(block(["科目", "甲", "S001", "時刻", answer]), labels);
    expect(rows[0]!.preferences).toEqual([]);
  });

  it("選択肢にない番号があれば止まる", () => {
    expect(() =>
      parseUserAnswers(block(["科目", "甲", "S001", "時刻", "9, 1"]), labels)
    ).toThrow(/選択肢にない番号 9/);
  });

  it("同じ選択肢が二度出てきたら止まる", () => {
    expect(() =>
      parseUserAnswers(block(["科目", "甲", "S001", "時刻", "1, 1"]), labels)
    ).toThrow(/二度/);
  });

  it("学生 ID の空の行を落とす", () => {
    const rows = parseUserAnswers(
      block(["科目", "甲", "S001", "時刻", "1"], ["", "", "", "", ""]),
      labels
    );
    expect(rows).toHaveLength(1);
  });
});

describe("parseEclassPreferences（実ファイルの見本）", () => {
  const text = readFileSync(new URL("../samples/answer-utf8-sample.txt", import.meta.url), "utf8");
  const rows = parseEclassPreferences(text);

  it("回答した学生をすべて読む", () => {
    expect(rows).toHaveLength(9);
  });

  it("学生 ID と氏名を取る", () => {
    expect(rows[0]!.id).toBe("1234560002");
    expect(rows[0]!.name).toBe("架空　太郎");
  });

  it("回答 4, 1, 3, 2 を 1 位から並べ直す", () => {
    expect(rows[0]!.preferences).toEqual([
      "◇◇研究室（◇◇　◇◇）",
      "○○研究室（○○　○○）",
      "□□研究室（□□　□□）",
      "△△研究室（△△　△△）",
    ]);
  });

  it("全部未解答の学生は希望なしになる", () => {
    const blank = rows.find((row) => row.preferences.length === 0)!;
    expect(blank.name).toBe("山田　テスト");
  });

  it("選択肢は使われている 4 つだけ", () => {
    expect(parseOptionLabels(splitSections(text).parameters).size).toBe(4);
  });
});
