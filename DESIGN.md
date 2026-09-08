# 設計メモ

このファイルは**直す人**のためのものです。使い方・入出力の形式・結果の読み方は
[README.md](README.md) にあります。

設計判断の根拠はコードのそばに書いてあります（`preferences.ts` が `tieLast` を
使わない理由、`capacity.ts` が余り席を配る規則、など）。ここに置くのは、
**一つのファイルのコメントに収まらないもの**だけです。

## 研究室配属を Hospital/Resident 問題に写す

配属は[研修医マッチング問題](https://github.com/dfukagaw28/hospital-resident-matching)
そのものです。ライブラリの API を読むときはこの対応で読み替えてください。

| Hospital/Resident 問題 | 本システム |
| --- | --- |
| resident | 学生 |
| hospital | 研究室 |
| capacity | 定員 |
| resident preferences | 学生の希望順位 |
| hospital preferences | 総合点（GPA点 + 教員裁量点）の降順 |

`stableMatch()` は**学生側最適**の受入保留アルゴリズムです。学生にとって希望を
正直に出すのが最適戦略になる（耐戦略性）ので、配属にはこちらを使います。研究室側
最適だと、学生が「入れそうな研究室」を第 1 希望に書く動機が生まれます。

## 層の分け方

```
e-class の .txt ─┐
GPA の .xlsx    ─┼→ io/ のパーサ ─→ 行と列 ─→ io/intake.ts ─→ 正規化データ
教員裁量点の .xlsx ┘   (テキスト/シート→行)      (行→ドメインの型)      │
                                                                       ↓
                                             domain/ （点数・抽選・補完・定員・解く・集計）
                                                                       ↓
                                                        ui/ ・ io/export.ts
```

- **パーサは「テキストまたはシート → 行と列」だけ**を担います。CSV から起こしても
  Excel のシートから起こしても、以降は同じ処理に流れます（`SourceFile.rows`）。
- **`intake.ts` が「行 → 正規化データ」**を担います。研究室の名前の突き合わせ、
  名簿の検証、警告の組み立てはここ。
- **`domain/` は入力の形式を知りません。**ファイルの形が変わっても、変わるのは
  パーサだけです。実際、暫定 CSV から e-class + Excel に移したとき `domain/` は
  無傷でした。

## ディレクトリ

```
src/
  main.ts              画面の配線
  nodeStub.ts          node:fs / node:path の代わり（下の「ライブラリの注意」）
  domain/
    types.ts           正規化データモデル（Student / Lab / Instance / Params）
    score.ts           総合点 → 研究室の選好リスト
    lottery.ts         同点処理の抽選番号
    preferences.ts     順位を付けなかった研究室の補完
    capacity.ts        定員の自動配分（合計＝学生数）
    solve.ts           stableMatch を呼ぶ
    report.ts          集計・合格ライン・要確認・安定性検査
    sensitivity.ts     シードを振り直したときのぶれ
    streams.ts         乱数の流れ（下の表）
  io/
    csv.ts             CSV の読み書き
    decode.ts          文字コード判定・入力ファイルの読み分け
    xlsx.ts            .xlsx を読む
    xlsxWrite.ts       .xlsx を書く
    eclass.ts          e-class 出力の構造分解と読み取り
    parsers.ts         行と列 → 中間の行（希望順位・GPA・研究室・裁量点）
    intake.ts          中間の行 → 正規化データ、検証と警告
    export.ts          結果 → CSV / Excel
  ui/                  dropzone / render / sensitivity
  dev/                 合成データ（実データが無くても動かせるように）
scripts/
  inspectEclass.ts     e-class のファイルを覗く道具（npm run inspect）
```

## 乱数の流れ

シードから引く乱数は用途ごとに種をずらして、別の列を辿るようにしています
（`domain/streams.ts`）。同じ種から二つ引くと、抽選の結果と補完の結果が同じ乱数列に
乗ってしまいます。

| 用途 | ずらし幅 | 使う場所 |
| --- | --- | --- |
| 同点処理の抽選番号 | 0 | `lottery.ts` |
| 順位を付けなかった研究室の並べ方 | 1 | `preferences.ts` |
| 定員の余り一席の行き先 | 2 | `capacity.ts` |
| シードのぶれを見るときの振り直し | 3 | `sensitivity.ts` |

いずれも**入力ファイルの行順に依らない**ように書いてあります（学籍番号や研究室 ID を
辞書順に整列してから引く）。行順で結果が変わると、同じデータの並べ替えで配属が
変わってしまいます。

## ライブラリを使う上の注意

**`node:fs` / `node:path` を alias で逃がします。**パッケージの入口が
`HospitalResident` を再エクスポートしており、それが `node:fs` を import します。
本番バンドルは `sideEffects: false` のおかげで tree-shake されますが、開発サーバーは
モジュールグラフをそのまま配信するので alias が無いと落ちます
（`vite.config.ts` → `src/nodeStub.ts`）。

**`HospitalResident.solve()` は使いません。**使うのは `stableMatch()` と、乱数・
人気度の道具（`Pcg32Rng` / `permutation` / `popularityKeys` / `compareKeys`）だけです。
`HospitalResident` は合成データ作りにのみ登場します。理由は
[`preferences.ts`](src/domain/preferences.ts) の冒頭に書いてあります（要は添字ベース
であることと、シャッフルが入力の行順に依ること）。

もう一点、`HospitalResident.solve()` は**研究室側の選好リストが完全であることを前提に
しています**。載っていない学生の順位が `-1` で、それが最上位として扱われるためです。
いまは全学生がどの研究室の並びにも載るので実害はありませんが、乗り換えを考えるなら
先に知っておくべき穴です。`stableMatch()` は相互に載っていることを求めるので、この
問題はありません。

## テスト

`test/` は実装と 1 対 1 ではなく、**性質**を固定しています。壊れると困るのは
たとえば次のようなことです。

- 同じシードなら何度解いても同じ結果になる
- 入力ファイルの行順を変えても結果が変わらない
- 安定マッチングにブロッキングペアが無い
- 未提出の学生が、希望を出した学生を押しのけない
- 書き出した Excel を読み戻すと CSV と同じ中身になる

`samples/` の実物（e-class 出力・GPA・教員裁量点）をそのまま読むテストもあります。
形式の思い込みは合成データでは見つからないためです。
