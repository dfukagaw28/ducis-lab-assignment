import { describe, expect, it } from "vitest";

import { BLOCKS, findBlock, splitSections, stripHtml } from "../src/io/eclass.js";

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
    // eClass は最後のブロックの後ろに空の行を並べることがある
    const padded = splitSections(`${fixture}\n,,\n,,\n\n\n`);
    const last = padded.blocks[padded.blocks.length - 1]!;
    expect(last.title).toBe(BLOCKS.counts);
    expect(last.rows).toEqual([["e", "f"]]);
  });

  it("見出しだけで中身の無いブロックは 0 行になる", () => {
    const empty = splitSections(fixture.replace("[回答一覧]\na,b\n", "[回答一覧]\n"));
    expect(findBlock(empty, BLOCKS.answers).rows).toEqual([]);
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

// ここから先は実ファイルの列が分かってから
describe.todo("parseOptionLabels", () => {
  it.todo("option の列から 選択肢番号 → 研究室 の対応を作る");
  it.todo("ラベルの HTML タグを外す");
});

describe.todo("parseUserAnswers", () => {
  it.todo("学生ごとに希望順位を第 1 希望から並べる");
  it.todo("順位が空の選択肢を落とす");
  it.todo("同じ順位が二つあれば止まる");
});
