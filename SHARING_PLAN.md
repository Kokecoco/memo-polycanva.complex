# ユーザー共有機能 実装計画書

## 概要
現在のGoogle同期機能（個人デバイス間の同期）を拡張し、ユーザー同士でページやワークスペースを共有できる機能を実装します。

## 要件仕様

### 共有単位
- **ページごと**：個別ページに共有キーを付与し、そのページを他ユーザーに共有
- **ワークスペース全体**：従来の同期キー方式（全ページを共有）

### アクセス権限
- **読取専用（Viewer）**：受信側は参照のみ、編集不可
- **読み書き可能（Editor）**：受信側も編集でき、変更が反映される

### 共有キー形式
1. **アプリ内キー**：`share-xxxxx` のようなコード形式
   - UI内で「共有キーを生成」して共有相手に伝える
   
2. **URLリンク形式**：`memo-polycanva.complex/?share=xxxxx`
   - ブラウザのアドレスバーからコピペで共有

### マージ戦略
受信側が共有データを取り込む際、ユーザーが選択可能：
- **上書き**：受信データで完全に置換
- **マージ**：ローカルと受信データを統合（タイムスタンプベース）

---

## アーキテクチャ設計

### 1. データモデル拡張

#### フロントエンド (App.tsx)
```typescript
// 新規インターフェース
interface ShareSettings {
  shareKey: string;        // page-xxxx or workspace-yyyy
  permissions: "viewer" | "editor"; // アクセス権限
  isOwner: boolean;       // 共有元か受信側か
  createdAt: number;      // 共有作成日時
  sharedBy?: string;      // 共有者のデバイスID
}

interface MemoPage {
  // 既存フィールド...
  shareSettings?: ShareSettings; // ページレベルの共有設定
}

interface Workspace {
  // 既存フィールド...
  shareSettings?: ShareSettings; // ワークスペースレベルの共有設定
}
```

#### IndexedDB スキーマ
```
Store: "shares"
  key: shareKey
  values: {
    shareKey: "page-uuid-xxxx" or "workspace-uuid-yyyy",
    type: "page" | "workspace",
    pageId?: "page-uuid", // type=page の場合
    permissions: "viewer" | "editor",
    isOwner: boolean,
    gasUrl: string,
    spreadsheetRef: string,
    createdAt: number,
    updatedAt: number
  }
```

### 2. Google Apps Script 拡張

#### 新しいシートスキーマ
現在: `memo_sync` シート（ワークスペース全体用）
追加: 以下の複数アクション対応

**GAS API エンドポイント拡張：**

```
GET  /exec?action=get&shareKey=xxx&spreadsheetId=yyy
GET  /exec?action=test&shareKey=xxx&spreadsheetId=yyy
POST /exec (action: "save_page", "share", "list_shares" など)
```

#### 新規シート: `memo_shares`
```
Headers: [shareKey, type, pageId, data, permissions, isOwner, createdAt, updatedAt, accessedAt]

例:
shareKey         | type      | pageId     | data            | permissions | isOwner | createdAt    | updatedAt    | accessedAt
page-abc123      | page      | page-uuid  | {JSON}          | editor      | true    | 1715000000   | 1715000000   | 1715000000
workspace-def456 | workspace | null       | {JSON}          | viewer      | false   | 1715001000   | 1715001000   | 1715001000
```

### 3. フロントエンド UI コンポーネント

#### 新規コンポーネント

1. **ShareModal**
   - 共有キー生成
   - URLリンク生成（コピー機能）
   - アクセス権限設定（Viewer/Editor）
   - 共有キー管理（削除）

2. **ReceiveShareModal**
   - 共有キーまたはURLからデータを受信
   - プレビュー表示
   - マージ方法の選択（上書き/マージ）
   - 権限の表示

3. **ShareSettingsPanel**
   - 同期設定の下に追加
   - 共有キーの入力フィールド
   - 受信データの表示

---

## 実装ステップ

### Phase 1: バックエンド（GAS）基盤構築 (1-2日)
- [ ] google-sync.gs に新規シート処理を追加
- [ ] 共有キー生成ロジック実装
- [ ] `doGet/doPost` を拡張して新アクション対応
- [ ] ページレベル同期のAPI実装

