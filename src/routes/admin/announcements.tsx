import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { str, type ParsedForm } from "../../lib/forms";
import { announcementSchema, datetimeLocalToDb, dbToDatetimeLocal } from "../../validators/announcements";
import { Layout } from "../../views/layout";
import {
  AnnouncementsPage,
  emptyAnnouncementForm,
  type AnnouncementFormValues,
  type AnnouncementRow,
} from "../../views/admin/announcements";

export const announcementsRoute = new Hono<AppEnv>();

const listAnnouncements = (DB: D1Database) =>
  DB.prepare(
    `SELECT id, subject, published_at, (published_at > datetime('now')) AS is_reserved
     FROM announcements ORDER BY published_at DESC, id DESC`
  )
    .all<AnnouncementRow>()
    .then((r) => r.results);

const readForm = (form: ParsedForm): AnnouncementFormValues => ({
  subject: str(form, "subject"),
  body: str(form, "body"),
  related_url: str(form, "related_url"),
  published_at_local: str(form, "published_at_local"),
});

const render = async (
  c: Context<AppEnv>,
  form: AnnouncementFormValues,
  errors: string[],
  editingId: number | null,
  status: 200 | 400 = 200
) => {
  const rows = await listAnnouncements(c.env.DB);
  return c.html(
    <Layout title="お知らせ管理" variant="admin" adminEmail={c.get("adminEmail")}>
      <AnnouncementsPage rows={rows} form={form} errors={errors} editingId={editingId} />
    </Layout>,
    status
  );
};

announcementsRoute.get("/", async (c) => render(c, emptyAnnouncementForm, [], null));

announcementsRoute.get("/:id/edit", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(
    `SELECT id, subject, body, related_url, published_at FROM announcements WHERE id = ?`
  )
    .bind(id)
    .first<{ id: number; subject: string; body: string; related_url: string | null; published_at: string }>();
  if (!row) return c.notFound();
  return render(
    c,
    {
      subject: row.subject,
      body: row.body,
      related_url: row.related_url ?? "",
      published_at_local: dbToDatetimeLocal(row.published_at),
    },
    [],
    id
  );
});

announcementsRoute.post("/", async (c) => {
  const form = readForm(await c.req.parseBody());
  const parsed = announcementSchema.safeParse({
    subject: form.subject,
    body: form.body,
    related_url: form.related_url,
    published_at: datetimeLocalToDb(form.published_at_local),
  });
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), null, 400);
  }
  const result = await c.env.DB.prepare(
    `INSERT INTO announcements (subject, body, related_url, published_at) VALUES (?, ?, ?, COALESCE(NULLIF(?, ''), datetime('now')))`
  )
    .bind(parsed.data.subject, parsed.data.body, parsed.data.related_url, parsed.data.published_at)
    .run();
  logAdminMutation(c, "announcements", result.meta.last_row_id ?? null, "create");
  return c.redirect("/admin/announcements");
});

announcementsRoute.post("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const form = readForm(await c.req.parseBody());
  const parsed = announcementSchema.safeParse({
    subject: form.subject,
    body: form.body,
    related_url: form.related_url,
    published_at: datetimeLocalToDb(form.published_at_local),
  });
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), id, 400);
  }
  const result = await c.env.DB.prepare(
    `UPDATE announcements SET subject = ?, body = ?, related_url = ?,
       published_at = COALESCE(NULLIF(?, ''), datetime('now')), updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(parsed.data.subject, parsed.data.body, parsed.data.related_url, parsed.data.published_at, id)
    .run();
  if (result.meta.changes === 0) return c.notFound();
  logAdminMutation(c, "announcements", id, "update");
  return c.redirect("/admin/announcements");
});

announcementsRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare(`DELETE FROM announcements WHERE id = ?`).bind(id).run();
  logAdminMutation(c, "announcements", id, "delete");
  return c.redirect("/admin/announcements");
});
