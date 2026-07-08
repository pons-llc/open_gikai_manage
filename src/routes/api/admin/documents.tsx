import { Hono, type Context } from "hono";
import type { AppEnv } from "../../../env";
import { logAdminMutation } from "../../../lib/auditLog";
import { withFlash } from "../../../lib/flash";
import {
  MAX_FILE_SIZE_BYTES,
  canonicalContentType,
  extractExtension,
  generateR2Key,
  isAllowedExtension,
  isAllowedMimeForExtension,
  wouldExceedQuota,
} from "../../../lib/storage";

export const apiDocumentsRoute = new Hono<AppEnv>();

const wantsJson = (c: Context<AppEnv>): boolean => (c.req.header("Accept") ?? "").includes("application/json");

/**
 * §5.3: POST /api/admin/documents。JS を使う画面(将来の日程編集画面のその場アップロード等)は
 * Accept: application/json でメタデータを受け取り、JS 無しの通常の <form> 送信は
 * 成功時 /admin/documents へリダイレクトされる(design.md の「JSはUX向上にのみ使う」方針に合わせた二重対応)。
 */
apiDocumentsRoute.post("/", async (c) => {
  const json = wantsJson(c);
  const fail = (message: string, status: 400 | 422) =>
    json
      ? c.json({ error: { code: status === 422 ? "storage_quota_exceeded" : "validation_failed", message } }, status)
      : c.text(message, status);

  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File) || file.size === 0) {
    return fail("ファイルを選択してください", 400);
  }

  const extension = extractExtension(file.name);
  if (!isAllowedExtension(extension)) {
    return fail(`許可されていない拡張子です: .${extension || "(なし)"}`, 400);
  }
  if (!isAllowedMimeForExtension(extension, file.type)) {
    return fail("ファイルの形式(MIME)が拡張子と一致しません", 400);
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return fail("ファイルサイズが50MBを超えています", 400);
  }
  if (await wouldExceedQuota(c.env.DB, Number(c.env.STORAGE_QUOTA_BYTES), file.size)) {
    return fail("ストレージ容量の上限を超えるためアップロードできません", 422);
  }

  const agendaItemIdRaw = form["agenda_item_id"];
  const agendaItemId = typeof agendaItemIdRaw === "string" && agendaItemIdRaw !== "" ? Number(agendaItemIdRaw) : null;

  const r2Key = generateR2Key(extension);
  const contentType = canonicalContentType(extension);
  await c.env.BUCKET.put(r2Key, await file.arrayBuffer(), { httpMetadata: { contentType } });

  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO documents (r2_key, file_name, file_size, extension, content_type, agenda_item_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(r2Key, file.name, file.size, extension, contentType, agendaItemId)
      .run();
    logAdminMutation(c, "documents", result.meta.last_row_id ?? null, "create");

    if (json) {
      return c.json(
        {
          id: result.meta.last_row_id,
          file_name: file.name,
          file_size: file.size,
          extension,
          content_type: contentType,
        },
        201
      );
    }
    return c.redirect(withFlash("/admin/documents", "created"));
  } catch {
    // DB INSERT 失敗時(存在しない agenda_item_id 等)は R2 に残った孤立オブジェクトを掃除する。
    await c.env.BUCKET.delete(r2Key);
    return fail("保存に失敗しました(議題の指定を確認してください)", 400);
  }
});
