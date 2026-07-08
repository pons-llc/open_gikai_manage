import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { str, type ParsedForm } from "../../lib/forms";
import { getFlash, withFlash, type FlashKind } from "../../lib/flash";
import { sessionSchema } from "../../validators/sessions";
import { Layout } from "../../views/layout";
import {
  SessionsPage,
  emptySessionForm,
  type SessionFormValues,
  type SessionRow,
} from "../../views/admin/sessions";

export const sessionsRoute = new Hono<AppEnv>();

const listSessions = (DB: D1Database) =>
  DB.prepare(`SELECT id, name, start_date, end_date FROM regular_sessions ORDER BY start_date DESC, id DESC`)
    .all<SessionRow>()
    .then((r) => r.results);

const readForm = (form: ParsedForm): SessionFormValues => ({
  name: str(form, "name"),
  start_date: str(form, "start_date"),
  end_date: str(form, "end_date"),
});

const render = async (
  c: Context<AppEnv>,
  form: SessionFormValues,
  errors: string[],
  editingId: number | null,
  status: 200 | 400 = 200,
  flash?: FlashKind
) => {
  const rows = await listSessions(c.env.DB);
  return c.html(
    <Layout title="定例会管理" variant="admin" adminEmail={c.get("adminEmail")} flash={flash}>
      <SessionsPage rows={rows} form={form} errors={errors} editingId={editingId} />
    </Layout>,
    status
  );
};

sessionsRoute.get("/", async (c) => render(c, emptySessionForm, [], null, 200, getFlash(c)));

sessionsRoute.get("/:id/edit", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(`SELECT id, name, start_date, end_date FROM regular_sessions WHERE id = ?`)
    .bind(id)
    .first<SessionRow>();
  if (!row) return c.notFound();
  return render(c, { name: row.name, start_date: row.start_date, end_date: row.end_date }, [], id);
});

sessionsRoute.post("/", async (c) => {
  const form = readForm(await c.req.parseBody());
  const parsed = sessionSchema.safeParse(form);
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), null, 400);
  }
  const result = await c.env.DB.prepare(`INSERT INTO regular_sessions (name, start_date, end_date) VALUES (?, ?, ?)`)
    .bind(parsed.data.name, parsed.data.start_date, parsed.data.end_date)
    .run();
  logAdminMutation(c, "regular_sessions", result.meta.last_row_id ?? null, "create");
  return c.redirect(withFlash("/admin/sessions", "created"));
});

sessionsRoute.post("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const form = readForm(await c.req.parseBody());
  const parsed = sessionSchema.safeParse(form);
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), id, 400);
  }
  const result = await c.env.DB.prepare(
    `UPDATE regular_sessions SET name = ?, start_date = ?, end_date = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(parsed.data.name, parsed.data.start_date, parsed.data.end_date, id)
    .run();
  if (result.meta.changes === 0) return c.notFound();
  logAdminMutation(c, "regular_sessions", id, "update");
  return c.redirect(withFlash("/admin/sessions", "updated"));
});

sessionsRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    await c.env.DB.prepare(`DELETE FROM regular_sessions WHERE id = ?`).bind(id).run();
  } catch {
    return render(c, emptySessionForm, ["使用中のため削除できません(日程などで参照されています)"], null, 400);
  }
  logAdminMutation(c, "regular_sessions", id, "delete");
  return c.redirect(withFlash("/admin/sessions", "deleted"));
});
