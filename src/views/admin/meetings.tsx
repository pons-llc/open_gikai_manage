import type { FC } from "hono/jsx";
import { agendaItemCategories, agendaItemCategoryLabels } from "../../validators/agendaItems";
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

/** P3-1: 議題チェックリストを年度で <details> グルーピングするための整形(既に fiscal_year DESC 順で来る前提)。 */
const groupByFiscalYear = (items: AgendaItemOption[]): [number, AgendaItemOption[]][] => {
  const groups: [number, AgendaItemOption[]][] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last[0] === item.fiscal_year) {
      last[1].push(item);
    } else {
      groups.push([item.fiscal_year, [item]]);
    }
  }
  return groups;
};

const meetingLabel = (r: MeetingRow) => (r.meeting_type === "committee" ? (r.committee_name ?? "委員会") : "本会議");
const startLabel = (r: MeetingRow) => (r.start_type === "fixed" ? r.start_time : "前の会議終了後");

export const MeetingsListPage: FC<{
  rows: MeetingRow[];
  months: string[];
  regularSessions: SelectOption[];
  filter: { month: string; regularSessionId: string };
}> = ({ rows, months, regularSessions, filter }) => (
  <AdminSection title="日程一覧" description="新規登録・チェーン登録は「新しい日程を登録」から行います。">
    <p>
      <a href="/admin/meetings/new" class="button button--primary">
        新しい日程を登録
      </a>
    </p>
    <form method="get" class="search-form">
      <label>
        年月
        <select name="month">
          <option value="" selected={filter.month === ""}>
            すべて
          </option>
          {months.map((m) => (
            <option value={m} selected={m === filter.month}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label>
        定例会
        <select name="regular_session_id">
          <option value="" selected={filter.regularSessionId === ""}>
            すべて
          </option>
          {regularSessions.map((s) => (
            <option value={s.id} selected={String(s.id) === filter.regularSessionId}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" class="button button--primary">
        絞り込む
      </button>
    </form>
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
  agendaTypes: SelectOption[];
}> = ({
  form,
  errors,
  editingId,
  committees,
  regularSessions,
  previousMeetingOptions,
  agendaItems,
  documents,
  agendaTypes,
}) => (
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
        {agendaItems.length > 0 && (
          <div class="field-filter">
            <input type="text" data-filter-input="agenda" placeholder="議題名で絞り込み" />
          </div>
        )}
        <div class="checkbox-list" data-filter-list="agenda">
          {agendaItems.length === 0 ? (
            <p class="hint" data-agenda-empty-hint>
              登録された議題がありません。
            </p>
          ) : (
            groupByFiscalYear(agendaItems).map(([year, items], groupIndex) => (
              <details open={groupIndex === 0}>
                <summary>{year}年度</summary>
                {items.map((a) => (
                  <div class="checkbox-list__row" data-filter-row>
                    <label class="checkbox-list__checkbox">
                      <input
                        type="checkbox"
                        name="agenda_item_ids"
                        value={a.id}
                        checked={form.agenda_item_ids.includes(a.id)}
                        data-order-checkbox
                        data-order-target={`agenda_item_order_${a.id}`}
                      />
                      {a.fiscal_year}年度 {agendaItemCategoryLabels[a.category as keyof typeof agendaItemCategoryLabels] ?? a.category} {a.title}
                    </label>
                    <input
                      type="number"
                      class="checkbox-list__order"
                      id={`agenda_item_order_${a.id}`}
                      name={`agenda_item_order_${a.id}`}
                      value={form.agenda_item_orders[a.id] ?? "0"}
                      aria-label={`${a.title} の表示順`}
                      data-order-input
                    />
                  </div>
                ))}
              </details>
            ))
          )}
        </div>
        <noscript>
          <p class="hint">
            <a href="/admin/agenda-items">議題管理</a>から議題を登録できます。
          </p>
        </noscript>
        <div class="inline-upload" data-inline-agenda-create hidden>
          <p class="hint">ここで作成すると、フォームを送信せずにチェックリストへ追加できます(即時公開)。</p>
          <div class="field">
            <label for="inline_agenda_title">議題名</label>
            <input type="text" id="inline_agenda_title" data-inline-agenda-title />
          </div>
          <div class="field">
            <label for="inline_agenda_fiscal_year">年度</label>
            <input
              type="number"
              id="inline_agenda_fiscal_year"
              data-inline-agenda-fiscal-year
              value={new Date().getFullYear()}
            />
          </div>
          <div class="field">
            <label for="inline_agenda_number">番号</label>
            <input type="number" id="inline_agenda_number" data-inline-agenda-number />
          </div>
          <div class="field">
            <label for="inline_agenda_category">種類</label>
            <select id="inline_agenda_category" data-inline-agenda-category>
              {agendaItemCategories.map((cat) => (
                <option value={cat}>{agendaItemCategoryLabels[cat]}</option>
              ))}
            </select>
          </div>
          <div class="field" data-inline-agenda-type-field>
            <label for="inline_agenda_type">議案種別</label>
            <select id="inline_agenda_type" data-inline-agenda-type>
              <option value="">選択してください</option>
              {agendaTypes.map((t) => (
                <option value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <button type="button" class="button button--secondary" data-inline-agenda-submit>
            この議題を作成
          </button>
          <p class="hint" data-inline-agenda-error style="display: none; color: var(--color-error-red-900);"></p>
        </div>
      </div>

      <div class="field">
        <span class="field-legend">会議資料(次第・会議録など議題非依存)</span>
        {documents.length > 0 && (
          <div class="field-filter">
            <input type="text" data-filter-input="document" placeholder="ファイル名で絞り込み" />
          </div>
        )}
        <div class="checkbox-list" data-filter-list="document">
          {documents.length === 0 ? (
            <p class="hint" data-document-empty-hint>
              登録された資料がありません。
            </p>
          ) : (
            documents.map((d) => (
              <div class="checkbox-list__row" data-filter-row>
                <label class="checkbox-list__checkbox">
                  <input
                    type="checkbox"
                    name="document_ids"
                    value={d.id}
                    checked={form.document_ids.includes(d.id)}
                    data-order-checkbox
                    data-order-target={`document_order_${d.id}`}
                  />
                  {d.file_name}
                </label>
                <input
                  type="number"
                  class="checkbox-list__order"
                  id={`document_order_${d.id}`}
                  name={`document_order_${d.id}`}
                  value={form.document_orders[d.id] ?? "0"}
                  aria-label={`${d.file_name} の表示順`}
                  data-order-input
                />
              </div>
            ))
          )}
        </div>
        <noscript>
          <p class="hint">
            <a href="/admin/documents">資料管理</a>からアップロードできます。
          </p>
        </noscript>
        <div class="inline-upload" data-inline-upload hidden>
          <p class="hint">ここでアップロードすると、フォームを送信せずにチェックリストへ追加できます。</p>
          <div class="field">
            <label for="inline-upload-file">ファイル</label>
            <input type="file" id="inline-upload-file" data-inline-upload-file />
          </div>
          <div class="field">
            <label for="inline-upload-agenda">議題(任意)</label>
            <select id="inline-upload-agenda" data-inline-upload-agenda>
              <option value="">選択なし</option>
              {agendaItems.map((a) => (
                <option value={a.id}>
                  {a.fiscal_year}年度 {a.title}
                </option>
              ))}
            </select>
          </div>
          <button type="button" class="button button--secondary" data-inline-upload-submit>
            ここでアップロード
          </button>
          <p class="hint" data-inline-upload-error style="display: none; color: var(--color-error-red-900);"></p>
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
