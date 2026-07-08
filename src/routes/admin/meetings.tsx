import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { logAdminMutation } from "../../lib/auditLog";
import { wouldCreateCycle } from "../../lib/meetings";
import { formFromQuery, idList, str, type ParsedForm } from "../../lib/forms";
import { getFlash, withFlash } from "../../lib/flash";
import { ADMIN_PAGE_SIZE, buildPageHref, paginationOffset, parsePage, totalPages as computeTotalPages } from "../../lib/pagination";
import { meetingSchema, MEETING_SORTS, isMeetingSort, type MeetingSort } from "../../validators/meetings";
import { Layout } from "../../views/layout";
import {
  MeetingFormPage,
  MeetingsListPage,
  emptyMeetingForm,
  type AgendaItemOption,
  type DocumentOption,
  type MeetingFormValues,
  type MeetingRow,
  type PreviousMeetingOption,
} from "../../views/admin/meetings";
import type { SelectOption } from "../../views/admin/committeeMemberships";

export const meetingsRoute = new Hono<AppEnv>();

/** P1-4: 年月・定例会での絞り込み(GET フォーム、JS 不要)。並べ替えは MEETING_SORTS のホワイトリストのみ。 */
const buildMeetingConditions = (
  month: string,
  regularSessionId: string
): { where: string; binds: (string | number)[] } => {
  const conditions: string[] = [];
  const binds: (string | number)[] = [];
  if (month !== "") {
    conditions.push("substr(m.date, 1, 7) = ?");
    binds.push(month);
  }
  if (regularSessionId !== "") {
    conditions.push("m.regular_session_id = ?");
    binds.push(Number(regularSessionId));
  }
  return { where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "", binds };
};

const listMeetings = (DB: D1Database, month: string, regularSessionId: string, sort: MeetingSort, page: number) => {
  const { where, binds } = buildMeetingConditions(month, regularSessionId);
  return DB.prepare(
    `SELECT m.id, m.meeting_type, c.name AS committee_name, m.date, m.start_type, m.start_time,
            rs.name AS regular_session_name,
            (SELECT COUNT(*) FROM meeting_agenda_items mai WHERE mai.meeting_id = m.id) AS agenda_item_count
     FROM meetings m
     LEFT JOIN committees c ON c.id = m.committee_id
     LEFT JOIN regular_sessions rs ON rs.id = m.regular_session_id
     ${where}
     ORDER BY ${MEETING_SORTS[sort]}
     LIMIT ? OFFSET ?`
  )
    .bind(...binds, ADMIN_PAGE_SIZE, paginationOffset(page))
    .all<MeetingRow>()
    .then((r) => r.results);
};

const countMeetings = (DB: D1Database, month: string, regularSessionId: string) => {
  const { where, binds } = buildMeetingConditions(month, regularSessionId);
  return DB.prepare(`SELECT COUNT(*) AS n FROM meetings m ${where}`)
    .bind(...binds)
    .first<{ n: number }>()
    .then((r) => r?.n ?? 0);
};

const listMeetingMonths = (DB: D1Database) =>
  DB.prepare(`SELECT DISTINCT substr(date, 1, 7) AS month FROM meetings ORDER BY month DESC`)
    .all<{ month: string }>()
    .then((r) => r.results.map((row) => row.month));

const listCommitteeOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, name FROM committees WHERE is_active = 1 ORDER BY display_order ASC, id ASC`)
    .all<SelectOption>()
    .then((r) => r.results);

const listRegularSessionOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, name FROM regular_sessions ORDER BY start_date DESC, id DESC`)
    .all<SelectOption>()
    .then((r) => r.results);

const listAgendaItemOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, title, fiscal_year, category FROM agenda_items ORDER BY fiscal_year DESC, number DESC`)
    .all<AgendaItemOption>()
    .then((r) => r.results);

const listDocumentOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, file_name, file_size FROM documents ORDER BY created_at DESC`)
    .all<DocumentOption>()
    .then((r) => r.results);

/** P3-4: 議題クイック作成(種類=議案のときのみ議案種別▾を出す)のための選択肢。 */
const listAgendaTypeOptions = (DB: D1Database) =>
  DB.prepare(`SELECT id, name FROM agenda_types ORDER BY display_order ASC, id ASC`)
    .all<SelectOption>()
    .then((r) => r.results);

