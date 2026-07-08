export type ParsedForm = Record<string, string | File | (string | File)[]>;

const asString = (v: string | File | (string | File)[] | undefined): string => {
  if (v === undefined) return "";
  if (Array.isArray(v)) v = v[0];
  return typeof v === "string" ? v : "";
};

export const str = (form: ParsedForm, key: string): string => asString(form[key]).trim();

export const optStr = (form: ParsedForm, key: string): string | undefined => {
  const v = str(form, key);
  return v === "" ? undefined : v;
};

export const checkboxOn = (form: ParsedForm, key: string): boolean => asString(form[key]) === "on";

export const intOrNull = (form: ParsedForm, key: string): number | null => {
  const v = str(form, key);
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** チェックボックス群(同名 `name`)から選択された正の整数 ID の一覧を取り出す。parseBody は `{ all: true }` が必要。 */
export const idList = (form: ParsedForm, key: string): number[] => {
  const v = form[key];
  if (v === undefined) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .filter((x): x is string => typeof x === "string")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
};

/**
 * P1-2「登録して続けて入力」: リダイレクトのクエリで引き継いだ文脈フィールドを、
 * 空フォームにマージして返す。クエリ由来の値も保存時は必ず既存の zod スキーマを通るため、
 * ここでは素通し(型変換のみ)でよい(§7 リスク対策)。
 * `keys` には文字列型のフィールドのみ渡すこと(呼び出し側の責任。汎用性のため型では強制しない)。
 */
export const formFromQuery = <T extends Record<string, unknown>>(
  emptyForm: T,
  query: Record<string, string | undefined>,
  keys: (keyof T)[]
): T => {
  const merged = { ...emptyForm };
  for (const key of keys) {
    const v = query[key as string];
    if (v !== undefined) (merged as Record<string, unknown>)[key as string] = v;
  }
  return merged;
};
