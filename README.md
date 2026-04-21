# memo-polycanva.complex

BlockNote を使った Notion ライクなメモツールです。

## 機能

- BlockNote リッチテキスト編集
- サイドバーでページ管理（階層・選択・追加）
- ページ検索（タイトル + 本文）
- ピン留めページの上位表示
- ごみ箱（論理削除 / 復元 / 完全削除）
- 最終更新日時の表示
- 場所別のコンテキストメニュー（ページ / サイドバー空白 / エディタ）
- コマンドパレット（`/` と `@` 接頭辞対応）
- ショートカット・コマンドのヘルプウィンドウ
- IndexedDB への自動保存
- JSON エクスポート / インポート（旧形式データ互換）

## ショートカット

- `Ctrl/Cmd + K`: 検索入力へフォーカス
- `Ctrl/Cmd + Shift + N`: ルートページを新規作成
- `Ctrl/Cmd + N`: 現在のページに子ページを作成
- `Ctrl/Cmd + R`: 現在のページ名を変更
- `Ctrl/Cmd + Shift + P`: 現在のページのピン留め切替
- `Ctrl/Cmd + Delete`: 現在のページをごみ箱へ移動
- `Ctrl/Cmd + P`: コマンドパレットを開く
- `Ctrl/Cmd + /`: ヘルプウィンドウを開く
- `/` または `@`: コマンドパレットを接頭辞付きで開く

## 開発

```bash
npm install
npm run dev
```

## 検証

```bash
npm run lint
npm run build
```

## デプロイ

`main` ブランチへの push（または Actions の手動実行）で GitHub Pages にデプロイされます。  
ワークフロー: `.github/workflows/deploy.yml`