const listPreviousMeetingOptions = async (
  DB: D1Database,
  date: string,
  excludeId: number | null
): Promise<PreviousMeetingOption[]> => {
  if (!date) return [];
  const { results } = await DB.prepare(
    `SELECT m.id, m.meeting_type, m.start_type, m.start_time, c.name AS committee_name
     FROM meetings m
     LEFT JOIN committees c ON c.id = m.committee_id
     WHERE m.date = ? AND m.id != ?
     ORDER BY m.id ASC`
  )
    .bind(date, excludeId ?? -1)
    .all<{
      id: number;
      meeting_type: string;
      start_type: string;
      start_time: string | null;
      committee_name: string | null;
    }>();
  return results.map((r) => ({
    id: r.id,
    label: `${r.meeting_type === "committee" ? (r.committee_name ?? "委員会") : "本会議"}(${
      r.start_type === "fixed" ? r.start_time : "前の会議終了後"
    })`,
  }));
};

const readForm = (form: ParsedForm): MeetingFormValues => {
  const agendaItemIds = idList(form, "agenda_item_ids");
  const documentIds = idList(form, "document_ids");
  const agendaItemOrders: Record<number, string> = {};
  for (const id of agendaItemIds) agendaItemOrders[id] = str(form, `agenda_item_order_${id}`) || "0";
  const documentOrders: Record<number, string> = {};
  for (const id of documentIds) documentOrders[id] = str(form, `document_order_${id}`) || "0";

  return {
    meeting_type: str(form, "meeting_type") || "plenary",
    committee_id: str(form, "committee_id"),
    regular_session_id: str(form, "regular_session_id"),
    date: str(form, "date"),
    start_type: str(form, "start_type") || "fixed",
    start_time: str(form, "start_time"),
    previous_meeting_id: str(form, "previous_meeting_id"),
    schedule_text: str(form, "schedule_text"),
    agenda_item_ids: agendaItemIds,
    agenda_item_orders: agendaItemOrders,
    document_ids: documentIds,
    document_orders: documentOrders,
  };
};

const toSchemaInput = (form: MeetingFormValues) => ({
  meeting_type: form.meeting_type,
  committee_id: form.meeting_type === "committee" ? Number(form.committee_id) || null : null,
  regular_session_id: form.regular_session_id ? Number(form.regular_session_id) || null : null,
  date: form.date,
  start_type: form.start_type,
  start_time: form.start_type === "fixed" ? form.start_time || null : null,
  previous_meeting_id: form.start_type === "after_previous" ? Number(form.previous_meeting_id) || null : null,
  schedule_text: form.schedule_text,
});

/** §3.3: previous_meeting_id は同一開催日のみ・自己参照禁止・循環参照禁止。DB の CHECK だけでは表現できない部分をここで検証する。 */
const validatePreviousMeeting = async (
  DB: D1Database,
  meetingId: number | null,
  data: { start_type: string; date: string; previous_meeting_id: number | null }
): Promise<string[]> => {
  if (data.start_type !== "after_previous" || data.previous_meeting_id === null) return [];
  const prev = await DB.prepare(`SELECT date FROM meetings WHERE id = ?`)
    .bind(data.previous_meeting_id)
    .first<{ date: string }>();
  if (!prev) return ["「前の会議」が見つかりません"];
  if (prev.date !== data.date) return ["「前の会議」は同一開催日の会議のみ選択できます"];
  if (await wouldCreateCycle(DB, meetingId, data.previous_meeting_id)) {
    return ["「前の会議」の指定が循環参照になっています"];
  }
  return [];
};

const saveAssociations = async (DB: D1Database, meetingId: number, form: MeetingFormValues) => {
  const statements = [
    DB.prepare(`DELETE FROM meeting_agenda_items WHERE meeting_id = ?`).bind(meetingId),
    DB.prepare(`DELETE FROM meeting_documents WHERE meeting_id = ?`).bind(meetingId),
    ...form.agenda_item_ids.map((id) =>
      DB.prepare(`INSERT INTO meeting_agenda_items (meeting_id, agenda_item_id, display_order) VALUES (?, ?, ?)`).bind(
        meetingId,
        id,
        Number(form.agenda_item_orders[id]) || 0
      )
    ),
    ...form.document_ids.map((id) =>
      DB.prepare(`INSERT INTO meeting_documents (meeting_id, document_id, display_order) VALUES (?, ?, ?)`).bind(
        meetingId,
        id,
        Number(form.document_orders[id]) || 0
      )
    ),
  ];
  await DB.batch(statements);
};

