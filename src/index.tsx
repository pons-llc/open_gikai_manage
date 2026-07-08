import { Hono } from "hono";
import type { AppEnv } from "./env";
import { requireAuth, requireSameOrigin } from "./lib/auth";
import { noStore } from "./lib/cache";
import { topRoute } from "./routes/public/top";
import { newsRoute as publicNewsRoute } from "./routes/public/news";
import { meetingsRoute as publicMeetingsRoute } from "./routes/public/meetings";
import { sessionsRoute as publicSessionsRoute } from "./routes/public/sessions";
import { agendaItemsRoute as publicAgendaItemsRoute } from "./routes/public/agendaItems";
import { committeesRoute as publicCommitteesRoute } from "./routes/public/committees";
import { membersRoute as publicMembersRoute } from "./routes/public/members";
import { documentsRoute as publicDocumentsRoute } from "./routes/public/documents";
import { authRoute } from "./routes/admin/auth";
import { committeesRoute } from "./routes/admin/committees";
import { sessionsRoute } from "./routes/admin/sessions";
import { agendaTypesRoute } from "./routes/admin/agendaTypes";
import { membersRoute } from "./routes/admin/members";
import { factionsRoute } from "./routes/admin/factions";
import { committeeMembershipsRoute } from "./routes/admin/committeeMemberships";
import { factionMembershipsRoute } from "./routes/admin/factionMemberships";
import { announcementsRoute } from "./routes/admin/announcements";
import { agendaItemsRoute } from "./routes/admin/agendaItems";
import { documentsRoute } from "./routes/admin/documents";
import { apiDocumentsRoute } from "./routes/api/admin/documents";
import { meetingsRoute } from "./routes/admin/meetings";
import { apiMeetingsRoute } from "./routes/api/admin/meetings";
import { votesRoute } from "./routes/admin/votes";
import { dashboardRoute } from "./routes/admin/dashboard";

const app = new Hono<AppEnv>();

app.route("/", topRoute);
app.route("/news", publicNewsRoute);
app.route("/meetings", publicMeetingsRoute);
app.route("/sessions", publicSessionsRoute);
app.route("/agenda-items", publicAgendaItemsRoute);
app.route("/committees", publicCommitteesRoute);
app.route("/members", publicMembersRoute);
app.route("/documents", publicDocumentsRoute);

// noStore は §9.1/§10 のバックストップ: ゾーンの Cache Rules Bypass 設定に不備があっても
// admin/api 応答(Set-Cookie を含むログイン応答等)がキャッシュされないようアプリ側でも明示する。
// 認証必須の対象は設計どおり /admin/*(/admin/login, /admin/logout を除く)と /api/admin/* のみ
// (/api/* 全体ではない。将来 /api/ 配下に認証不要なエンドポイントが増えても誤って保護しないため)。
app.use("/admin/*", noStore);
app.use("/api/*", noStore);
app.use("/admin/*", requireSameOrigin, requireAuth);
app.use("/api/admin/*", requireSameOrigin, requireAuth);

app.route("/admin", authRoute);
app.route("/admin/committees", committeesRoute);
app.route("/admin/sessions", sessionsRoute);
app.route("/admin/agenda-types", agendaTypesRoute);
app.route("/admin/members", membersRoute);
app.route("/admin/factions", factionsRoute);
app.route("/admin/memberships", committeeMembershipsRoute);
app.route("/admin/faction-memberships", factionMembershipsRoute);
app.route("/admin/announcements", announcementsRoute);
app.route("/admin/agenda-items", agendaItemsRoute);
app.route("/admin/documents", documentsRoute);
app.route("/api/admin/documents", apiDocumentsRoute);
app.route("/admin/meetings", meetingsRoute);
app.route("/api/admin/meetings", apiMeetingsRoute);
app.route("/admin/votes", votesRoute);
app.route("/admin", dashboardRoute);

app.notFound((c) => c.text("Not Found", 404));

app.onError((err, c) => {
  console.error(JSON.stringify({ event: "unhandled_error", message: err.message }));
  return c.text("Internal Server Error", 500);
});

export default app;
