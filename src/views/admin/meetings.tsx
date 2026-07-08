import type { FC } from "hono/jsx";
import { agendaItemCategoryLabels } from "../../validators/agendaItems";
import { meetingTypeLabels, meetingTypes, startTypeLabels, startTypes } from "../../validators/meetings";
import type { SelectOption } from "./committeeMemberships";
import { AdminSection, DeleteForm, ErrorList } from "./shared";

export type MeetingRow = {
  id: number;
  meeting_type: string;
  committee_name: string | null;
  date: string;
  start_type: string;
  start_time: string | null;
  regular_session_name: string | null;
};

export type PreviousMeetingOption = { id: number; label: string };
export type AgendaItemOption = { id: number; title: string; fiscal_year: number; category: string };
export type DocumentOption = { id: number; file_name: string; file_size: number };

export type MeetingFormValues = {
  meeting_type: string;
  committee_id: string;
  regular_session_id: string;
  date: string;
  start_type: string;
  start_time: string;
  previous_meeting_id: string;
  schedule_text: string;
  agenda_item_ids: number[];
  agenda_item_orders: Record<number, string>;
  document_ids: number[];
  document_orders: Record<number, string>;
};

export const emptyMeetingForm: MeetingFormValues = {
  meeting_type: "plenary",
  committee_id: "",
  regular_session_id: "",
  date: "",
  start_type: "fixed",
  start_time: "",
  previous_meeting_id: "",
  schedule_text: "",
  agenda_item_ids: [],
  agenda_item_orders: {},
  document_ids: [],
  document_orders: {},
};

const meetingLabel = (r: MeetingRow) => (r.meeting_type === "committee" ? (r.committee_name ?? "委員会") : "本会議");
const startLabel = (r: MeetingRow) => (r.start_type === "fixed" ? r.start_time : "前の会議終了後");

