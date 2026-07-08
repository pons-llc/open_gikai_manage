import type { Context } from "hono";
import type { AppEnv } from "../env";

export type AdminMutationAction = "create" | "update" | "delete";

/**
 * design.md §10: 管理操作(作成/更新/削除)は console.log に構造化 JSON で残す(Workers Logs / wrangler tail で確認)。
 * パスワード・セッショントークン等の秘密情報は絶対に含めないこと(§10 セキュリティ監査 6章)。
 */
export const logAdminMutation = (
  c: Context<AppEnv>,
  table: string,
  recordId: number | string | null,
  action: AdminMutationAction
): void => {
  console.log(
    JSON.stringify({
      event: "admin_mutation",
      admin_email: c.get("adminEmail") ?? null,
      table,
      record_id: recordId,
      action,
    })
  );
};
