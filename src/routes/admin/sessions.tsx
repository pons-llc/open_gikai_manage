import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { str, type ParsedForm } from "../../lib/forms";
import { getFlash, withFlash, type FlashKind } from "../../lib/flash";
import { ADMIN_PAGE_SIZE, buildPageHref, paginationOffset, parsePage, totalPages as computeTotalPages } from "../../lib/pagination";
import { sessionSchema } from "../../validators/sessions";
import { Layout } from "../../views/layout";
import {
  SessionsPage,
  emptySessionForm,
  type SessionFormValues,
  type SessionRow,
} from "../../views/admin/sessions";
import { SessionHubPage, type SessionHubMeetingRow } from "../../views/admin/sessionHub";

export const sessionsRoute = new Hono<AppEnv>();

const listSessions = (DB: D1Database, page: number) =>
  DB.prepare(
    `SELECT id, name, start_date, end_date FROM regular_sessions ORDER BY start_date DESC, id DESC LIMIT ? OFFSET ?`
  )
    .bind(ADMIN_PAGE_SIZE, paginationOffset(page))
    .all<SessionRow>()
    .then((r) => r.results);

const countSessions = (DB: D1Database) =>
  DB.prepare(`SELECT COUNT(*) AS n FROM regular_sessions`)
    .first<{ n: number }>()
    .then((r) => r?.n ?? 0);

const loadSession = (DB: D1Database, id: number) =>
  DB.prepare(`SELECT id, name, start_date, end_date FROM regular_sessions WHERE id = ?`).bind(id).first<SessionRow>();

const listSessionMeetings = (DB: D1Database, regularSessionId: number) =>
  DB.prepare(
    `SELECT m.id, m.meeting_type, c.name AS committee_name, m.date, m.start_type, m.start_time
     FROM meetings m
     LEFT JOIN committees c ON c.id = m.committee_id
     WHERE m.regular_session_id = ?
     ORDER BY m.date ASC, m.id ASC`
  )
    .bind(regularSessionId)
    .all<SessionHubMeetingRow>()
    .then((r) => r.results);

/** P2-3: 定例会詳細ハブ。会期情報フォーム + この定例会に紐づく日程の一覧。 */
const renderSessionHub = async (
  c: Context<AppEnv>,
  sessionId: number,
  options: { errors?: string[]; status?: 200 | 400; flash?: FlashKind } = {}
) => {
  const session = await loadSession(c.env.DB, sessionId);
  if (!session) return c.notFound();
  const meetings = await listSessionMeetings(c.env.DB, sessionId);
  return c.html(
    <Layout title={`定例会: ${session.name}`} variant="admin" adminEmail={c.get("adminEmail")} flash={options.flash}>
      <SessionHubPage
        session={session}
        form={{ name: session.name, start_date: session.start_date, end_date: session.end_date }}
        errors={options.errors ?? []}
        meetings={meetings}
      />
    </Layout>,
    options.status ?? 200
  );
};

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
  flash?: FlashKind,
  page: number = 1
) => {
  const [rows, count] = await Promise.all([listSessions(c.env.DB, page), countSessions(c.env.DB)]);
  return c.html(
    <Layout title="定例会管理" variant="admin" adminEmail={c.get("adminEmail")} flash={flash}>
      <SessionsPage
        rows={rows}
        form={form}
        errors={errors}
        editingId={editingId}
        page={page}
        totalPages={computeTotalPages(count)}
        buildHref={(p) => buildPageHref("/admin/sessions", c.req.query(), p)}
      />
    </Layout>,
    status
  );
};

sessionsRoute.get("/", async (c) =>
  render(c, emptySessionForm, [], null, 200, getFlash(c), parsePage(c.req.query("page")))
);

sessionsRoute.get("/:id/edit", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(`SELECT id, name, start_date, end_date FROM regular_sessions WHERE id = ?`)
    .bind(id)
    .first<SessionRow>();
  if (!row) return c.notFound();
  return render(c, { name: row.name, start_date: row.start_date, end_date: row.end_date }, [], id);
});

/** P2-3: 定例会詳細ハブ。定例会一覧の「編集」リンクはここへ変更する。 */
sessionsRoute.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  return renderSessionHub(c, id, { flash: getFlash(c) });
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
  return c.redirect(withFlash(`/admin/sessions/${id}`, "updated"));
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
