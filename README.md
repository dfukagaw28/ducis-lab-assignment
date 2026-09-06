# 研究室配属システム

学生の希望順位と研究室ごとの点数（GPA点 + 教員裁量点）から、安定マッチングで
研究室配属を決めるブラウザアプリです。

マッチングには [`hospital-resident-matching`](https://github.com/dfukagaw28/hospital-resident-matching)
の `stableMatch()`（学生側最適の受入保留アルゴリズム）を使います。

設計は [DESIGN.md](DESIGN.md) を参照してください。

## 動かす

```bash
npm install
npm run dev      # http://localhost:5173
```

`index.html` は `/src/main.ts` を TypeScript のまま読み込むので、Vite 経由でしか
動きません。静的に配信するときはバンドルしてください。

```bash
npm run build    # 型検査 + dist/ にバンドル
npm run preview  # dist/ を配信して確認
```

`dist/` は相対パス（`base: "./"`）で参照するので、GitHub Pages でもサブディレクトリ
でもそのまま置けます。

```bash
npm run typecheck
npm test
```

## 個人情報について

計算はすべてブラウザ内で完結し、入力したファイルがサーバに送られることはありません。

実データ（学籍番号・氏名・GPA・裁量点）は `data/` に置いてください。`.gitignore` で
`data/`・`private/`・`*.xlsx`・`*.xls`・`*.csv` を除外しています。リポジトリに入れて
よいのは `samples/` 配下の匿名化した合成データだけです。

## 進捗

- [x] **M0** プロジェクト雛形（Vite + TypeScript + ライブラリ導入）
- [ ] **M1** ドメイン層（スコア計算 → `stableMatch` → 集計）とテスト
- [ ] **M2** UI 骨組み（ドラッグ＆ドロップ、パラメータ、結果表示、CSV 出力）
- [ ] **M3** 実ファイルのパーサ（LMS テキスト / GPA Excel / 裁量点 Excel）
- [ ] **M4** Excel 出力、安定性検証、統計表示、公開
