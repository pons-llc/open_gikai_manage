import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { checkboxOn, str, type ParsedForm } from "../../lib/forms";
import { getFlash, withFlash, type FlashKind } from "../../lib/flash";
import { ADMIN_PAGE_SIZE, buildPageHref, paginationOffset, parsePage, totalPages as computeTotalPages } from "../../lib/pagination";
import { factionSchema } from "../../validators/factions";
import { Layout } from "../../views/layout";
import {
  FactionsPage,
  emptyFactionForm,
  type FactionFormValues,
  type FactionRow,
} from "../../views/admin/factions";

export const factionsRoute = new Hono<AppEnv>();

const listFactions = (DB: D1Database, page: number) =>
  DB.prepare(
    `SELECT id, name, established_on, is_active FROM factions ORDER BY established_on ASC, id ASC LIMIT ? OFFSET ?`
  )
    .bind(ADMIN_PAGE_SIZE, paginationOffset(page))
    .all<FactionRow>()
    .then((r) => r.results);

const countFactions = (DB: D1Database) =>
  DB.prepare(`SELECT COUNT(*) AS n FROM factions`)
    .first<{ n: number }>()
    .then((r) => r?.n ?? 0);

const readForm = (form: ParsedForm): FactionFormValues => ({
  name: str(form, "name"),
  established_on: str(form, "established_on"),
  is_active: checkboxOn(form, "is_active"),
});

const render = async (
  c: Context<AppEnv>,
  form: FactionFormValues,
  errors: string[],
  editingId: number | null,
  status: 200 | 400 = 200,
  flash?: FlashKind,
  page: number = 1
) => {
  const [rows, count] = await Promise.all([listFactions(c.env.DB, page), countFactions(c.env.DB)]);
  return c.html(
    <Layout title="会派管理" variant="admin" adminEmail={c.get("adminEmail")} flash={flash}>
      <FactionsPage
        rows={rows}
        form={form}
        errors={errors}
        editingId={editingId}
        page={page}
        totalPages={computeTotalPages(count)}
        buildHref={(p) => buildPageHref("/admin/factions", c.req.query(), p)}
      />
    </Layout>,
    status
  );
};

factionsRoute.get("/", async (c) => render(c, emptyFactionForm, [], null, 200, getFlash(c), parsePage(c.req.query("page"))));

factionsRoute.get("/:id/edit", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(`SELECT id, name, established_on, is_active FROM factions WHERE id = ?`)
    .bind(id)
    .first<FactionRow>();
  if (!row) return c.notFound();
  return render(c, { name: row.name, established_on: row.established_on, is_active: !!row.is_active }, [], id);
});

factionsRoute.post("/", async (c) => {
  const form = readForm(await c.req.parseBody());
  const parsed = factionSchema.safeParse(form);
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), null, 400);
  }
  const result = await c.env.DB.prepare(`INSERT INTO factions (name, established_on, is_active) VALUES (?, ?, ?)`)
    .bind(parsed.data.name, parsed.data.established_on, parsed.data.is_active ? 1 : 0)
    .run();
  logAdminMutation(c, "factions", result.meta.last_row_id ?? null, "create");
  return c.redirect(withFlash("/admin/factions", "created"));
});

factionsRoute.post("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const form = readForm(await c.req.parseBody());
  const parsed = factionSchema.safeParse(form);
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), id, 400);
  }
  const result = await c.env.DB.prepare(`UPDATE factions SET name = ?, established_on = ?, is_active = ? WHERE id = ?`)
    .bind(parsed.data.name, parsed.data.established_on, parsed.data.is_active ? 1 : 0, id)
    .run();
  if (result.meta.changes === 0) return c.notFound();
  logAdminMutation(c, "factions", id, "update");
  return c.redirect(withFlash("/admin/factions", "updated"));
});

factionsRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    await c.env.DB.prepare(`DELETE FROM factions WHERE id = ?`).bind(id).run();
  } catch {
    return render(c, emptyFactionForm, ["使用中のため削除できません(会派所属で参照されています)"], null, 400);
  }
  logAdminMutation(c, "factions", id, "delete");
  return c.redirect(withFlash("/admin/factions", "deleted"));
});
