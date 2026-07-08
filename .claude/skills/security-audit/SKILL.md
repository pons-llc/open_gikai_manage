---
name: security-audit
description: 議会文書管理システム(Cloudflare Workers + Hono + D1 + R2 + 自前ID/PASS認証)のコードを静的監査し、SQLインジェクション・XSS・認可漏れ・アップロード脆弱性・キャッシュ汚染などのリスクを評価する。各実装フェーズの完了時、および機能追加・変更後に実行する。
---

# セキュリティ監査(open_gikai)

このプロジェクト固有のセキュリティ監査を行う。対象は `src/` `public/assets/*.js` `migrations/` `wrangler.jsonc`。
設計上のセキュリティ要件は [docs/design.md](../../../docs/design.md) の §4(認証)・§5.3(アップロード)・§9(キャッシュ/クォータ)・§10(非機能要件)を正とする。

## 手順

1. 対象ファイルを Grep/Read で走査し、下記チェックリストを **1 項目ずつ** 検証する。推測で「問題なし」としない — 該当コードを実際に読んで判定する。
2. 指摘は重大度(Critical / High / Medium / Low)を付けて報告する。
3. 各指摘に「該当箇所(file:line)」「攻撃シナリオ(具体的な入力と結果)」「修正方針」を必ず添える。
4. 指摘ゼロの場合も、確認した項目と根拠(どのファイルのどの実装で担保されているか)を一覧で報告する。

## チェックリスト

### 1. SQL インジェクション (D1)

- すべての D1 クエリが `prepare(...).bind(...)` のプレースホルダを使っているか。文字列連結・テンプレートリテラルへのユーザー入力埋め込みを全数検査する:
  - `grep -rn "prepare(" src/ | grep -E '\$\{|\+ *[a-zA-Z]'` で疑わしい箇所を抽出
- ORDER BY / LIMIT / テーブル名など bind できない位置に外部入力を使っていないか(使う場合はホワイトリスト照合になっているか)。
- 検索クエリ(`?q=`)の LIKE パターンで `%` `_` をエスケープしているか(DoS/意図しない全件一致)。

### 2. XSS

- hono/jsx の自動エスケープを迂回する `raw()` / `html` タグ / `dangerouslySetInnerHTML` の使用箇所を全数列挙し、渡る値が定数か検証済みかを確認する。
- 日程テキスト・お知らせ本文など「改行を保持して表示」する箇所が `innerHTML` や `raw()` ではなく、エスケープ後に `white-space: pre-wrap` または `<br>` 分割で実装されているか。
- `announcements.related_url` が出力前に `http:`/`https:` スキームに制限されているか(`javascript:` URL の `<a href>` 注入)。
- クライアント JS(`public/assets/*.js`)で `innerHTML` / `insertAdjacentHTML` / `document.write` にサーバ応答やユーザー入力を渡していないか。
- エラーメッセージ・バリデーションエラーの再表示でユーザー入力をエスケープしているか。

### 3. 認証・認可

