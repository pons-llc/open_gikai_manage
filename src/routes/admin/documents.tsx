import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { getStorageUsageBytes } from "../../lib/storage";
import { getFlash, withFlash } from "../../lib/flash";
import { Layout } from "../../views/layout";
import { DocumentsPage, type DocumentRow } from "../../views/admin/documents";
import type { SelectOption } from "../../views/admin/committeeMemberships";

export const documentsRoute = new Hono<AppEnv>();

const listDocuments = (DB: D1Database) =>
  DB.prepare(
    `SELECT d.id, d.file_name, d.file_size, d.extension, a.title AS agenda_item_title, d.created_at
     FROM documents d
     LEFT JOIN agenda_items a ON a.id = d.agenda_item_id
     ORDER BY d.created_at DESC, d.id DESC`
  )
    .all<DocumentRow>()
    .then((r) => r.results);

const listAgendaItemOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, title AS name FROM agenda_items ORDER BY fiscal_year DESC, number DESC`)
    .all<SelectOption>()
    .then((r) => r.results);

documentsRoute.get("/", async (c) => {
  const [rows, agendaItems, usedBytes] = await Promise.all([
    listDocuments(c.env.DB),
    listAgendaItemOptions(c.env.DB),
    getStorageUsageBytes(c.env.DB),
  ]);
  return c.html(
    <Layout title="資料管理" variant="admin" adminEmail={c.get("adminEmail")} flash={getFlash(c)}>
      <DocumentsPage
        rows={rows}
        agendaItems={agendaItems}
        errors={[]}
        usedBytes={usedBytes}
        quotaBytes={Number(c.env.STORAGE_QUOTA_BYTES)}
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
