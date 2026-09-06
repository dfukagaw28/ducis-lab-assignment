import { describe, expect, it } from "vitest";

import { parseCsv, toCsv, withHeader } from "../src/io/csv.js";
import { decodeBytes } from "../src/io/decode.js";

describe("parseCsv", () => {
  it("素の行と列を読む", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("CRLF を LF と同じに扱う", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("引用符の中のカンマと改行を保つ", () => {
    expect(parseCsv('a,"1,2"\n')).toEqual([["a", "1,2"]]);
    expect(parseCsv('a,"1\n2"\n')).toEqual([["a", "1\n2"]]);
  });

  it('"" を引用符一つに戻す', () => {
    expect(parseCsv('a,"say ""hi"""\n')).toEqual([["a", 'say "hi"']]);
  });

  it("末尾の改行で空行を作らない", () => {
    expect(parseCsv("a\n")).toHaveLength(1);
    expect(parseCsv("a")).toHaveLength(1);
  });

  it("空の欄を空文字にする", () => {
    expect(parseCsv("a,,c\n")).toEqual([["a", "", "c"]]);
  });
});

describe("toCsv", () => {
  it("必要なときだけ引用符で囲む", () => {
    expect(toCsv([["a", "b,c", 'd"e', 1, null]])).toBe('a,"b,c","d""e",1,\r\n');
  });

  it("parseCsv で読み戻せる", () => {
    const rows = [
      ["名前", "点"],
      ["山田, 太郎", "42"],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("withHeader", () => {
  it("見出しを鍵にする", () => {
    expect(withHeader(parseCsv("a, b \n1,2\n"))).toEqual([{ a: "1", b: "2" }]);
  });

  it("空行を落とす", () => {
    expect(withHeader(parseCsv("a\n1\n\n"))).toEqual([{ a: "1" }]);
  });
});

describe("decodeBytes", () => {
  const text = "学籍番号,氏名\nS001,深川\n";

  it("UTF-8 を読む", () => {
    expect(decodeBytes(new TextEncoder().encode(text).buffer as ArrayBuffer)).toBe(text);
  });

  it("BOM 付き UTF-8 の BOM を落とす", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);
    expect(decodeBytes(bytes.buffer as ArrayBuffer)).toBe(text);
  });

  it("Shift_JIS に落ちる", () => {
    // Excel が書きがちな CP932。UTF-8 としては壊れているので判別できる
    const sjis = new Uint8Array([0x8a, 0x77, 0x90, 0xb6, 0x0a]); // 「学生」+ LF
    expect(decodeBytes(sjis.buffer as ArrayBuffer)).toBe("学生\n");
  });
});
