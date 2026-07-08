# フェーズ7(仕上げ・本番デプロイ)手順書

`docs/design.md` §11 のフェーズ7に対応する作業手順。**このドキュメントは手順のみを記載しており、実行はまだしていない。** 実施時はこのファイルの各チェックボックスを更新しながら進める。

対象読者: このリポジトリのコードに触れる開発者、および実際にインフラ設定(Cloudflareダッシュボード)を行う自治体側担当者/委託ベンダー。

## 0. 前提

- 本番用のCloudflareアカウントと、対象自治体が実際に使うカスタムドメイン(例: `gikai.○○-city.jp`)を用意していること。`*.workers.dev` のみでは本番運用しない(design.md §9.1 — Cache Rulesがカスタムドメインのゾーンにしか設定できないため)。
- フェーズ1〜6・5.5が完了していること(README「実装状況」参照)。
- `/security-audit` スキルがフェーズ3・4・5・5.5で指摘ゼロになっていること。

## 1. 現状ギャップ(このドキュメント作成時点)

フェーズ7として残っている作業は以下。着手前に最新のコード状況で再確認すること。

- [ ] エラーページが `src/index.tsx` の `app.notFound` / `app.onError` でプレーンテキスト応答のまま(`Not Found` / `Internal Server Error`)。DADSトークンに沿った簡易HTMLページに差し替える。
- [ ] `tests/` は `tests/unit/*.test.ts` のみで、integration テストが存在しない。design.md の完了条件「integration テスト green」を満たすテストを追加する。
- [ ] `wrangler.jsonc` の `d1_databases[0].database_id` が `<作成後に設定>` のまま、`vars.APP_URL` が `http://localhost:8787` のまま。
- [ ] `SESSION_SECRET` が本番環境に未設定(`wrangler secret put` 未実施)。
- [ ] D1リモートDBが未作成・マイグレーション未適用。
- [ ] 本番管理者アカウントが未作成。
- [ ] §9.4 のインフラ設定チェックリスト(Cache Rules / Bot Fight Mode / WAFレートリミット / Billing通知)が未設定。

## 2. コード側の残作業

### 2.1 エラーページ

`src/index.tsx` の `app.notFound` / `app.onError` を、`src/views/layout.tsx` の `Layout` を使った簡易HTMLページに置き換える。JS無効でも表示できるSSRページとし、DADSトークン(`public/assets/tokens.css`)の配色を使う。スタックトレースや内部エラー文言を `onError` のレスポンスに含めない(情報漏洩防止)。

### 2.2 integration テスト

`@cloudflare/vitest-pool-workers` を使い、`tests/integration/` を新設して以下を最低限カバーする:

- 未認証で `/admin/*` `/api/admin/*` にアクセス → ログインへリダイレクト/401になること
- ログイン→Cookie発行→保護ルートにアクセスできること→ログアウトでセッションが無効化されること
- 予約公開(`published_at` が未来)の議題・お知らせが公開一覧・詳細に出ないこと
- 資料アップロードがクォータ超過時に422を返すこと
- `requireSameOrigin` がOrigin不一致のPOSTを拒否すること

`npm test` (Vitest) がこれらを含めてgreenになることを確認する。

## 3. Cloudflareリソースの準備

```bash
# D1本番DBの作成(まだの場合)
npx wrangler d1 create open-gikai
# 出力された database_id を wrangler.jsonc の d1_databases[0].database_id に反映する

# R2バケットの作成(まだの場合。wrangler.jsonc の bucket_name と一致させる)
npx wrangler r2 bucket create open-gikai-documents

# 本番マイグレーション適用
npm run db:migrate:remote
```

`wrangler.jsonc` を編集:

- `d1_databases[0].database_id` を実際のIDに設定
- `vars.APP_URL` を本番ドメイン(例: `https://gikai.○○-city.jp`)に設定(`requireSameOrigin` のOrigin検証で使われるため、実ドメインと不一致だと本番ログインが機能しない)

## 4. シークレット設定

```bash
npx wrangler secret put SESSION_SECRET
# ランダムな32バイト以上の文字列を入力(例: openssl rand -base64 32 の出力)
```

## 5. 本番管理者アカウント作成

```bash
npm run create-admin -- --email <事務局の管理者メール> --password '<強力なパスワード>'
```