const render = async (
  c: Context<AppEnv>,
  form: MeetingFormValues,
  errors: string[],
  editingId: number | null,
  status: 200 | 400 = 200
) => {
  const [committees, regularSessions, agendaItems, documents, previousMeetingOptions, agendaTypes] = await Promise.all([
    listCommitteeOptions(c.env.DB),
    listRegularSessionOptions(c.env.DB),
    listAgendaItemOptions(c.env.DB),
    listDocumentOptions(c.env.DB),
    listPreviousMeetingOptions(c.env.DB, form.date, editingId),
    listAgendaTypeOptions(c.env.DB),
  ]);
  return c.html(
    <Layout title={editingId ? "日程編集" : "日程登録"} variant="admin" adminEmail={c.get("adminEmail")}>
      <MeetingFormPage
        form={form}
        errors={errors}
        editingId={editingId}
        committees={committees}
        regularSessions={regularSessions}
        previousMeetingOptions={previousMeetingOptions}
        agendaItems={agendaItems}
        documents={documents}
        agendaTypes={agendaTypes}
      />
    </Layout>,
    status
  );
};

meetingsRoute.get("/", async (c) => {
  const month = c.req.query("month") ?? "";
  const regularSessionId = c.req.query("regular_session_id") ?? "";
  const sortRaw = c.req.query("sort") ?? "";
  const sort = isMeetingSort(sortRaw) ? sortRaw : "date_desc";
  const page = parsePage(c.req.query("page"));
  const [rows, months, regularSessions, count] = await Promise.all([
    listMeetings(c.env.DB, month, regularSessionId, sort, page),
    listMeetingMonths(c.env.DB),
    listRegularSessionOptions(c.env.DB),
    countMeetings(c.env.DB, month, regularSessionId),
  ]);
  return c.html(
    <Layout title="日程管理" variant="admin" adminEmail={c.get("adminEmail")} flash={getFlash(c)}>
      <MeetingsListPage
        rows={rows}
        months={months}
        regularSessions={regularSessions}
        filter={{ month, regularSessionId, sort }}
        page={page}
        totalPages={computeTotalPages(count)}
        buildHref={(p) => buildPageHref("/admin/meetings", c.req.query(), p)}
      />
    </Layout>
  );
});

/** P2-3: 定例会ハブの「この定例会に日程を追加」から regular_session_id を引き継いで選び直す手間をなくす。 */
meetingsRoute.get("/new", async (c) => {
  const form = formFromQuery(emptyMeetingForm, c.req.query(), ["regular_session_id"]);
  return render(c, form, [], null);
});

meetingsRoute.get("/:id/edit", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(
    `SELECT meeting_type, committee_id, regular_session_id, date, start_type, start_time, previous_meeting_id, schedule_text
     FROM meetings WHERE id = ?`
  )
    .bind(id)
    .first<{
      meeting_type: string;
      committee_id: number | null;
      regular_session_id: number | null;
      date: string;
      start_type: string;
      start_time: string | null;
      previous_meeting_id: number | null;
      schedule_text: string;
    }>();
  if (!row) return c.notFound();

  const [agendaLinks, documentLinks] = await Promise.all([
    c.env.DB.prepare(`SELECT agenda_item_id, display_order FROM meeting_agenda_items WHERE meeting_id = ?`)
      .bind(id)
      .all<{ agenda_item_id: number; display_order: number }>(),
    c.env.DB.prepare(`SELECT document_id, display_order FROM meeting_documents WHERE meeting_id = ?`)
      .bind(id)
      .all<{ document_id: number; display_order: number }>(),
  ]);

  const form: MeetingFormValues = {
    meeting_type: row.meeting_type,
    committee_id: row.committee_id ? String(row.committee_id) : "",
    regular_session_id: row.regular_session_id ? String(row.regular_session_id) : "",
    date: row.date,
    start_type: row.start_type,
    start_time: row.start_time ?? "",
    previous_meeting_id: row.previous_meeting_id ? String(row.previous_meeting_id) : "",
    schedule_text: row.schedule_text,
    agenda_item_ids: agendaLinks.results.map((r) => r.agenda_item_id),
    agenda_item_orders: Object.fromEntries(agendaLinks.results.map((r) => [r.agenda_item_id, String(r.display_order)])),
    document_ids: documentLinks.results.map((r) => r.document_id),
    document_orders: Object.fromEntries(documentLinks.results.map((r) => [r.document_id, String(r.display_order)])),
  };
  return render(c, form, [], id);
});

