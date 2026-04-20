# memo-polycanva.complex

BlockNote を使った Notion ライクなメモツールです。

## 機能

- BlockNote リッチテキスト編集
- サイドバーでページ管理（階層・選択・追加）
- ページのコンテキストメニュー（子ページ作成 / 名前変更 / ルート移動 / 削除）
- IndexedDB への自動保存
- JSON エクスポート / インポート

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
