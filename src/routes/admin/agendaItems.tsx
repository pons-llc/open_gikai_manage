import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { formFromQuery, str, type ParsedForm } from "../../lib/forms";
import { getFlash, withFlash, type FlashKind } from "../../lib/flash";
import { ADMIN_PAGE_SIZE, buildPageHref, paginationOffset, parsePage, totalPages as computeTotalPages } from "../../lib/pagination";
import { createAgendaItem } from "../../lib/agendaItems";
import { agendaItemSchema, AGENDA_ITEM_SORTS, isAgendaItemSort, type AgendaItemSort } from "../../validators/agendaItems";
import { datetimeLocalToDb, dbToDatetimeLocal } from "../../validators/announcements";
import { Layout } from "../../views/layout";
import {
  AgendaItemFormPage,
  AgendaItemsListPage,
  emptyAgendaItemForm,
  type AgendaItemFormValues,
  type AgendaItemRow,
} from "../../views/admin/agendaItems";
import type { SelectOption } from "../../views/admin/committeeMemberships";

export const agendaItemsRoute = new Hono<AppEnv>();

/** P1-4: 年度・種類での絞り込み(GET フォーム、JS 不要)。公開側 §6.2 と同じパターン。 */
const buildAgendaItemConditions = (year: string, category: string): { where: string; binds: (string | number)[] } => {
  const conditions: string[] = [];
  const binds: (string | number)[] = [];
  if (year !== "") {
    conditions.push("fiscal_year = ?");
    binds.push(Number(year));
  }
  if (category !== "") {
    conditions.push("category = ?");
    binds.push(category);
  }
  return { where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "", binds };
};

const listAgendaItems = (DB: D1Database, year: string, category: string, sort: AgendaItemSort, page: number) => {
  const { where, binds } = buildAgendaItemConditions(year, category);
  return DB.prepare(
    `SELECT id, title, fiscal_year, number, category, published_at, (published_at > datetime('now')) AS is_reserved
     FROM agenda_items ${where}
     ORDER BY ${AGENDA_ITEM_SORTS[sort]}
     LIMIT ? OFFSET ?`
  )
    .bind(...binds, ADMIN_PAGE_SIZE, paginationOffset(page))
    .all<AgendaItemRow>()
    .then((r) => r.results);
};

const countAgendaItems = (DB: D1Database, year: string, category: string) => {
  const { where, binds } = buildAgendaItemConditions(year, category);
  return DB.prepare(`SELECT COUNT(*) AS n FROM agenda_items ${where}`)
    .bind(...binds)
    .first<{ n: number }>()
    .then((r) => r?.n ?? 0);
};

const listAgendaItemDocuments = (DB: D1Database, agendaItemId: number) =>
  DB.prepare(`SELECT id, file_name, file_size FROM documents WHERE agenda_item_id = ? ORDER BY created_at DESC`)
    .bind(agendaItemId)
    .all<{ id: number; file_name: string; file_size: number }>()
    .then((r) => r.results);

const listFiscalYears = (DB: D1Database) =>
  DB.prepare(`SELECT DISTINCT fiscal_year FROM agenda_items ORDER BY fiscal_year DESC`)
    .all<{ fiscal_year: number }>()
    .then((r) => r.results.map((row) => row.fiscal_year));

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

/**
 * 一覧が長くスクロールを要すると、編集リンクを押しても反映が画面外で分かりにくいため、
 * 日程管理と同様に一覧(GET /)と登録・編集フォーム(GET /new, GET /:id/edit)を別画面に分離する。
 */
const renderList = async (
  c: Context<AppEnv>,
  flash: FlashKind | undefined,
  filter: { year: string; category: string; sort: AgendaItemSort },
  page: number
) => {
  const [rows, years, count] = await Promise.all([
    listAgendaItems(c.env.DB, filter.year, filter.category, filter.sort, page),
    listFiscalYears(c.env.DB),
    countAgendaItems(c.env.DB, filter.year, filter.category),
  ]);
  return c.html(
    <Layout title="議題管理" variant="admin" adminEmail={c.get("adminEmail")} flash={flash}>
      <AgendaItemsListPage
        rows={rows}
        years={years}
        filter={filter}
        page={page}
        totalPages={computeTotalPages(count)}
        buildHref={(p) => buildPageHref("/admin/agenda-items", c.req.query(), p)}
      />
    </Layout>
  );
};

const renderForm = async (
  c: Context<AppEnv>,
  form: AgendaItemFormValues,
  errors: string[],
  editingId: number | null,
  status: 200 | 400 = 200
) => {
  const [agendaTypes, committees, documents] = await Promise.all([
    listAgendaTypeOptions(c.env.DB),
    listCommitteeOptions(c.env.DB),
    editingId ? listAgendaItemDocuments(c.env.DB, editingId) : Promise.resolve([]),
  ]);
  return c.html(
    <Layout title={editingId ? "議題を編集" : "議題を登録"} variant="admin" adminEmail={c.get("adminEmail")}>
      <AgendaItemFormPage
        agendaTypes={agendaTypes}
        committees={committees}
        form={form}
        errors={errors}
        editingId={editingId}
        documents={documents}
      />
    </Layout>,
    status
  );
};

/** P1-4: 一覧の絞り込み・並べ替え(GET フォーム、JS 不要)。 */
agendaItemsRoute.get("/", async (c) => {
  const year = c.req.query("fiscal_year") ?? "";
  const category = c.req.query("category") ?? "";
  const sortRaw = c.req.query("sort") ?? "";
  const sort = isAgendaItemSort(sortRaw) ? sortRaw : "fiscal_year_desc";
  return renderList(c, getFlash(c), { year, category, sort }, parsePage(c.req.query("page")));
});

/** P1-2: 同年度の議題を続けて登録する場合に年度・種類を引き継ぐ。 */
agendaItemsRoute.get("/new", async (c) => {
  const form = formFromQuery(emptyAgendaItemForm, c.req.query(), ["fiscal_year", "category"]);
  return renderForm(c, form, [], null);
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
  return renderForm(
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
  const result = await createAgendaItem(c, toSchemaInput(form));
  if (!result.ok) {
    return renderForm(c, form, result.errors, null, 400);
  }
  if (str(rawForm, "save_mode") === "continue") {
    return c.redirect(
      withFlash("/admin/agenda-items/new", "created", {
        fiscal_year: String(result.fiscal_year),
        category: result.category,
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
    return renderForm(c, form, parsed.error.issues.map((i) => i.message), id, 400);
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
    return renderForm(c, form, ["この年度・種類の番号は既に使用されています"], id, 400);
  }
  return c.redirect(withFlash("/admin/agenda-items", "updated"));
});

agendaItemsRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare(`DELETE FROM agenda_items WHERE id = ?`).bind(id).run();
  logAdminMutation(c, "agenda_items", id, "delete");
  return c.redirect(withFlash("/admin/agenda-items", "deleted"));
});
