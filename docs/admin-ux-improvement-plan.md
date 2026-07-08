# 管理画面 入力UX改善 実装計画書

- 作成日: 2026-07-08
- 対象: `/admin/*` 管理画面全体
- 前提: **データテーブル(D1スキーマ)は一切変更しない**。migrations の追加なし。
- 上位文書: `docs/design.md`(§5.2 / §5.3 / §6.3)。本計画の実装時に design.md の該当節を更新する。

---

## 1. 背景と課題

現状の管理画面は 13 の画面がすべて「1 DB テーブル = 1 画面」の CRUD で構成されており、
ナビゲーション([src/views/layout.tsx](../src/views/layout.tsx) `ADMIN_NAV`)もテーブル名がフラットに 13 項目並ぶ。
一方、議会事務局の実務は**テーブル単位ではなく業務単位**で流れる:

| 実務の単位 | 現状必要な画面遷移 |
|---|---|
| 改選: 新しい議員構成を登録する | 議員 → 会派 → 会派所属(1人ずつ) → 委員会所属(1人ずつ) の 4 画面 |
| 定例会の日程を組む | 定例会 → 議題(1件ずつ) → 資料(1件ずつアップロード) → 日程 → 賛否記録 の 5 画面 |
| 会議1件の議題に資料を付ける | 資料画面で事前アップロード → 日程編集に戻ってチェック |

個別の課題(コード上の根拠つき):

1. **業務の途中で画面をまたぐたびに文脈が失われる。** 日程フォーム
   ([src/views/admin/meetings.tsx](../src/views/admin/meetings.tsx))は議題・資料を紐づけられるが、
   その場では作成できない。資料が未アップロードだと「資料管理へ行く → 戻る → フォームを最初から入れ直す」になる。
2. **全件チェックボックスリストがスケールしない。** 議題・資料は全件表示 + 表示順の手入力
   (design.md §6.3 でも「数百件規模になったら検討」と明記済み)。年度が進むと実用限界が来る。