初回ログイン後、必要に応じてパスワードを再設定できる導線が管理画面にあるか確認する(なければ別途 `create-admin` を再実行して上書きする運用でも可)。

## 6. デプロイ

```bash
npm run deploy   # wrangler deploy
```

デプロイ後、`https://<workers.devサブドメイン>` ではなくカスタムドメイン経由で以降の確認を行う(Cache Rulesがカスタムドメインのゾーンにのみ効くため)。

## 7. Cloudflareダッシュボード側インフラ設定(design.md §9.4)

**この節はコードの差分に現れないため、チェックを飛ばしやすい。1項目ずつ画面で確認しながら進める。**

### 7.1 カスタムドメインのゾーン追加

- [ ] 対象ドメインをCloudflareにゾーンとして追加し、DNSが有効化されていること(ネームサーバー移管 or CNAME setup済み)

### 7.2 Cache Rules(Rules → Cache Rules)

優先順位を**必ず**この順で設定する(design.md §9.1の表と同一)。

| 優先順 | マッチ条件 | 動作 |
|---|---|---|
| 1(最優先) | `http.request.uri.path starts_with "/admin"` OR `starts_with "/api"` OR `http.cookie contains "gikai_session"` | Bypass cache |
| 2 | `http.request.uri.path starts_with "/documents/" and ends_with "/file"` | Cache Eligible, Edge TTL **1日** |
| 3(残り全部) | それ以外の全パス | Cache Eligible, Edge TTL **30分(1800秒)** |

- [ ] ルール1がルール2・3より優先度が高いことを画面上で確認(**ここを誤ると管理画面やセッションが他利用者にキャッシュ配信される重大インシデントになる**)
- [ ] ルール2・3のEdge TTL値が上表と一致している

### 7.3 Bot Fight Mode(Security → Bots)

- [ ] 有効化済み(無料プランで利用可)

### 7.4 WAFレートリミット(Security → WAF → Rate limiting rules)

- [ ] `/documents/*/file` と `/api/*` に設定済み(例: 同一IPから60秒に100リクエストで429)

### 7.5 Billing / Usage通知

- [ ] Workersリクエスト数・D1行読み取り数の想定超過時にメール通知が来るよう有効化済み

## 8. デプロイ後の検証チェックリスト

すべて本番カスタムドメイン(`workers.dev` ではない)に対して実施する。

- [ ] `curl -I https://<本番ドメイン>/` の `Cache-Control` ヘッダーが `public, max-age=1800` 相当であること
- [ ] `curl -I https://<本番ドメイン>/documents/1/file` (実在ID) の `Cache-Control` が `max-age=86400, immutable` 相当であること
- [ ] `curl -I https://<本番ドメイン>/admin` が `Cache-Control: private, no-store` を返すこと(未ログインならログイン画面へのリダイレクトだが、いずれにせよキャッシュされない)
- [ ] ブラウザでログイン→管理画面操作→ログアウトが一連で動作すること
- [ ] 資料アップロード→公開画面からダウンロードできること
- [ ] 存在しないURLで簡易HTMLの404ページが表示されること(プレーンテキストでない)
- [ ] JavaScriptを無効化したブラウザで公開系ページ(トップ・日程・議題・委員会・議員・お知らせ)が一通り閲覧できること
- [ ] `/security-audit` を実行し、Critical/High指摘がゼロであること
- [ ] `npm test` がgreenであること(integrationテスト含む)

## 9. ロールバック手順

- コードの問題: `npx wrangler deployments list` で直前のデプロイを確認し、`npx wrangler rollback <deployment-id>` で切り戻す。
- Cache Rulesの誤設定によりキャッシュ汚染が疑われる場合: 直ちにダッシュボードから該当ルールを無効化 → ゾーン全体パージ(Purge Everything)を実行 → 原因調査。
- D1マイグレーションの問題: D1 Time Travel(30日以内)で特定時点に復元(`npx wrangler d1 time-travel restore open-gikai --timestamp=<ISO8601>`)。

## 10. フェーズ7 完了条件(design.md §11 と同一)

- [ ] integration テスト green
- [ ] `/security-audit` 全項目パス
- [ ] 本ドキュメント §7 のチェックリスト全項目済み
- [ ] 本番URL(カスタムドメイン)で動作確認済み
