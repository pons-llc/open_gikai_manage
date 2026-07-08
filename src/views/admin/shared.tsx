import type { FC } from "hono/jsx";
import { FLASH_LABELS, type FlashKind } from "../../lib/flash";

export const FlashBanner: FC<{ flash?: FlashKind }> = ({ flash }) => {
  if (!flash) return null;
  return (
    <div class="flash-banner" role="status" data-flash>
      {FLASH_LABELS[flash]}
    </div>
  );
};

export const ErrorList: FC<{ errors: string[] }> = ({ errors }) => {
  if (errors.length === 0) return null;
  return (
    <div class="error-banner" role="alert">
      <ul>
        {errors.map((e) => (
          <li>{e}</li>
        ))}
      </ul>
    </div>
  );
};

export const ReservedBadge: FC<{ publishedAt: string; now: string }> = ({ publishedAt, now }) =>
  publishedAt > now ? <span class="badge badge--reserved">予約中</span> : null;

export const DeleteForm: FC<{ action: string; label?: string }> = ({ action, label = "削除" }) => (
  <form method="post" action={action} class="inline-form" data-confirm="本当に削除しますか?">
    <button type="submit" class="button button--danger">
      {label}
    </button>
  </form>
);

export const AdminSection: FC<{ title: string; description?: string; children: any }> = ({
  title,
  description,
  children,
}) => (
  <section>
    <h2>{title}</h2>
    {description && <p class="section-description">{description}</p>}
    {children}
  </section>
);