3. **保存成功のフィードバックがない。** 全ルートが PRG で一覧にリダイレクトするだけ
   ([src/routes/admin/members.tsx:95](../src/routes/admin/members.tsx#L95) ほか全ルート同型)。
   保存されたのか不安になり、連続入力のリズムも作れない。
4. **連続登録の支援がない。** 会派所属を 10 人分入れる場合、毎回 会派・所属開始日を選び直す。
5. **一覧に絞り込みがない。** 議題・日程・資料は全件を新しい順に並べるだけ。過去年度が溜まると探せない。
6. **所属(membership)系が独立画面である必然性がない。** 「会派所属」「委員会所属」はユーザーにとって
   議員(または委員会)の属性であり、単独のナビ項目・単独画面として存在すること自体が
   「1テーブル=1画面」感の主因になっている。

## 2. 改善方針

**「テーブルの画面」から「業務のハブ + 文脈の中での入力」へ。**

守るもの(変更しない):

- D1 スキーマ・R2・キャッシュ設計(design.md §3, §9)。**テーブル・カラム追加なし。**
- SSR + vanilla JS のプログレッシブエンハンスメント方針(design.md §2)。
  JS 無効でもすべての登録・編集が(効率は落ちても)完遂できること。
- PRG パターン、`requireAuth`、`logAdminMutation` による監査ログ、`/admin/*` `/api/*` の no-store。
- 既存の一覧テーブル(admin-table)の列構成・削除フローは原則そのまま。

新たに導入する画面パターン(3種類に統一):

| パターン | 用途 | 画面 |
|---|---|---|
| A. 単純マスタ(現状維持) | 低頻度・自己完結の設定 | 委員会・定例会・議案種別・会派・お知らせ |
| B. ハブ(詳細ページに関連編集を同居) | 「主役 + その所属/構成」をひとつの文脈で編集 | 議員詳細・委員会詳細・定例会詳細 |
| C. ワークフロー強化フォーム | 複数マスタを束ねる入力 | 日程フォーム・賛否グリッド(既にC。強化のみ) |

## 3. 改善項目の詳細

### P1. 共通基盤(全画面に効く土台)

**P1-1. フラッシュメッセージ(保存/削除の成功表示)**

- 方式: リダイレクト先 URL にクエリ `?flash=created|updated|deleted` を付け、
  レイアウト直下で緑のバナー「保存しました」等を SSR 表示する。
  管理画面は `private, no-store`(design.md §9.1)なのでクエリ方式でキャッシュ汚染の懸念はない。
  Cookie 不要・サーバ状態不要で最小実装。
- JS があれば表示後に `history.replaceState` でクエリを消す(リロードで再表示されない)。
- 実装:
  - `src/views/admin/shared.tsx` に `FlashBanner` を追加し、`Layout` 経由ではなく各ページ先頭で描画
    (もしくは `Layout` に `flash` prop を追加。**推奨: Layout に prop 追加**で 1 箇所化)。
  - 全 admin ルートの `c.redirect("/admin/xxx")` を `c.redirect("/admin/xxx?flash=created")` 等へ一括変更。
  - `public/assets/admin.js` に replaceState 処理を追加。
- 対象: 全 `src/routes/admin/*.tsx`、`src/views/layout.tsx`、`src/views/admin/shared.tsx`、`public/assets/style.css`。

**P1-2. 「登録して続けて入力」ボタン**

- 登録フォームに 2 つ目の submit `<button name="save_mode" value="continue">登録して続けて入力</button>` を追加。
  成功時のリダイレクト先を一覧ではなく同フォームにし、**文脈フィールドを保持**する:
  - 会派所属: `faction_id`・`term_start` を保持(議員だけ選び直す)→ 10 人連続入力が最短動線になる
  - 委員会所属: `committee_id`・`role`(=委員に戻す)・`term_start` を保持
  - 議員: `elected_on`・`election_count` を保持(同期の議員をまとめて登録)
  - 議題: `fiscal_year`・`category` を保持
- 保持はリダイレクトのクエリで渡す(`?flash=created&faction_id=3&term_start=2026-05-01`)。
  GET ハンドラ側で `emptyXxxForm` にクエリ値をマージするヘルパー `formFromQuery` を `src/lib/forms.ts` に追加。
  値はどのみち既存 zod スキーマを通らないと保存できないため、クエリ由来でも安全性は変わらない。
- 対象画面: 議員・会派所属・委員会所属・議題(効果の大きい 4 画面のみ。単純マスタには付けない)。

**P1-3. ナビゲーションの業務グループ化**

- `ADMIN_NAV` を 4 グループに再編し、ヘッダをグループ見出し付き(または `<optgroup>` 相当の区切り)にする:
  - **会議運営**: ダッシュボード / 日程 / 議題 / 資料 / 賛否記録
  - **議員・会派**: 議員 / 会派
  - **議会マスタ**: 委員会 / 定例会 / 議案種別
  - (右端) お知らせ / ログアウト
- 「委員会所属」「会派所属」はナビから外す(P2 のハブに吸収。既存 URL は残すのでブックマークは壊れない)。
- 対象: `src/views/layout.tsx`、`public/assets/style.css`(グループ表示のスタイル)。

**P1-4. 一覧の絞り込み(GET フォーム、JS 不要)**

- 議題一覧: 年度セレクト + 種類セレクト(公開側 `/agenda-items` と同じ実装パターン。§6.2 の流用)。
- 日程一覧: 年月セレクト + 定例会セレクト。
- 資料一覧: ファイル名部分一致(`LIKE`、公開側と同じ `%` `_` エスケープ関数を共用)+ 「議題未紐付けのみ」チェック。
- 対象: `src/routes/admin/{agendaItems,meetings,documents}.tsx` と対応ビュー。

### P2. ハブページ(所属系画面の吸収)

**P2-1. 議員詳細ハブ `GET /admin/members/:id`**

現状の `/admin/members/:id/edit`(一覧+フォームの同居ページ再利用)を、独立した詳細ページに置き換える:

```
┌ 議員: 山田 太郎 ──────────────────────────────┐
│ [基本情報フォーム] 氏名/議席/期/当選日/現任      → 更新する │
│ ── 会派所属の履歴 ─────────────────────       │
│  第一クラブ 2022-05-01〜(現所属)   [終了する] [編集] [削除] │
│  + その場追加フォーム: 会派▾ 開始日 (終了日)  → 追加する    │
│ ── 委員会所属の履歴 ───────────────────       │
│  総務委員会 委員長 2024-05-01〜(現任) [終了する] [編集] [削除] │
│  + その場追加フォーム: 委員会▾ 役職▾ 開始日   → 追加する    │
└──────────────────────────────────────────┘
```

- 「終了する」は term_end に本日をセットする 1 クリック操作
  (`POST /admin/members/:id/faction-memberships/:mid/end` 相当。確認ダイアログ付き)。
- 実装は既存の `factionMembershipsRoute` / `committeeMembershipsRoute` のハンドラロジックを
  lib 関数に抽出して共用し、ハブ内フォームの POST 先は member ハブ配下の新ルートにする
  (成功時リダイレクトが `/admin/members/:id?flash=created` になるだけで、検証・INSERT は同一コード)。
  `?return_to=` 方式は open redirect の検証が増えるだけなので採らない。
- 既存 `/admin/memberships` `/admin/faction-memberships` は**横断一覧(閲覧+編集)として残す**が、ナビからは外す。
  ハブから「所属の横断一覧を見る」リンクで到達できる。
- 議員一覧の「編集」リンクは詳細ハブへ変更。

**P2-2. 委員会詳細ハブ `GET /admin/committees/:id`**

- 委員会の基本情報フォーム + **現在の委員構成**(role 順・現任のみ)+ 過去の委員(折りたたみ)。
- その場追加フォーム(議員▾ / 役職▾ / 任期開始)と「任期を終了する」ボタン。実装は P2-1 と同じ共用ロジック。
- 改選時の一括入替は P2 ではスコープ外(§6 参照)。

**P2-3. 定例会詳細ハブ `GET /admin/sessions/:id`**

- 会期情報フォーム + **この定例会に紐づく日程の一覧**(日付順、開始時刻/「〇〇終了後」表示)。
- 「この定例会に日程を追加」ボタン → `/admin/meetings/new?regular_session_id=:id`(P1-2 の
  `formFromQuery` でプリセット)。定例会を選び直す手間と選び忘れをなくす。

### P3. 日程フォームの強化(最重要・最複雑フォーム)

**P3-1. 議題・資料チェックリストのインクリメンタル絞り込み(JS)**

- チェックリスト上部にテキスト入力を置き、入力に応じて行を `style.display` で絞り込む(client-side、fetch 不要)。
- 議題リストは年度で `<details>` グルーピング(当年度のみ初期展開)。チェック済み行は絞り込みに関係なく常に表示。
- JS 無効時は現状どおり全件表示のまま(方針 §2 準拠)。
- 対象: `src/views/admin/meetings.tsx`(`data-filter-list` 属性)、`public/assets/admin.js`、`style.css`。

**P3-2. 表示順の自動採番(JS)**

- チェックを入れた時点で order 入力が `0`/空なら「現在のチェック済み最大値 + 1」を自動セット。
  外したら 0 に戻す。手入力での上書きは従来どおり可能。数値 input は残すので JS 無効でも成立。
- 対象: `public/assets/admin.js`。

**P3-3. 資料のその場アップロード(JS + 既存 API 再利用)**

- 日程フォームの資料セクションに「ここでアップロード」インライン UI を追加。
  既存 `POST /api/admin/documents` は `Accept: application/json` でメタデータ JSON を返す実装済み
  ([src/routes/api/admin/documents.tsx](../src/routes/api/admin/documents.tsx))なので、**API 追加は不要**。
  fetch でアップロード成功 → チェックリストに行を動的追加し、チェック済み + 表示順自動採番にする。
- 日程フォーム自体は未送信のままなので、入力途中の内容は失われない(これが本項目の狙い)。
- JS 無効時: インライン UI は隠し、現状の「資料管理からアップロードできます」リンク文言を表示。
- クォータ超過・拡張子エラーは API のエラー JSON をそのままインライン表示。
- 対象: `src/views/admin/meetings.tsx`、`public/assets/admin.js`。

**P3-4. 議題のクイック作成 API(新規 API 1 本)**

- `POST /api/admin/agenda-items`(要認証・JSON)を追加。入力は既存 `agendaItemSchema` をそのまま通し、
  既存の INSERT ロジック・`logAdminMutation` を lib 関数に抽出して SSR ルートと共用する。
- 日程フォームの議題セクションに最小フィールド(議題名/年度/番号/種類、種類=議案のときのみ議案種別▾)の
  インライン作成 UI を置き、fetch 成功でチェックリストへ追加(P3-3 と同型)。
  `published_at` はクイック作成では即時公開固定とし、予約公開したい場合は議題画面を使う(UI を単純に保つ)。
- design.md §5.3 の API 表へ追記が必要(「実装しない」と明記されている検索 API とは別物である旨を注記)。
- 対象: `src/routes/api/admin/agendaItems.tsx`(新規)、`src/index.tsx`(ルート登録)、
  `src/routes/admin/agendaItems.tsx`(ロジック抽出)、`src/views/admin/meetings.tsx`、`public/assets/admin.js`。

### P4. ダッシュボードの「今日やること」化

- 現状の「マスタ名 + 件数」テーブルを、業務起点のブロックに置き換える:
  - **直近の日程**(現状あり。維持)
  - **賛否が未記録の終了済み会議**: 開催日が過去で、紐づく議題に 1 件も `agenda_item_votes` がない会議 → 記録画面へ直リンク
  - **予約中の議題・お知らせ**: `published_at` が未来の行(公開予定日時つき)→ 編集へ直リンク
  - **ストレージ使用量バー**(資料画面の表示を再利用)
- 件数カード表は廃止(ナビと重複しているため)。
- 対象: `src/routes/admin/dashboard.tsx`、`src/views/admin/dashboard.tsx`。

## 4. 実装ステップと完了条件

依存関係順。各ステップは独立してリリース可能な単位にし、**1 ステップ = 1 PR = 1 リリースタグ**で進める
(ブランチ・リリース運用の詳細は §8)。

| Step | 内容 | 主な変更ファイル | 規模感 | ブランチ | リリース |
|---|---|---|---|---|---|
| 0 | CI 整備・ブランチ保護・ベースラインタグ(§8-1) | .github/workflows/ci.yml | 小 | `chore/ci-release-setup` | `v1.0.0`(現行本番) |
| 1 | P1-1 フラッシュ / P1-2 連続登録 / P1-3 ナビ再編 | layout.tsx, shared.tsx, forms.ts, 全 admin ルート, admin.js, style.css | 中 | `feat/admin-ux-1-foundation` | `v1.1.0` |
| 2 | P1-4 一覧絞り込み(議題・日程・資料) | agendaItems/meetings/documents のルート+ビュー | 小 | `feat/admin-ux-2-list-filters` | `v1.2.0` |
| 3 | P3-1〜P3-3 日程フォーム強化(絞り込み/自動採番/その場アップロード) | meetings ビュー, admin.js, style.css | 中 | `feat/admin-ux-3-meeting-form` | `v1.3.0` |
| 4 | P2-1〜P2-3 ハブページ(議員・委員会・定例会) | members/committees/sessions ルート+ビュー, membership ロジックの lib 抽出 | 大 | `feat/admin-ux-4a/4b/4c-*`(3 PR に分割) | `v1.4.0` |
| 5 | P3-4 議題クイック作成 API / P4 ダッシュボード | api ルート新規, dashboard | 中 | `feat/admin-ux-5-quick-create` | `v1.5.0` |

各ステップ共通の完了条件:

1. `npm test`(vitest)グリーン。ステップ 4・5 は新ルートのユニットテストを `tests/unit/` に追加
   (membership 共用ロジック・クイック作成 API のバリデーションを最優先でカバー)。
2. **`/security-audit` を実行し Critical/High が 0 件**(CLAUDE.md の運用ルール。
   特に注意する観点: P1-2 のクエリ→フォーム反映が XSS にならないこと〈hono/jsx の自動エスケープ+zod 再検証〉、
   P2 の新 POST ルートが `requireAuth` 配下にあること、P3-4 API の認可と `logAdminMutation`、
   フラッシュや `?flash=` を含む応答が no-store であること)。
3. `docs/design.md` の §5.2(ルート表)・§5.3(API 表)・§6.3(管理画面)を実装に合わせて更新し、
   版数と変更履歴を追記。
4. JS 無効(DevTools で JavaScript disable)で全登録・編集フローが完遂できることを手動確認。

## 5. 新規・変更ルート一覧(データ変更なしの確認用)

| ルート | 種別 | 書き込み先テーブル(既存のみ) |
|---|---|---|
| `GET /admin/members/:id` | 新規(ハブ) | なし |
| `POST /admin/members/:id/faction-memberships` ほかハブ内所属操作 | 新規 | `faction_memberships` / `committee_memberships`(既存) |
| `GET /admin/committees/:id`, `GET /admin/sessions/:id` | 新規(ハブ) | なし |
| `POST /api/admin/agenda-items` | 新規 API | `agenda_items`(既存) |
| 既存全 POST の redirect 先に `?flash=` 付与 | 変更 | 変更なし |

migrations 追加なし。既存 URL(`/admin/memberships` 等)はすべて維持。

## 6. スコープ外(今回はやらない)

- **賛否グリッドの改修**: 一括入力 UI として既に完成度が高い(行フィルボタンあり)。手を入れない。
- **改選時の委員一括入替ウィザード**: 効果は大きいが頻度が 2〜4 年に 1 回。P2 ハブで所属入力が
  1 画面完結になった後、実運用の声を見て判断。
- **ドラッグ&ドロップでの表示順並べ替え**: 自動採番(P3-2)で大半のケースは足りる。追加ライブラリ不要方針とも衝突。
- **資料のファイル差し替え・リネーム**: R2 キー設計に関わるため別検討。
- **SPA 化・フレームワーク導入**: design.md §2 の方針(SSR + vanilla JS)を維持する。

## 7. リスクと対策

| リスク | 対策 |
|---|---|
| ハブ内フォームと既存所属画面でロジックが二重化する | ハンドラ本体を `src/lib/memberships.ts`(新規)へ抽出し、両ルートから呼ぶ。ビューの行コンポーネントも共用 |
| `?flash=` や P1-2 のクエリ引き継ぎで URL 由来の値が画面に出る | 値は固定の列挙(`created|updated|deleted`)のみ許可。フォーム初期値は既存の value エスケープ(hono/jsx)に乗せ、保存時は必ず zod を通す |
| 日程フォームの JS が肥大化する | admin.js 内で「フィルタリスト」「自動採番」「インラインアップロード」を data 属性ベースの独立した初期化関数に分け、フォーム固有コードと切り離す |
| ステップ 4 が大きく途中で止まる | ハブは 議員 → 委員会 → 定例会 の順に 1 ページずつ完結させる(議員ハブ単体でもナビ再編と辻褄が合う) |

## 8. GitHub 運用: ブランチ・リリース戦略

前提(2026-07-08 時点の実態):

- リモートは `pons-llc/open_gikai_manage`、ブランチは `main` のみ。タグ・GitHub Releases・CI は未整備。
- デプロイは `npm run deploy`(`wrangler deploy`)の手動実行。**main へのマージだけでは本番に出ない**ため、
  マージとデプロイを分離できる(§8-3 のリリース手順で明示的にデプロイする)。
- 本計画は migrations 追加ゼロ(§5)なので、**全ステップで DB ロールバックを考慮する必要がない**。
  切り戻しは常に「コードのみ」で完結する。

### 8-1. Step 0: 運用の下ごしらえ(実装に入る前に 1 度だけ)

1. **ベースラインタグ**: 現行本番相当の main 先頭に `v1.0.0` を打ち、GitHub Release を作成する
   (フェーズ7完了 = 本番運用開始時点のスナップショット。以後の差分説明の基準点になる)。
2. **CI(GitHub Actions)**: `.github/workflows/ci.yml` を新規追加。PR と main push で
   `npm ci` → `npm run build`(tsc --noEmit)→ `npm test`(vitest)を実行する。
   デプロイは CI に含めない(手動デプロイ運用を維持。自動化はこの計画のスコープ外)。
3. **main のブランチ保護**: 直 push 禁止・PR 必須・CI グリーン必須を設定する
   (GitHub リポジトリ設定。個人開発でも「うっかり main に直コミット」を機械的に防ぐのが目的)。
4. **マイルストーン**: GitHub Milestone「管理画面UX改善」を作成し、Step 1〜5 を Issue 化して紐づける
   (進捗と残作業が Issues タブで見える状態にする)。

### 8-2. ブランチ戦略: GitHub Flow(統合ブランチは作らない)

**main + 短命フィーチャーブランチのみ**とする。`develop` や長期の `feature/admin-ux` 統合ブランチは作らない。

- 理由: §4 の各ステップは「独立してリリース可能」に設計してある。統合ブランチに溜めてビッグバンで
  main に入れる方式は、この設計の利点(小さく出して小さく戻せる)を捨てることになる。
  また統合ブランチは main との乖離が進むほどリベース地獄になり、単独開発では管理コストだけが残る。
- ブランチ名は `feat/admin-ux-<step番号>-<内容>`(§4 の表)。修正のみの変更は `fix/`、CI 等は `chore/`。
- **Step 4 だけは 3 PR に分割**する(`feat/admin-ux-4a-member-hub` → `4b-committee-hub` → `4c-session-hub`)。
  1 PR がレビュー可能なサイズ(目安: 差分 ±600 行以内)を超えそうな場合は、他ステップも同様に分割してよい。
  分割した場合、リリースタグ(`v1.4.0`)は 4c マージ後にまとめて 1 つ打つ。
- マージ方式は **squash merge** に統一(main の履歴が「1 コミット = 1 PR = 1 リリース単位」になり、
  切り戻しが `git revert <squash commit>` 1 発になる)。
- PR 本文には対応する Issue(§8-1)と、§4 完了条件のチェックリスト
  (vitest / security-audit / design.md 更新 / JS 無効確認)を含める。

### 8-3. リリース手順(各ステップ共通)

マージ = リリースではない。以下を 1 ステップ分のリリースの定義とする:

1. PR を main に squash merge(CI グリーンが前提)。
2. main で `npm run deploy` を実行し本番へ反映。
3. `docs/phase7-runbook.md` の本番確認手順(スモークチェック)+ 当該ステップの新機能を管理画面で手動確認。
   確認する環境は本番のみ(ステージング環境は作らない — Workers の `wrangler versions`
   によるプレビューはあるが、D1 本番データと組み合わせた検証が必要な変更ではないため導入しない)。
4. 問題なければ `git tag vX.Y.0 && git push origin vX.Y.0` を打ち、GitHub Release を作成する。
   リリースノートには (a) 利用者(事務局)向けの変更点、(b) design.md の更新箇所、
   (c) `/security-audit` の実施結果(Critical/High 0 件)を記載する。
5. バージョニングはセマンティックバージョニング準拠: 各ステップは minor(`v1.1.0`〜`v1.5.0`)、
   ステップ間のバグ修正は patch(`v1.1.1`)。破壊的変更はこの計画には存在しない
   (既存 URL・スキーマをすべて維持するため。§5)。

### 8-4. 切り戻し(ロールバック)手順

即時性の順に 2 段構え。migrations がないため、どちらも安全に単独実行できる:

| 手段 | 使いどころ | 手順 |
|---|---|---|
| Wrangler ロールバック(数分) | デプロイ直後に本番で障害が発覚した場合の応急処置 | `npx wrangler deployments list` → `npx wrangler rollback <直前の deployment-id>`(phase7-runbook.md 記載の既存手順) |
| git revert(恒久対応) | 応急処置後、コードとして差し戻す場合 | `git revert <該当 squash commit>` の PR を作成 → CI → merge → deploy → patch タグ(例: `v1.3.1`) |

注意: `wrangler rollback` は Worker コードのみが戻り、**git 上の main は進んだまま**になる。
応急処置のあと必ず revert PR まで実施し、main と本番の内容を一致させてから次のステップに進む。

### 8-5. 実装中の割り込み(通常運用の修正)との共存

- ステップ実装中に本番バグ修正が必要になった場合: main から `fix/` ブランチを切り、
  通常どおり PR → merge → deploy → patch タグ。作業中のフィーチャーブランチは
  `git rebase origin/main` で追従する(squash merge 運用なのでコンフリクトは局所化される)。
- design.md・README などドキュメントのみの変更は CI グリーンを条件にタグ・デプロイ不要
  (リリースはコード変更を伴う PR のみを対象とする)。
