/**
 * このページを作ったコードを名指しする一行。
 *
 * 「この配属結果はどのコードで出したのか」に答えるためのものです。バグが見つかった
 * ときに、直す前に出した結果を捨てる判断が要ります（e-class の希望順位を逆に読んで
 * いた件のように、結果が一見もっともらしいまま間違っていることがあります）。
 *
 * **番号ではなくコミットを名前にします。**番号は人が付けるので付け忘れが起きますが、
 * コミットは何もしなくても一意に決まり、そこからソースに戻れます。タグを打てば
 * `v1.0-3-g710d9b2` のように番号も混じるので、番号が欲しくなってから決められます。
 *
 * ビルド日時を添えるのは、コミットだけでは「いま開いているページが最新かどうか」が
 * 分からないためです（ブラウザが古い版を掴んでいる事故を拾えます）。
 */

// vite.config.ts の define がビルド時に埋める。埋まらない経路（vitest は
// vitest.config.ts を使う）でも落ちないように、typeof で確かめてから読む。
declare const __COMMIT__: string;
declare const __BUILT_AT__: string;

export interface Version {
  /** git describe --tags --always --dirty の出力 */
  commit: string;
  /** JST の「YYYY-MM-DD HH:mm JST」 */
  builtAt: string;
}

const UNKNOWN = "不明";

export const VERSION: Version = {
  commit: typeof __COMMIT__ === "string" ? __COMMIT__ : UNKNOWN,
  builtAt: typeof __BUILT_AT__ === "string" ? __BUILT_AT__ : UNKNOWN,
};

/** 画面とサマリに出す一行。どちらも同じ文字列にする。 */
export function versionLine(version: Version = VERSION): string {
  return `${version.commit}（${version.builtAt} ビルド）`;
}
