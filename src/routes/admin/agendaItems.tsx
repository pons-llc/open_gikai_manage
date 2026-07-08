import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { formFromQuery, str, type ParsedForm } from "../../lib/forms";
import { getFlash, withFlash, type FlashKind } from "../../lib/flash";
import { agendaItemSchema } from "../../validators/agendaItems";
import { datetimeLocalToDb, dbToDatetimeLocal } from "../../validators/announcements";
import { Layout } from "../../views/layout";
import {
  AgendaItemsPage,
  emptyAgendaItemForm,
  type AgendaItemFormValues,
  type AgendaItemRow,
} from "../../views/admin/agendaItems";
import type { SelectOption } from "../../views/admin/committeeMemberships";

export const agendaItemsRoute = new Hono<AppEnv>();

const listAgendaItems = (DB: D1Database) =>
  DB.prepare(
    `SELECT id, title, fiscal_year, number, category, published_at, (published_at > datetime('now')) AS is_reserved
     FROM agenda_items
     ORDER BY fiscal_year DESC, category ASC, number DESC`
  )
    .all<AgendaItemRow>()
    .then((r) => r.results);

const listAgendaTypeOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, name FROM agenda_types ORDER BY display_order ASC, id ASC`)
    .all<SelectOption>()
    .then((r) => r.results);

const listCommitteeOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, name FROM committees ORDER BY display_order ASC, id ASC`)
    .all<SelectOption>()
    .then((r) => r.results);

const readForm = (form: ParsedForm): AgendaItemFormValues => ({
  title: str(form, "title"),
  fiscal_year: str(form, "fiscal_year") || String(new Date().getFullYear()),
  number: str(form, "number"),
  category: str(form, "category") || "bill",
  agenda_type_id: str(form, "agenda_type_id"),
  committee_id: str(form, "committee_id"),
  published_at_local: str(form, "published_at_local"),
});

const toSchemaInput = (form: AgendaItemFormValues) => ({
  title: form.title,
  fiscal_year: Number(form.fiscal_year) || 0,
  number: Number(form.number) || 0,
  category: form.category,
  // 種類に応じて無関係な選択は強制的に null にする(§3.2 の CHECK 制約と同じ規則をアプリ層でも担保)。
  agenda_type_id: form.category === "bill" ? Number(form.agenda_type_id) || null : null,
  committee_id: form.category === "committee" ? Number(form.committee_id) || null : null,
  published_at: datetimeLocalToDb(form.published_at_local),
});

const render = async (
  c: Context<AppEnv>,
  form: AgendaItemFormValues,
  errors: string[],
  editingId: number | null,
  status: 200 | 400 = 200,
  flash?: FlashKind
) => {
  const [rows, agendaTypes, committees] = await Promise.all([
    listAgendaItems(c.env.DB),
    listAgendaTypeOptions(c.env.DB),
    listCommitteeOptions(c.env.DB),
  ]);
  return c.html(
    <Layout title="議題管理" variant="admin" adminEmail={c.get("adminEmail")} flash={flash}>
      <AgendaItemsPage
        rows={rows}
        agendaTypes={agendaTypes}
        committees={committees}
        form={form}
        errors={errors}
        editingId={editingId}
      />
    </Layout>,
    status
  );
};

/** P1-2: 同年度の議題を続けて登録する場合に年度・種類を引き継ぐ。 */
agendaItemsRoute.get("/", async (c) => {
  const form = formFromQuery(emptyAgendaItemForm, c.req.query(), ["fiscal_year", "category"]);
  return render(c, form, [], null, 200, getFlash(c));
});

agendaItemsRoute.get("/:id/edit", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(
    `SELECT id, title, fiscal_year, number, category, agenda_type_id, committee_id, published_at
     FROM agenda_items WHERE id = ?`
  )
    .bind(id)
    .first<{
      id: number;
      title: string;
      fiscal_year: number;
      number: number;
      category: string;
      agenda_type_id: number | null;
      committee_id: number | null;
      published_at: string;
    }>();
  if (!row) return c.notFound();
  return render(
    c,
    {
      title: row.title,
      fiscal_year: String(row.fiscal_year),
      number: String(row.number),
      category: row.category,
      agenda_type_id: row.agenda_type_id ? String(row.agenda_type_id) : "",
      committee_id: row.committee_id ? String(row.committee_id) : "",
      published_at_local: dbToDatetimeLocal(row.published_at),
    },
    [],
    id
  );
});

agendaItemsRoute.post("/", async (c) => {
  const rawForm = await c.req.parseBody();
  const form = readForm(rawForm);
  const parsed = agendaItemSchema.safeParse(toSchemaInput(form));
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), null, 400);
  }
  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO agenda_items (title, fiscal_year, number, category, agenda_type_id, committee_id, published_at)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), datetime('now')))`
    )
      .bind(
        parsed.data.title,
        parsed.data.fiscal_year,
        parsed.data.number,
        parsed.data.category,
        parsed.data.agenda_type_id,
        parsed.data.committee_id,
        parsed.data.published_at
      )
      .run();
    logAdminMutation(c, "agenda_items", result.meta.last_row_id ?? null, "create");
  } catch {
    return render(c, form, ["この年度・種類の番号は既に使用されています"], null, 400);
  }
  if (str(rawForm, "save_mode") === "continue") {
    return c.redirect(
      withFlash("/admin/agenda-items", "created", {
        fiscal_year: String(parsed.data.fiscal_year),
        category: parsed.data.category,
      })
    );
  }
  return c.redirect(withFlash("/admin/agenda-items", "created"));
});

agendaItemsRoute.post("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const form = readForm(await c.req.parseBody());
  const parsed = agendaItemSchema.safeParse(toSchemaInput(form));
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), id, 400);
  }
  try {
    const result = await c.env.DB.prepare(
      `UPDATE agenda_items SET title = ?, fiscal_year = ?, number = ?, category = ?, agenda_type_id = ?,
         committee_id = ?, published_at = COALESCE(NULLIF(?, ''), datetime('now')), updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        parsed.data.title,
        parsed.data.fiscal_year,
        parsed.data.number,
        parsed.data.category,
        parsed.data.agenda_type_id,
        parsed.data.committee_id,
        parsed.data.published_at,
        id
      )
      .run();
    if (result.meta.changes === 0) return c.notFound();
    logAdminMutation(c, "agenda_items", id, "update");
  } catch {
    return render(c, form, ["この年度・種類の番号は既に使用されています"], id, 400);
  }
  return c.redirect(withFlash("/admin/agenda-items", "updated"));
});

agendaItemsRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare(`DELETE FROM agenda_items WHERE id = ?`).bind(id).run();
  logAdminMutation(c, "agenda_items", id, "delete");
  return c.redirect(withFlash("/admin/agenda-items", "deleted"));
});
