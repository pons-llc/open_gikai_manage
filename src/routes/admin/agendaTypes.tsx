import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { str, type ParsedForm } from "../../lib/forms";
import { getFlash, withFlash, type FlashKind } from "../../lib/flash";
import { ADMIN_PAGE_SIZE, buildPageHref, paginationOffset, parsePage, totalPages as computeTotalPages } from "../../lib/pagination";
import { agendaTypeSchema } from "../../validators/agendaTypes";
import { Layout } from "../../views/layout";
import {
  AgendaTypesPage,
  emptyAgendaTypeForm,
  type AgendaTypeFormValues,
  type AgendaTypeRow,
} from "../../views/admin/agendaTypes";

export const agendaTypesRoute = new Hono<AppEnv>();

const listAgendaTypes = (DB: D1Database, page: number) =>
  DB.prepare(`SELECT id, name, display_order FROM agenda_types ORDER BY display_order ASC, id ASC LIMIT ? OFFSET ?`)
    .bind(ADMIN_PAGE_SIZE, paginationOffset(page))
    .all<AgendaTypeRow>()
    .then((r) => r.results);

const countAgendaTypes = (DB: D1Database) =>
  DB.prepare(`SELECT COUNT(*) AS n FROM agenda_types`)
    .first<{ n: number }>()
    .then((r) => r?.n ?? 0);

const readForm = (form: ParsedForm): AgendaTypeFormValues => ({
  name: str(form, "name"),
  display_order: str(form, "display_order") || "0",
});

const render = async (
  c: Context<AppEnv>,
  form: AgendaTypeFormValues,
  errors: string[],
  editingId: number | null,
  status: 200 | 400 = 200,
  flash?: FlashKind,
  page: number = 1
) => {
  const [rows, count] = await Promise.all([listAgendaTypes(c.env.DB, page), countAgendaTypes(c.env.DB)]);
  return c.html(
    <Layout title="議案種別管理" variant="admin" adminEmail={c.get("adminEmail")} flash={flash}>
      <AgendaTypesPage
        rows={rows}
        form={form}
        errors={errors}
        editingId={editingId}
        page={page}
        totalPages={computeTotalPages(count)}
        buildHref={(p) => buildPageHref("/admin/agenda-types", c.req.query(), p)}
      />
    </Layout>,
    status
  );
};

agendaTypesRoute.get("/", async (c) =>
  render(c, emptyAgendaTypeForm, [], null, 200, getFlash(c), parsePage(c.req.query("page")))
);

agendaTypesRoute.get("/:id/edit", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(`SELECT id, name, display_order FROM agenda_types WHERE id = ?`)
    .bind(id)
    .first<AgendaTypeRow>();
  if (!row) return c.notFound();
  return render(c, { name: row.name, display_order: String(row.display_order) }, [], id);
});

agendaTypesRoute.post("/", async (c) => {
  const form = readForm(await c.req.parseBody());
  const parsed = agendaTypeSchema.safeParse({ name: form.name, display_order: Number(form.display_order) || 0 });
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), null, 400);
  }
  try {
    const result = await c.env.DB.prepare(`INSERT INTO agenda_types (name, display_order) VALUES (?, ?)`)
      .bind(parsed.data.name, parsed.data.display_order)
      .run();
    logAdminMutation(c, "agenda_types", result.meta.last_row_id ?? null, "create");
  } catch {
    return render(c, form, ["同じ名称の議案種別が既に存在します"], null, 400);
  }
  return c.redirect(withFlash("/admin/agenda-types", "created"));
});

agendaTypesRoute.post("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const form = readForm(await c.req.parseBody());
  const parsed = agendaTypeSchema.safeParse({ name: form.name, display_order: Number(form.display_order) || 0 });
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), id, 400);
  }
  try {
    const result = await c.env.DB.prepare(`UPDATE agenda_types SET name = ?, display_order = ? WHERE id = ?`)
      .bind(parsed.data.name, parsed.data.display_order, id)
      .run();
    if (result.meta.changes === 0) return c.notFound();
    logAdminMutation(c, "agenda_types", id, "update");
  } catch {
    return render(c, form, ["同じ名称の議案種別が既に存在します"], id, 400);
  }
  return c.redirect(withFlash("/admin/agenda-types", "updated"));
});

agendaTypesRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    await c.env.DB.prepare(`DELETE FROM agenda_types WHERE id = ?`).bind(id).run();
  } catch {
    return render(c, emptyAgendaTypeForm, ["使用中のため削除できません(議題で参照されています)"], null, 400);
  }
  logAdminMutation(c, "agenda_types", id, "delete");
  return c.redirect(withFlash("/admin/agenda-types", "deleted"));
});
