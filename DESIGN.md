# 研究室配属システム 設計メモ

## 1. 目的

学生の希望順位・GPA・研究室ごとの教員裁量点から、安定マッチング（研修医-病院問題）
によって研究室配属を決定する Web アプリケーション。

- 静的 HTML + JS（Vite でビルドした `dist/` を配信。サーバ不要、データは端末外に出ない）
- 入力ファイルをドラッグ＆ドロップ → パラメータ調整 → 実行 → 結果表示 → CSV/Excel ダウンロード
- マッチングは [`hospital-resident-matching`](https://github.com/dfukagaw28/hospital-resident-matching) の
  `stableMatch()`（学生側最適の受入保留アルゴリズム）を使う

## 2. 用語の対応

| Hospital/Resident 問題 | 本システム |
| --- | --- |
| resident | 学生 |
| hospital | 研究室 |
| capacity | 定員 |
| resident preferences | 学生の希望順位（全研究室を順位づけ） |
| hospital preferences | 総合点（GPA点 + 教員裁量点）の降順 |

学生側最適の DA を使うため、学生にとって正直申告が最適戦略になる（耐戦略性）。

## 3. データフロー

```
[LMS 希望順位ファイル (.txt)] ─┐
[GPA ファイル (.xlsx)]        ─┼─→ パーサ層 ─→ 正規化データ ─┐
[裁量点ファイル (.xlsx) × 研究室数] ─┘                      │
                                                            ↓
                          パラメータ（重み・同点処理・定員上書き 等）
                                                            ↓
                          スコア計算 → 研究室の選好リスト生成
                                                            ↓
                                   stableMatch()
                                                            ↓
                          結果集計（希望充足率・安定性検証）
                                                            ↓
                              画面表示 / CSV・Excel 出力
```

パーサ層とドメイン層を分離するのが要点。ファイル形式が変わってもドメイン層は無傷。

## 4. 正規化データモデル（中間表現）

```ts
type StudentId = string;
type LabId = string;

interface Student {
  id: StudentId;          // 学籍番号
  name?: string;
  gpa: number;            // 素点（換算前）
  preferences: LabId[];   // 第1希望から順に
}

interface Lab {
  id: LabId;
  name?: string;
  capacity: number;
  scores: Map<StudentId, number>;  // 教員裁量点（素点）
}

interface Instance {
  students: Student[];
  labs: Lab[];
}
```

## 5. スコアリング

研究室 h における学生 s の総合点:

```
total(s, h) = gpaPoint(s) + discretionaryPoint(h, s)

gpaPoint(s)            = s.gpa / gpaMax * gpaWeight        // 既定 gpaWeight = 40
discretionaryPoint(h,s) = h.scores.get(s.id)               // 既定 60 点満点
```

研究室 h の選好リスト = 全学生を `total(s, h)` の降順に並べたもの。

### 同点処理（要検討）

DA は厳密な全順序を要求するため、総合点が同点の学生を区別する規則が要る。候補:

1. GPA の高い方を優先 → なお同点なら学籍番号順
2. 学籍番号順（決定的・説明容易だが番号の若い者が有利）
3. 乱数（シード指定で再現可能・公平だが説明しにくい）

→ 既定を決め、パラメータで切替可能にする。**要決定**

## 6. 調整可能パラメータ（UI）

| パラメータ | 既定 | 備考 |
| --- | --- | --- |
| GPA 配点 | 40 | 合計 100 点になるよう裁量点配点と連動 |
| 裁量点 配点 | 60 | |
| GPA の満点（換算元） | 要確認 | 4.0 スケールか等 |
| 同点処理 | 要決定 | 上記 5 節 |
| 定員 | ファイル or 画面入力 | 研究室ごとに上書き可能に |
| 裁量点が無い学生の扱い | 0 点として扱う / 受入不可 | **要決定** |
| 希望の考慮上限 | 全研究室 | 第 k 希望までに絞る場合 |
| 希望外への自動割当 | しない | ライブラリの `tieLast` に相当 |

## 7. 出力

- **学生別**: 学籍番号 / 氏名 / 配属研究室 / 第何希望 / その研究室での総合点・順位
- **研究室別**: 研究室 / 定員 / 配属人数 / 配属学生一覧（点数順）
- **サマリ**: 第1希望充足率、希望順位の分布、未配属者数
- **検証**: ブロッキングペアが存在しないこと（安定性の自己検査）

形式は CSV（依存なし）と Excel（SheetJS で読み書き）。入力に .xlsx がある以上、
Excel ライブラリはどのみち必要なので出力も .xlsx に対応する。

## 8. ディレクトリ構成（案）

```
src/
  main.ts
  domain/
    types.ts      正規化データモデル
    score.ts      総合点 → 研究室選好リスト
    solve.ts      stableMatch 呼び出し
    report.ts     集計・安定性検証
  io/
    lmsPreferences.ts   LMS テキスト → 希望順位
    gpaWorkbook.ts      Excel → GPA
    labWorkbook.ts      Excel → 裁量点
    export.ts           CSV / xlsx 出力
  ui/
    ...
```

ブラウザビルドでは `hospitalResident.ts` が `node:fs` / `node:path` を import するため、
Vite の `resolve.alias` でスタブに逃がす（`examples/web/vite.config.ts` に前例あり）。
なお実データの配属で使うのは `stableMatch()` のみで、`HospitalResident`（乱数生成）は
テスト用データ作成にのみ使う。

## 9. 実装マイルストーン

- **M0** プロジェクト雛形（Vite + TypeScript + ライブラリ導入、node stub alias）
- **M1** ドメイン層（スコア計算 → stableMatch → 集計）＋ 合成データによるユニットテスト
- **M2** UI 骨組み（D&D、パラメータ、結果表示、CSV 出力）— 合成データで一本通す
- **M3** 実ファイルのパーサ実装（LMS テキスト / GPA Excel / 裁量点 Excel）
- **M4** Excel 出力、安定性検証、統計表示、GitHub Pages 公開

M1・M2 は実ファイルの形式が未確定でも進められる。

## 10. 未確定事項

1. LMS 希望順位ファイルの実際の形式（サンプルが必要）
2. GPA Excel / 裁量点 Excel の列構成（サンプルが必要）
3. 定員はどのファイルから来るか（裁量点ファイル内 / 別ファイル / 画面入力）
4. 裁量点ファイルに全学生が載るのか、希望者のみか
5. 同点処理の規則
6. GPA の元スケール（40 点への換算方法）
