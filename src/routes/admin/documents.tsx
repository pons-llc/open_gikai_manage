import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { getStorageUsageBytes } from "../../lib/storage";
import { getFlash, withFlash } from "../../lib/flash";
import { ADMIN_PAGE_SIZE, buildPageHref, paginationOffset, parsePage, totalPages as computeTotalPages } from "../../lib/pagination";
import { containsPattern } from "../../lib/db";
import { Layout } from "../../views/layout";
import { DocumentsPage, type DocumentRow } from "../../views/admin/documents";
import type { SelectOption } from "../../views/admin/committeeMemberships";

export const documentsRoute = new Hono<AppEnv>();

/** P1-4: ファイル名部分一致(公開側と同じエスケープ関数を共用)+「議題未紐付けのみ」。 */
const buildDocumentConditions = (q: string, unlinkedOnly: boolean): { where: string; binds: (string | number)[] } => {
  const conditions: string[] = [];
  const binds: (string | number)[] = [];
  if (q !== "") {
    conditions.push("d.file_name LIKE ? ESCAPE '\\'");
    binds.push(containsPattern(q));
  }
  if (unlinkedOnly) {
    conditions.push("d.agenda_item_id IS NULL");
  }
  return { where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "", binds };
};

const listDocuments = (DB: D1Database, q: string, unlinkedOnly: boolean, page: number) => {
  const { where, binds } = buildDocumentConditions(q, unlinkedOnly);
  return DB.prepare(
    `SELECT d.id, d.file_name, d.file_size, d.extension, a.title AS agenda_item_title, d.created_at
     FROM documents d
     LEFT JOIN agenda_items a ON a.id = d.agenda_item_id
     ${where}
     ORDER BY d.created_at DESC, d.id DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...binds, ADMIN_PAGE_SIZE, paginationOffset(page))
    .all<DocumentRow>()
    .then((r) => r.results);
};

const countDocuments = (DB: D1Database, q: string, unlinkedOnly: boolean) => {
  const { where, binds } = buildDocumentConditions(q, unlinkedOnly);
  return DB.prepare(`SELECT COUNT(*) AS n FROM documents d ${where}`)
    .bind(...binds)
    .first<{ n: number }>()
    .then((r) => r?.n ?? 0);
};

const listAgendaItemOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, title AS name FROM agenda_items ORDER BY fiscal_year DESC, number DESC`)
    .all<SelectOption>()
    .then((r) => r.results);

documentsRoute.get("/", async (c) => {
  const q = c.req.query("q") ?? "";
  const unlinkedOnly = c.req.query("unlinked") === "on";
  const page = parsePage(c.req.query("page"));
  const [rows, agendaItems, usedBytes, count] = await Promise.all([
    listDocuments(c.env.DB, q, unlinkedOnly, page),
    listAgendaItemOptions(c.env.DB),
    getStorageUsageBytes(c.env.DB),
    countDocuments(c.env.DB, q, unlinkedOnly),
  ]);
  return c.html(
    <Layout title="資料管理" variant="admin" adminEmail={c.get("adminEmail")} flash={getFlash(c)}>
      <DocumentsPage
        rows={rows}
        agendaItems={agendaItems}
        errors={[]}
        usedBytes={usedBytes}
        quotaBytes={Number(c.env.STORAGE_QUOTA_BYTES)}
        filter={{ q, unlinkedOnly }}
        page={page}
        totalPages={computeTotalPages(count)}
        buildHref={(p) => buildPageHref("/admin/documents", c.req.query(), p)}
      />
    </Layout>
  );
});

documentsRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(`SELECT r2_key FROM documents WHERE id = ?`).bind(id).first<{
    r2_key: string;
  }>();
  if (!row) return c.notFound();
  await c.env.BUCKET.delete(row.r2_key);
  await c.env.DB.prepare(`DELETE FROM documents WHERE id = ?`).bind(id).run();
  logAdminMutation(c, "documents", id, "delete");
  return c.redirect(withFlash("/admin/documents", "deleted"));
});
