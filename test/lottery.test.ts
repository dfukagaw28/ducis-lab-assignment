import { describe, expect, it } from "vitest";

import { drawLottery } from "../src/domain/lottery.js";

const ids = ["S003", "S001", "S004", "S002", "S005"];

describe("drawLottery", () => {
  it("全員に 0..n-1 の番号を一つずつ与える", () => {
    const lottery = drawLottery(ids, 12345);
    expect(lottery.size).toBe(ids.length);
    expect([...lottery.values()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it("同じシードなら同じ抽選になる", () => {
    expect(drawLottery(ids, 12345)).toEqual(drawLottery(ids, 12345));
  });

  it("入力の順序を変えても結果は変わらない", () => {
    const shuffled = ["S005", "S002", "S003", "S001", "S004"];
    expect(drawLottery(shuffled, 12345)).toEqual(drawLottery(ids, 12345));
  });

  it("シードが違えば抽選も変わる", () => {
    const many = Array.from({ length: 50 }, (_, i) => `S${i}`);
    expect(drawLottery(many, 1)).not.toEqual(drawLottery(many, 2));
  });

  it("学籍番号の重複を拒む", () => {
    expect(() => drawLottery(["S001", "S001"], 1)).toThrow(/重複/);
  });

  it("十分な回数引けばどの学生も先頭になりうる", () => {
    const firsts = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const lottery = drawLottery(ids, seed);
      firsts.add([...lottery].find(([, number]) => number === 0)![0]);
    }
    expect(firsts.size).toBe(ids.length);
  });
});
