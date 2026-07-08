import type { FC, PropsWithChildren } from "hono/jsx";

const PUBLIC_NAV = [
  { href: "/meetings", label: "日程" },
  { href: "/agenda-items", label: "議題" },
  { href: "/committees", label: "委員会" },
  { href: "/members", label: "議員" },
  { href: "/news", label: "お知らせ" },
];

const ADMIN_NAV = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/meetings", label: "日程" },
  { href: "/admin/committees", label: "委員会" },
  { href: "/admin/sessions", label: "定例会" },
  { href: "/admin/agenda-types", label: "議案種別" },
  { href: "/admin/members", label: "議員" },
  { href: "/admin/memberships", label: "委員会所属" },
  { href: "/admin/factions", label: "会派" },
  { href: "/admin/faction-memberships", label: "会派所属" },
  { href: "/admin/announcements", label: "お知らせ" },
  { href: "/admin/agenda-items", label: "議題" },
  { href: "/admin/documents", label: "資料" },
  { href: "/admin/votes", label: "賛否記録" },
];

type LayoutProps = PropsWithChildren<{
  title: string;
  siteName?: string;
  variant?: "public" | "admin";
  adminEmail?: string;
}>;

export const Layout: FC<LayoutProps> = ({
  title,
  siteName = "○○市議会",
  variant = "public",
  adminEmail,
  children,
}) => {
  const nav = variant === "admin" ? ADMIN_NAV : PUBLIC_NAV;
  const headerTitle = variant === "admin" ? `${siteName} 管理画面` : siteName;
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title} | {headerTitle}</title>
        <link rel="stylesheet" href="/assets/style.css" />
      </head>
      <body>
        <header class="site-header">
          <p class="site-header__title">{headerTitle}</p>
          <nav class="site-header__nav" aria-label="主要ナビゲーション">
            <ul>
              {nav.map((item) => (
                <li>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
              {adminEmail && (
                <li class="site-header__logout">
                  <span>{adminEmail}</span>
                  <form method="post" action="/admin/logout" class="inline-form">
                    <button type="submit" class="button button--danger">
                      ログアウト
                    </button>
                  </form>
                </li>
              )}
            </ul>
          </nav>
        </header>
        <main>{children}</main>
        <footer class="site-footer">
          <p>{siteName} 議会事務局</p>
        </footer>
        <script src={`/assets/${variant === "admin" ? "admin" : "app"}.js`}></script>
      </body>
    </html>
  );
};