meetingsRoute.post("/", async (c) => {
  const form = readForm(await c.req.parseBody({ all: true }));
  const parsed = meetingSchema.safeParse(toSchemaInput(form));
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), null, 400);
  }
  const extraErrors = await validatePreviousMeeting(c.env.DB, null, parsed.data);
  if (extraErrors.length > 0) {
    return render(c, form, extraErrors, null, 400);
  }
  const result = await c.env.DB.prepare(
    `INSERT INTO meetings (meeting_type, committee_id, regular_session_id, date, start_type, start_time, previous_meeting_id, schedule_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      parsed.data.meeting_type,
      parsed.data.committee_id,
      parsed.data.regular_session_id,
      parsed.data.date,
      parsed.data.start_type,
      parsed.data.start_time,
      parsed.data.previous_meeting_id,
      parsed.data.schedule_text
    )
    .run();
  const meetingId = result.meta.last_row_id as number;
  await saveAssociations(c.env.DB, meetingId, form);
  logAdminMutation(c, "meetings", meetingId, "create");
  return c.redirect(withFlash("/admin/meetings", "created"));
});

meetingsRoute.post("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const form = readForm(await c.req.parseBody({ all: true }));
  const parsed = meetingSchema.safeParse(toSchemaInput(form));
  if (!parsed.success) {
    return render(c, form, parsed.error.issues.map((i) => i.message), id, 400);
  }
  const extraErrors = await validatePreviousMeeting(c.env.DB, id, parsed.data);
  if (extraErrors.length > 0) {
    return render(c, form, extraErrors, id, 400);
  }
  const result = await c.env.DB.prepare(
    `UPDATE meetings SET meeting_type = ?, committee_id = ?, regular_session_id = ?, date = ?, start_type = ?,
       start_time = ?, previous_meeting_id = ?, schedule_text = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      parsed.data.meeting_type,
      parsed.data.committee_id,
      parsed.data.regular_session_id,
      parsed.data.date,
      parsed.data.start_type,
      parsed.data.start_time,
      parsed.data.previous_meeting_id,
      parsed.data.schedule_text,
      id
    )
    .run();
  if (result.meta.changes === 0) return c.notFound();
  await saveAssociations(c.env.DB, id, form);
  logAdminMutation(c, "meetings", id, "update");
  return c.redirect(withFlash("/admin/meetings", "updated"));
});

meetingsRoute.post("/:id/delete", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    await c.env.DB.prepare(`DELETE FROM meetings WHERE id = ?`).bind(id).run();
  } catch {
    const [rows, months, regularSessions] = await Promise.all([
      listMeetings(c.env.DB, "", "", "date_desc", 1),
      listMeetingMonths(c.env.DB),
      listRegularSessionOptions(c.env.DB),
    ]);
    return c.html(
      <Layout title="日程管理" variant="admin" adminEmail={c.get("adminEmail")}>
        <p class="error-banner" role="alert">
          この会議を「前の会議」として指定している会議があるため削除できません(先にその会議の設定を変更してください)。
        </p>
        <MeetingsListPage
          rows={rows}
          months={months}
          regularSessions={regularSessions}
          filter={{ month: "", regularSessionId: "", sort: "date_desc" }}
          page={1}
          totalPages={1}
          buildHref={(p) => buildPageHref("/admin/meetings", {}, p)}
        />
      </Layout>,
      400
    );
  }
  logAdminMutation(c, "meetings", id, "delete");
  return c.redirect(withFlash("/admin/meetings", "deleted"));
});
