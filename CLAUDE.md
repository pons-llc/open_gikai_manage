# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This repo currently contains two distinct things at different maturity levels:

- **`docs/design.md`** — the full implementation design for "open_gikai" (議会文書管理システム), a Japanese local-government council document/schedule management system. The app (Cloudflare Workers + Hono + D1 + R2 + a hand-rolled ID/password auth layer + vanilla JS, per the design doc) is being scaffolded phase-by-phase per `docs/design.md` §11 "実装フェーズ" under `src/`, `wrangler.jsonc`, `package.json` at the repo root. Do not deviate from its schema/route/cost decisions without flagging the conflict. Auth note: design.md v1.5 dropped the originally-planned better-auth dependency in favor of a self-built PBKDF2 (password) + HMAC-session (Web Crypto only) implementation on D1 — see design.md §4. No `better-auth` or `drizzle-orm` package in this app.
- **`design-system-mcp/`** — a complete, working, independent npm package: a local stdio MCP server that exposes Digital Agency Design System (DADS) v2.12.0 tokens/guidelines/component specs as MCP tools/resources. It is a dependency the future app's frontend work will consult (via its MCP tools), not code to be merged into the app. Treat it as a separate project with its own commands below.
- **`idea.md`** — the original one-page Japanese requirements note that `docs/design.md` was derived from.
- **`.claude/skills/security-audit/SKILL.md`** — project-specific audit skill (`/security-audit`) for the future app; checks D1 SQL injection, XSS, auth/authz gaps, upload handling, cache/session leakage. Run it at the end of implementation phases 3, 4, 5, 7 per `docs/design.md` §11 — a phase isn't done while it reports Critical/High findings.

## Design constraints to preserve when implementing the app

These come from explicit user requirements in `docs/design.md` §9 and are easy to accidentally regress:

- Public-facing GET routes are cached for 30 minutes (documents 1 day) via zone-level Cloudflare Cache Rules ("Cache Everything", configured in the dashboard, not in code — design.md §9.1 as of v1.2), bypassed whenever the request carries a `Cookie` or targets `/admin/*` or `/api/*`. Application code (`src/lib/cache.ts`) only sets `Cache-Control` response headers as a backstop; it does not read/write `caches.default` itself. Never let a response containing `Set-Cookie` be cacheable.
- R2 storage has a total-size quota enforced in application code (`STORAGE_QUOTA_BYTES`, default 1TB = `1099511627776`) — checked against `SUM(documents.file_size)` before every upload write.
- Announcement scheduled-publish (`announcements.published_at`) is implemented as a read-time filter (`WHERE published_at <= datetime('now')`), not a cron job — keep it that way for cost reasons.

## design-system-mcp commands

All commands run from `design-system-mcp/`:

```bash
npm install
npm run dev              # run server directly via tsx (no build step)
npm run build             # tsc -> dist/
npm test                  # vitest run
npm run test:watch        # vitest watch mode
npm run test:coverage     # vitest run --coverage
npm run audit              # npm audit --audit-level=high
npm run verify             # build + test + audit, in sequence — run this before considering a change done
```

Run a single test file: `npx vitest run tests/services/color-service.test.ts`. Test files under `tests/` mirror the `src/` structure (`tests/services/*.test.ts` for `src/services/*.ts`); `vitest.config.ts` sets `globals: true` so `describe`/`it`/`expect` need no import.

## design-system-mcp architecture

- **Entry point**: `src/index.ts` wires a `StdioServerTransport` to the server built by `createServer()`, and handles `SIGINT`/`SIGTERM` for graceful shutdown. This is a long-running local process, not a request/response script — don't add code here that assumes single-shot execution.
- **`src/server.ts`** is the single place all seven MCP tools (`search_guidelines`, `get_guideline`, `get_color_tokens`, `get_component_spec`, `get_typography_spec`, `get_spacing_tokens`, `validate_color_usage`) and four `dads://` resources are registered. Every tool handler is wrapped through `runTool(...)`, which standardizes structured logging (`tool_invoked`/`tool_succeeded`/`tool_failed`/`unexpected_error` via `logEvent`) and catches thrown errors into a uniform `E_INTERNAL` response — new tools should go through this same wrapper rather than calling `server.tool(...)` with a bare handler.
- **Services layer** (`src/services/*-service.ts`): one service class per domain (guideline, color, component, typography), each operating on static in-repo data. `ColorService` also implements WCAG contrast math (relative luminance → contrast ratio → AA/AAA pass/fail) — this is hand-rolled, not from a library, so keep the sRGB gamma-correction formula intact if touching it.
- **Data layer** (`src/data/**`): DADS tokens/guidelines/component specs as typed TS literals (not JSON, not fetched at runtime) — this is what makes the server fully offline/local with no external API calls. When updating DADS content, edit these files directly; there is no ingestion pipeline.
- **Error convention**: tool failures return `{ content: [...], isError: true }` with a `E_*` error code appended to the message text (see `errorCodes` in `server.ts`), rather than throwing — this is intentional so MCP clients get a readable message instead of a protocol-level error.
- **Zod schemas** for tool inputs are defined as plain objects (not `z.object(...)`) at the top of `server.ts`, since `server.tool()` expects a raw shape. Regex constraints (e.g. section IDs must be `^[a-z0-9-]+$`, hex colors `^#?[0-9a-fA-F]{6}$`) double as the only input validation — there's no separate validation layer.
