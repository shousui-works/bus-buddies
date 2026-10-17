# BUS BUDDIES

- 独立したブラウザゲームのリポジトリです。ChatGPTプロジェクトの同期ファイルには依存しません。
- 追加依存なしのHTML/CSS/JavaScriptで構成します。
- `npm run dev` でローカル起動、`npm test` でゲームルールを検証します。
- ゲームルールは `public/engine.mjs`、画面と操作は `public/app.mjs` に置きます。
- ルールやステージを変えたら、全ステージの解法と乗客数の整合性を確認してください。
