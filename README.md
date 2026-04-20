# memo-polycanva.complex

BlockNote を使った Notion ライクなメモツールです。

## 機能

- BlockNote リッチテキスト編集
- サイドバーでページ管理（階層・選択・追加）
- ページ検索（タイトル + 本文）
- ピン留めページの上位表示
- ごみ箱（論理削除 / 復元 / 完全削除）
- 最終更新日時の表示
- ページのコンテキストメニュー（子ページ作成 / 名前変更 / ピン留め / ルート移動 / ごみ箱移動 / 復元 / 完全削除）
- IndexedDB への自動保存
- JSON エクスポート / インポート（旧形式データ互換）

## ショートカット

- `Ctrl/Cmd + K`: 検索入力へフォーカス
- `Ctrl/Cmd + Shift + N`: ルートページを新規作成

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
