# open_gikai(議会文書管理システム)

市民が地方議会の文書(会議資料)や議会日程を簡単に閲覧できるようにするための、地方自治体向けオープンソースシステムです。

- 閲覧系(日程・議題・委員会・議員・お知らせ・資料DL)は認証不要で公開
- 更新系(各種マスタ管理・資料アップロード)は管理者(事務局職員)のみ、ID/PASS認証で保護
- Cloudflare の従量課金がベースのため、キャッシュ・ストレージクォータ・ボット対策など予算スパイク対策を設計段階で組み込んでいます

設計の詳細・意思決定の経緯は [docs/design.md](docs/design.md) を参照してください。元になった要件メモは [idea.md](idea.md) です。

セットアップせずに見た目だけ確認したい場合は、ダミーデータの[静的デモページ](demo/index.html)をブラウザで開いてください(`demo/index.html` を直接開くか、`npx serve demo` などで配信できます)。

## 技術スタック

| レイヤ | 技術 |
|--------|------|
| 実行基盤 | Cloudflare Workers |
| ルーティング/SSR | Hono + hono/jsx |
| データベース | Cloudflare D1 (SQLite) |
| オブジェクトストレージ | Cloudflare R2(会議資料) |
| 静的アセット | Workers Static Assets |
| 認証 | 自前実装(D1 + Web Crypto によるパスワードハッシュ・セッション管理。better-auth 等の外部認証ライブラリは不使用) |
| フロントエンド | vanilla JS(プログレッシブエンハンスメント。JS 無効でも閲覧系は動作) |
| デザイン | デジタル庁デザインシステム (DADS) v2.12.0 のトークンを採用 |

## セットアップ

```bash
npm install
npm run db:migrate:local   # ローカル D1 にスキーマを適用
npm run dev                 # wrangler dev でローカル起動 (http://localhost:8787)
```

管理画面は `/admin` 配下です。ID/PASS 認証で保護されています(§4)。初回は管理者アカウントを作成してください。

```bash
npm run create-admin -- --email admin@example.jp --password 'xxxxxxxxxxxx'
```

いろいろなパターン(過去の議員・複数期・同日チェーン日程・委員会採決→本会議採決の2段階賛否・公開/予約混在の議題やお知らせ等)を確認したい場合は、デモデータを投入できます。**ローカル/本番いずれの D1・R2 にある既存の業務データも削除される**ため、実運用データが入った環境では実行しないでください。

```bash
npm run seed-demo              # ローカルにデモデータを投入
npm run seed-demo -- --remote  # 本番に投入する場合(要注意)
```

## テスト

```bash
npm test          # vitest run
npm run test:watch
npx tsc --noEmit  # 型チェック
```

## ディレクトリ構成

```
src/
├── index.tsx        # Hono アプリのエントリポイント
├── env.d.ts          # Bindings 型定義
├── lib/               # DB ヘルパー・キャッシュヘッダー・フォームパース等の共通処理
├── routes/
│   ├── public/        # 公開ページ(認証不要)
│   ├── admin/          # 管理ページ(/admin/* 全体を認証で保護)
│   └── api/admin/      # 管理 API(資料アップロード等、同じく認証必須)
├── views/              # hono/jsx によるビュー(公開/admin)
└── validators/         # Zod スキーマ(SSR フォームと API で共用)

migrations/    # wrangler d1 migrations
public/assets/ # CSS(DADS トークン含む) / クライアント JS
docs/design.md # 詳細設計書
```

詳しい設計方針(DB スキーマ、ルーティング、キャッシュ/コスト対策など)は [docs/design.md](docs/design.md) にまとまっています。

## design-system-mcp について

`design-system-mcp/` は本リポジトリには含まれていません。[keisato848/design-system-mcp](https://github.com/keisato848/design-system-mcp) を別途 clone し、エディタの MCP サーバーとして登録してください。デジタル庁デザインシステムのトークン・コンポーネント仕様を MCP 経由で参照しながらフロントエンド実装を行うためのツールです。

## 実装状況

`docs/design.md` §11「実装フェーズ」に沿って段階的に実装しています。

- [x] フェーズ1: 基盤(wrangler 設定、D1 マイグレーション、レイアウト、DADS トークン CSS)
- [x] フェーズ2: マスタ CRUD(委員会・定例会・議案種別・議員・会派・委員会所属・会派所属・お知らせ)
- [x] フェーズ3: 認証(自前 ID/PASS 実装、`/admin/*` `/api/admin/*` 保護、CSRF)
- [x] フェーズ4: 議題・資料(R2 アップロード、容量クォータ)
- [x] フェーズ5: 日程管理(日程 CRUD、「前の会議終了後」チェーン、議題・資料紐付け)
- [x] フェーズ5.5: 賛否記録(会議×議員のグリッド一括入力)
- [x] フェーズ6: 公開画面(トップ・日程・議題・委員会・議員・お知らせ・資料 DL)
- [ ] フェーズ7: 仕上げ(Cache Rules 等インフラ設定、本番デプロイ)

## ライセンス

[Apache License 2.0](LICENSE)