export const MeetingsListPage: FC<{ rows: MeetingRow[] }> = ({ rows }) => (
  <AdminSection title="日程一覧" description="新規登録・チェーン登録は「新しい日程を登録」から行います。">
    <p>
      <a href="/admin/meetings/new" class="button button--primary">
        新しい日程を登録
      </a>
    </p>
    {rows.length === 0 ? (
      <p>登録された日程はありません。</p>
    ) : (
      <table class="admin-table">
        <thead>
          <tr>
            <th>開催日</th>
            <th>開始</th>
            <th>会議</th>
            <th>定例会</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr>
              <td>{r.date}</td>
              <td>{startLabel(r)}</td>
              <td>{meetingLabel(r)}</td>
              <td>{r.regular_session_name ?? "-"}</td>
              <td class="actions">
                <a href={`/admin/meetings/${r.id}/edit`}>編集</a> <DeleteForm action={`/admin/meetings/${r.id}/delete`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </AdminSection>
);

export const MeetingFormPage: FC<{
  form: MeetingFormValues;
  errors: string[];
  editingId: number | null;
  committees: SelectOption[];
  regularSessions: SelectOption[];
  previousMeetingOptions: PreviousMeetingOption[];
  agendaItems: AgendaItemOption[];
  documents: DocumentOption[];
}> = ({ form, errors, editingId, committees, regularSessions, previousMeetingOptions, agendaItems, documents }) => (
  <AdminSection title={editingId ? "日程を編集" : "日程を登録"}>
    <ErrorList errors={errors} />
    <form
      method="post"
      action={editingId ? `/admin/meetings/${editingId}` : "/admin/meetings"}
      class="admin-form admin-form--wide"
      data-meeting-form
      data-meeting-id={editingId ?? ""}
    >
      <div class="field">
        <span class="field-legend">会議種別</span>
        {meetingTypes.map((t) => (
          <label class="radio-label">
            <input type="radio" name="meeting_type" value={t} checked={t === form.meeting_type} data-meeting-type />
            {meetingTypeLabels[t]}
          </label>
        ))}
      </div>
      <div class="field" data-meeting-field="committee">
        <label for="committee_id">委員会</label>
        <select id="committee_id" name="committee_id">
          <option value="">選択してください</option>
          {committees.map((c) => (
            <option value={c.id} selected={String(c.id) === form.committee_id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div class="field">
        <label for="regular_session_id">定例会(任意)</label>
        <select id="regular_session_id" name="regular_session_id">
          <option value="">選択なし</option>
          {regularSessions.map((s) => (
            <option value={s.id} selected={String(s.id) === form.regular_session_id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div class="field">
        <label for="date">開催日</label>
        <input type="date" id="date" name="date" value={form.date} required data-meeting-date />
      </div>
      <div class="field">
        <span class="field-legend">開始</span>
        {startTypes.map((t) => (
          <label class="radio-label">
            <input type="radio" name="start_type" value={t} checked={t === form.start_type} data-meeting-start-type />
            {startTypeLabels[t]}
          </label>
        ))}
      </div>
      <div class="field" data-meeting-field="fixed">
        <label for="start_time">開始時刻</label>
        <input type="time" id="start_time" name="start_time" value={form.start_time} />
      </div>
      <div class="field" data-meeting-field="after_previous">
        <label for="previous_meeting_id">「前の会議」(同一開催日のみ選択可)</label>
        <select id="previous_meeting_id" name="previous_meeting_id" data-meeting-previous-select>
          <option value="">選択してください</option>
          {previousMeetingOptions.map((o) => (
            <option value={o.id} selected={String(o.id) === form.previous_meeting_id}>
              {o.label}
            </option>
          ))}
        </select>
        <p class="hint">開催日を変更すると候補が更新されます。</p>
      </div>
      <div class="field">
        <label for="schedule_text">日程本文</label>
        <textarea id="schedule_text" name="schedule_text">
          {form.schedule_text}
        </textarea>
      </div>

      <div class="field">
        <span class="field-legend">この会議の議題</span>
        <div class="checkbox-list">
          {agendaItems.length === 0 ? (
            <p class="hint">登録された議題がありません。</p>
          ) : (
            agendaItems.map((a) => (
              <div class="checkbox-list__row">
                <label class="checkbox-list__checkbox">
                  <input
                    type="checkbox"
                    name="agenda_item_ids"
                    value={a.id}
                    checked={form.agenda_item_ids.includes(a.id)}
                  />
                  {a.fiscal_year}年度 {agendaItemCategoryLabels[a.category as keyof typeof agendaItemCategoryLabels] ?? a.category} {a.title}
                </label>
                <input
                  type="number"
                  class="checkbox-list__order"
                  name={`agenda_item_order_${a.id}`}
                  value={form.agenda_item_orders[a.id] ?? "0"}
                  aria-label={`${a.title} の表示順`}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <div class="field">
        <span class="field-legend">会議資料(次第・会議録など議題非依存)</span>
        <div class="checkbox-list">
          {documents.length === 0 ? (
            <p class="hint">
              登録された資料がありません。<a href="/admin/documents">資料管理</a>からアップロードできます。
            </p>
          ) : (
            documents.map((d) => (
              <div class="checkbox-list__row">
                <label class="checkbox-list__checkbox">
                  <input type="checkbox" name="document_ids" value={d.id} checked={form.document_ids.includes(d.id)} />
                  {d.file_name}
                </label>
                <input
                  type="number"
                  class="checkbox-list__order"
                  name={`document_order_${d.id}`}
                  value={form.document_orders[d.id] ?? "0"}
                  aria-label={`${d.file_name} の表示順`}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <button type="submit" class="button button--primary">
        {editingId ? "更新する" : "登録する"}
      </button>
      {editingId && (
        <a href="/admin/meetings" style="margin-left: 1rem;">
          キャンセル
        </a>
      )}
    </form>
  </AdminSection>
);
