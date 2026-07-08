import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { contentDispositionHeader } from "../../lib/storage";

export const documentsRoute = new Hono<AppEnv>();

/**
 * §5.1: 資料ダウンロード。R2 からストリーミング。Content-Disposition: inline(PDF はブラウザ内表示)、
 * file_name を安全にエンコードして filename に設定する(§10: ヘッダインジェクション対策)。
 * §12 未決事項3 の解決: 議題に紐づく資料(agenda_item_id が非 NULL)は、その議題の published_at に従う
 * (予約公開中の議題にひもづく資料を ID の推測/連番アクセスで直接取得できてしまう抜け道を塞ぐ)。
 * 議題に紐づかない資料(会議全体の資料。meeting_documents 経由)は従来どおり即時公開のまま。
 */
documentsRoute.get("/:id/file", async (c) => {
  const id = Number(c.req.param("id"));
  const doc = await c.env.DB.prepare(
    `SELECT d.r2_key, d.file_name, d.content_type
     FROM documents d
     LEFT JOIN agenda_items ai ON ai.id = d.agenda_item_id
     WHERE d.id = ? AND (d.agenda_item_id IS NULL OR ai.published_at <= datetime('now'))`
  )
    .bind(id)
    .first<{ r2_key: string; file_name: string; content_type: string }>();
  if (!doc) return c.notFound();

  const object = await c.env.BUCKET.get(doc.r2_key);
  if (!object) return c.notFound(); // R2 に実体が無い(削除済み等)場合も安全に 404

  const headers = new Headers();
  headers.set("Content-Type", doc.content_type);
  headers.set("Content-Disposition", contentDispositionHeader(doc.file_name, "inline"));
  headers.set("X-Content-Type-Options", "nosniff"); // §10: stored XSS 対策(MIME スニッフィング禁止)
  headers.set("Cache-Control", "public, max-age=86400, immutable"); // §9.1: 資料は Edge TTL 1日

  return new Response(object.body, { headers });
});