- `/admin/*` と `/api/admin/*` の**全ルート**が認証ミドルウェアの後段に登録されているか。ルート定義を列挙し、ミドルウェア適用順を確認する(後から追加されたルートの漏れが典型パターン)。
- 公開登録エンドポイント(サインアップ)が実装されていないか。パスワードリセット等の追加エンドポイントが意図せず有効になっていないか。
- パスワードハッシュが PBKDF2-SHA256 等の適切なアルゴリズム・十分な反復回数・ユーザーごとの salt で実装されているか(平文保存・弱いハッシュ・salt 共通化がないか)。`src/lib/auth.ts` の `hashPassword`/`verifyPassword` を確認する。
- セッショントークンが DB に平文で保存されていないか(`admin_sessions.token_hash` はハッシュ済みであること)。Cookie が `HttpOnly` / `Secure` / `SameSite=Lax` 以上か。セッション有効期限(`expires_at`)の検証漏れがないか。
- 更新系(POST/DELETE)が GET で実行できないか(CSRF 経路)。自前の `requireSameOrigin` ミドルウェア(Origin ヘッダー検証)が状態変更リクエストの全経路に適用されているか。
- 公開エンドポイントの IDOR: `GET /news/:id` `GET /agenda-items/:id` が未公開(`published_at > now`)で 404 を返すか。`GET /documents/:id/file` が存在しない/削除済み ID で安全に失敗するか。
- 議題の露出経路漏洩(design.md §3.4): 議題は `/agenda-items` 一覧に加え、`meeting_agenda_items`(会議の議題一覧、直接経路)と `documents.agenda_item_id`(議題ごとの資料、間接経路)の**2 経路**で会議詳細 `/meetings/:id` に露出しうる。両経路の JOIN すべてで `agenda_items.published_at <= datetime('now')` 条件が付いているか。JOIN 系クエリを grep し、`agenda_items` `meeting_agenda_items` を参照する SELECT を全数確認する — 一覧ページのフィルタだけ直して JOIN 側(特に片方の経路)を直し忘れるのが典型パターン。

### 4. ファイルアップロード / R2

- 拡張子・MIME のホワイトリスト検証がサーバ側にあるか(クライアント検証のみは不可)。
- R2 キーがサーバ生成(ULID)であり、ユーザー入力(ファイル名)がキーに混入しないか(パストラバーサル)。
- ダウンロード時の `Content-Disposition` に `file_name` を埋め込む際、`"` と改行を除去/エンコード(RFC 5987 `filename*=`)しているか(ヘッダインジェクション)。
- `Content-Type` が保存時に検証した値であり、`text/html` 等が配信されないか(R2 経由の stored XSS)。ダウンロード応答に `X-Content-Type-Options: nosniff` があるか。
- 1 ファイル 50MB / 総容量クォータ(`STORAGE_QUOTA_BYTES`)の検証がアップロード処理の**書き込み前**にあるか。

### 5. キャッシュ (§9.1)

キャッシュの実体は**ゾーンレベルの Cloudflare Cache Rules**(ダッシュボード設定、コード外)であり、コードの grep だけでは検証しきれない。以下はコードで確認できる範囲と、確認できない範囲を分けて扱う。

- (コード)`src/lib/cache.ts` が `/admin/*` `/api/*` に `Cache-Control: private, no-store` 相当のヘッダーを付与しているか(Cache Rules 側の Bypass 漏れに対する保険)。
- (コード)`Set-Cookie` を含む応答(ログイン・ログアウト等)に `Cache-Control: public` を付けていないか。
- (インフラ、コードでは確認不可 — ダッシュボード確認結果を報告に明記)Cache Rules で「`/admin` `/api` `Cookie` を Bypass」するルールが「Cache Everything」ルールより高優先度になっているか(§9.4 チェックリスト)。この項目はコードレビューでは PASS/FAIL 判定不能なため、監査報告には「要ダッシュボード確認」として明示的に記載し自動 PASS にしない。

### 6. 設定・秘密情報

- `SESSION_SECRET` 等の秘密が `wrangler.jsonc` の `vars` やソースコードにハードコードされていないか(`wrangler secret` 管理か)。
- `console.log` にパスワード・セッショントークン・個人情報を出力していないか。
- 依存パッケージに既知脆弱性がないか: `npm audit --audit-level=high`(design-system-mcp/ ではなくプロジェクトルート)。

## 報告フォーマット

```
## セキュリティ監査結果 (YYYY-MM-DD, 対象: <フェーズ/差分>)

| # | 重大度 | 分類 | 箇所 | 概要 |
|---|--------|------|------|------|

### 指摘詳細
(各指摘: 攻撃シナリオ → 修正方針)

### 確認済み項目
(チェックリスト各項目の判定と根拠)

### 判定: PASS / FAIL(Critical・High が 1 件でもあれば FAIL)
```

FAIL の場合、修正が完了して再監査で PASS になるまで当該フェーズは完了扱いにしない(design.md §11)。