**変更ファイル:**
- `google-sync.gs` (追加: 200-300行)

### Phase 2: フロントエンド基礎（データモデル） (1日)
- [ ] `App.tsx` に新インターフェース追加
- [ ] IndexedDB スキーマ追加
- [ ] 共有キー生成ロジック実装（UUID生成）

**変更ファイル:**
- `src/App.tsx` (追加: 100-150行)

### Phase 3: フロントエンド UI (2-3日)
- [ ] ShareModal コンポーネント実装
- [ ] ReceiveShareModal コンポーネント実装
- [ ] サイドバーに「ページを共有」メニュー追加
- [ ] URLパラメータ (`?share=xxx`) の処理

**新規ファイル:**
- `src/components/ShareModal.tsx`
- `src/components/ReceiveShareModal.tsx`

### Phase 4: 受信側ロジック実装 (1-2日)
- [ ] 共有データ受信・パース
- [ ] マージロジック実装（タイムスタンプベース）
- [ ] 権限チェック（Editor/Viewer 分岐）
- [ ] エラーハンドリング

**変更ファイル:**
- `src/App.tsx` (追加: 150-200行)

### Phase 5: 統合テスト・調整 (1日)
- [ ] 各シナリオテスト
  - ページ共有 → 受信 → マージ
  - ワークスペース共有
  - 権限チェック
  - URLリンク共有
- [ ] UI/UX 調整

---

## 実装の詳細設計

### GAS側の新アクション

```javascript
// 共有キー生成
action: "generate_share"
  - type: "page" | "workspace"
  - pageId: (page の場合)
  - permissions: "viewer" | "editor"
  - 戻り値: { shareKey, url, expiresAt? }

// 共有データ取得
action: "get_share"
  - shareKey: "page-xxx"
  - 戻り値: { data, permissions, updatedAt, ... }

// 共有設定変更
action: "update_share"
  - shareKey: "page-xxx"
  - permissions: "viewer" | "editor"
  - 戻り値: { ok, message }

// 共有削除
action: "delete_share"
  - shareKey: "page-xxx"
  - 戻り値: { ok, message }

// アクセス記録更新
action: "touch_share"
  - shareKey: "page-xxx"
  - 戻り値: { ok }
```

### フロントエンド側の新ロジック

```typescript
// 共有キー生成
function generateShareKey(type: "page" | "workspace"): string {
  const prefix = type === "page" ? "page-" : "workspace-";
  return prefix + generateUUID();
}

// URLからの共有データ受信
function handleShareUrl(shareKey: string) {
  // 1. GASから shareKey のデータを取得
  // 2. 権限をチェック
  // 3. ReceiveShareModal を表示
  // 4. ユーザーにマージ方法を選択させる
  // 5. マージ実行
}

// マージロジック
function mergePageData(local: MemoPage, received: MemoPage): MemoPage {
  // タイムスタンプベースのマージ
  // 新しいタイムスタンプを優先
  if (received.updatedAt > local.updatedAt) {
    return received;
  }
  return local;
}
```

---

## セキュリティ考慮事項

1. **CORS対応**
   - GAS の `doGet/doPost` で CORS ヘッダー確認
   - 複数オリジンからのアクセスに対応

2. **権限検証**
   - Editor 権限でのみ書込許可
   - スプレッドシートレベルの権限チェックは既存仕組み維持

3. **共有キーの安全性**
   - UUID v4 で生成（予測困難）
   - 必要に応じて有効期限設定可能

4. **ユーザーの自己責任**
   - READMEに注釈を追加
   - Google同期と同様に「利用者の自己責任」明記

---

## 参考情報

### 既存コード参照
- 同期 API: `callSyncApiGet`, `callSyncApiSave`
- 設定保存: `localStorage` + `IndexedDB`
- UI パターン: `SyncSettingsModal`, `RestoreModal`

### 今後の拡張可能性
- 共有キーの有効期限管理
- アクセスログ機能
- 共有レベルの権限（Owner/Editor/Viewer）
- ページグループの一括共有

---

## 実装開始準備

1. **GAS修正案を確認**（このファイル案を参照）
2. **新規 .tsx ファイル作成**（ShareModal等）
3. **既存 App.tsx の diff を確認** してから修正開始

準備完了でしたら、「**実装開始**」をお知らせください。
