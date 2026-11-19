# AGENTS.md — BonDhu Bitto

Project-specific instructions for AI coding agents and human contributors.

## 1. What this project is

BonDhu Bitto is a role-based savings and monthly kisti management portal for one administrator and community members. It tracks monthly contributions, approval status, member profiles and NID images, notices, emergency messages, reports, and an administrator activity log.

Production is a **Cloudflare Worker** built with **Hono**, backed by **Cloudflare D1**, serving a **single-file SPA** from `public/`. A legacy **Express + SQLite** server remains in the repository for local/legacy testing and is not the production target.

Production URL: `https://bondhu-bitto-nov.abdullhamoon61780.workers.dev`

## 2. Non-negotiable safety rules

- Never commit `.env`, `.dev.vars`, database files, credentials, API keys, JWT secrets, or real admin passwords. Use Wrangler secrets for production.
- Never edit a migration that has already been applied. Add a new numbered migration under `migrations/`.
- Never bypass `auth`, `adminOnly`, role checks, parameterized D1 queries, the audit middleware, or the existing security headers.
- Never write passwords, raw reset tokens, image payloads, or NID values into logs, audit details, API responses, or docs.
- Do not add payment-gateway assumptions: contributions are manually recorded and approved.
- Do not deploy, push, or commit unless the user explicitly asks.
- Keep `README.md`, `tech arcitechture.md`, `visualmap.md`, and `todo.md` in sync when behavior changes.
- Treat the SQL migrations and `src/index.js` as the source of truth. Some conceptual diagrams in `tech arcitechture.md` are approximate (for example, audit column names).

## 3. Repository map

| Path | Purpose |
| --- | --- |
| `src/index.js` | Production Hono Worker: constants, validation, PBKDF2 hashing, JWT/cookie auth, rate limits, admin bootstrap, all `/api/*` routes, audit middleware, D1 queries, error handling. |
| `public/index.html` | Entire browser UI: markup, all CSS, all client JavaScript, dynamic page/nav construction, dialogs, printing. |
| `public/image/` | Logos, videos, and community images served at `/image/*`. |
| `wrangler.toml` | Worker name, `main`, compatibility date/flags, asset binding, SPA fallback, API-first routing, D1 binding, non-secret vars, observability. |
| `migrations/0001_init.sql` | Base schema: `users`, `payments`, `password_resets`, `notices`, `emergency_messages`. |
| `migrations/0002_audit_logs.sql` | Additive `audit_logs` schema and indexes. |
| `migrations/0003_emergency_replies.sql` | Additive emergency feedback columns: `admin_reply`, `replied_at`, and `replied_by`. |
| `server.js` | Legacy Express/SQLite implementation with startup schema creation and near-parity API. |
| `.env.example` | Legacy server config template. |
| `.dev.vars.example` | Local Worker config/secrets template. |
| `.notice-emergency-smoke.cjs` | Ad-hoc Express smoke test for notice/emergency flows. |
| `dist/` | Generated Wrangler dry-run output; ignored by git. |
| `data/` | Legacy SQLite data directory; ignored by git. |

There is **no frontend build step**. Edit `public/index.html` directly; Wrangler publishes `public/` as static assets.

## 4. Commands

Use PowerShell on Windows.

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies. |
| `npm run dev:worker` | Run the Cloudflare Worker locally with Wrangler. |
| `npm run db:migrate:local` | Apply migrations to local D1. |
| `npm start` | Start the legacy Express/SQLite server on port 3000. |
| `npm run dev` | Same as `npm start` with Node watch mode. |
| `npm run build` | Validate/bundle the Worker via `wrangler deploy --dry-run --outdir=dist`. |
| `npm run deploy` | Deploy the Worker with `wrangler deploy`. |
| `npm run db:migrate` | Apply migrations to remote D1. |
| `node --check server.js` | Syntax-check the legacy server. |
| `node .notice-emergency-smoke.cjs` | Run the local notice/emergency smoke test. |

There is currently **no linter, type checker, or committed automated test suite**. Do not invent commands; use the checks above and add focused manual verification.

### Local Worker setup

```powershell
Copy-Item .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev:worker
```

On Windows, `workerd` can crash with an access violation. Install the latest Microsoft Visual C++ Redistributable. If local Worker development remains unstable, validate with `npm run build` and test against the deployed Worker.

### Legacy Express setup

```powershell
Copy-Item .env.example .env
npm run dev
```

The legacy server creates `data/bondhu-bitto.sqlite` and auto-adds columns/indexes. Local SQLite data is **not** migrated into D1.

## 5. Configuration and secrets

### Production Worker

`wrangler.toml` contains only non-secret vars:

- `NODE_ENV=production`
- `ADMIN_NAME`
- `APP_URL` (must match the deployed Worker URL; used as the password-reset link base)
- `WHATSAPP_NUMBER` (empty means the WhatsApp shortcut is hidden)

Provision secrets interactively; never commit values:

```powershell
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put MAIL_FROM
```

- `JWT_SECRET` must be at least 32 random characters.
- `ADMIN_PASSWORD` must be non-empty and at most 128 characters.
- The administrator is created lazily on the first login when `ADMIN_EMAIL` and a non-empty `ADMIN_PASSWORD` are configured. `ensureAdmin()` caches readiness per Worker isolate.
- Password recovery requires both `RESEND_API_KEY` and a verified `MAIL_FROM` sender.
- The D1 binding is `DB`, database name `bondhu-bitto`, migrations directory `migrations`.

### Legacy server

`.env` uses `PORT`, `NODE_ENV`, `JWT_SECRET`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `APP_URL`, `SMTP_*`, and `WHATSAPP_NUMBER`. It uses SMTP/Nodemailer rather than Resend.

## 6. Database and migrations

Core tables:

- `users`: admins and members; unique case-insensitive `email`; optional unique `account_no`; role `admin|member`; `active` flag; profile/NID/signature data URLs.
- `payments`: `member_id`, positive `amount`, `kisti_month` (`YYYY-MM`), `paid_date` (`YYYY-MM-DD`), method/reference/note, `recorded_by`, `status` (`pending|approved`), `approved_by`, `approved_at`.
- `password_resets`: SHA-256 token hash, 30-minute expiry in epoch milliseconds, `used_at`.
- `notices`: title/body, optional image/file BLOBs, author, timestamp.
- `emergency_messages`: member message, optional BLOBs, `new|resolved`, resolver/timestamps, and admin feedback fields `admin_reply`, `replied_at`, and `replied_by`.
- `audit_logs`: actor snapshot, target, action/category/outcome, method/path/status, IP/user agent, bounded JSON `details`, ISO timestamp.

Rules:

- Add schema changes as new files, e.g. `migrations/0003_<description>.sql`.
- Prefer additive, backward-compatible changes; existing deployments apply migrations separately.
- Apply to remote with `npm run db:migrate` and local with `npm run db:migrate:local`.
- `audit_logs` must exist before audit writes succeed. Until applied, audit writes fail quietly and log only to Worker console.
- Member account numbers are generated as `BB-` plus a zero-padded user id.
- Back up D1 and test restoration before recording real money. There is no automatic backup/restore runbook yet.

## 7. Backend conventions (`src/index.js`)

### Routing and middleware

- All API routes live under `/api`; `/api/*` is routed to the Worker first via `wrangler.toml`.
- Protected routes use `auth`. Admin routes add `adminOnly`.
- `POST /api/emergency` additionally requires `role === "member"`.
- Use Hono handlers (`async (c) => ...`) and return `c.json(...)`, `c.body(...)`, or `c.text(...)`.
- Keep the existing error semantics: `400` validation, `401` session, `403` role, `404` missing, `409` duplicate, `413` body too large, `429` rate limit, `500` server/schema error.
- `app.notFound` and `app.onError` must remain JSON for `/api/*`.

### Input, storage, and responses

- Reuse existing helpers: `clean`, `normalizeEmail`, `passwordIssue`, `validMonth`, `validDate`, `parseDataUpload`, `parseProfileImage`, `safeFilename`.
- Use prepared D1 statements (`c.env.DB.prepare(...).bind(...)`) and never interpolate user input into SQL.
- Use `batch()` for multi-statement invariants and inspect `meta.changes` / `meta.last_row_id`.
- API bodies are capped at 12 MiB by `Content-Length`; keep client data URLs within that budget.
- `GET /api/payments` is capped at 500 rows; client-side filters only see loaded rows. Do not assume full history is present.
- Rate limits are in-memory per Worker isolate and are not globally shared.

### Authentication and passwords

- Session cookie: `bb_session`, `HttpOnly`, `SameSite=Strict`, `Secure` on HTTPS, 20-minute sliding expiry.
- JWT: HS256, payload `{ id, exp }`, signed with `JWT_SECRET`.
- `auth` reloads the user from D1 and rejects missing/inactive users.
- Worker hashing: PBKDF2-HMAC-SHA-256, 100000 iterations, 16-byte salt, `pbkdf2$<iterations>$<salt>$<hash>`.
- Legacy bcrypt values are still verified and upgraded to PBKDF2 on successful login.
- Do not reveal whether an email exists during login or forgot-password flows.

### Audit logging

- Every `/api/*` request is audited by middleware; `/api/activity-log` is skipped to avoid recursion.
- Add or update a rule in `AUDIT_ROUTE_RULES` when adding a meaningful action.
- Use `setAudit`, `auditActor`, `auditTarget`, and `auditFailure` for context.
- Audit `details` are capped at 8 KiB; never include passwords, raw reset tokens, image payloads, or NID values.
- `GET /api/activity-log` is admin-only today. Note that member-scoped branches inside it are currently unreachable unless `adminOnly` is removed intentionally.

### Uploads

- Client uploads arrive as base64 data URLs in JSON.
- Profile photos, NID images, and signatures: canonical JPEG only, at most 650 KiB decoded.
- Notice/emergency images: JPEG, PNG, or WebP, at most 2 MiB decoded.
- Notice/emergency files: PDF, TXT, DOC, or DOCX, at most 4 MiB decoded.
- Always round-trip base64 validation, sanitize filenames, and serve attachments with `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.

## 8. Frontend conventions (`public/index.html`)

- One file contains all markup, CSS, and JavaScript; there is no framework and no bundler.
- Use the existing `api(url, opts)` helper for `/api/*` requests; it handles JSON headers and session expiry behavior.
- Use `esc()` before injecting user data into HTML. Reuse `$()` for element lookup and `money()` for BDT formatting.
- Pages are `<section>` containers toggled by `showPage()`. Several pages and nav buttons are created dynamically in the inline script (`memberLedgerPage`, `noticesPage`, `emergencyPage`, `activityLogPage`).
- Gate role-specific UI with `.adminnav` / `.membernav`; the server remains the enforcement boundary.
- `showApp()` sets the signed-in identity/account label, starts session tracking, and loads data via `loadAll()`.
- Printing uses body classes and print-only DOM:
  - `body.printing-ledger` for the member ledger.
  - `body.printing-member-profile` for the three-page member profile.
  - Neither for monthly Kisti History.
  - Refresh date/time on `beforeprint`; remove classes on `afterprint`.
- Prefer `/image/...` for new static asset references. Existing `../image/...` references also resolve, but do not add more.
- A screen-scoped bKash-inspired theme is layered in `#bkashTheme`; preserve the existing print-only color overrides.
- Signature fields include native canvas drawing pads (`createSignaturePad`) in addition to file uploads. Keep exported signatures canonical JPEG data URLs within the 650 KiB profile-image limit, and preserve the existing pending-signature/save flow.
- Keep forms accessible: label/control association, `aria-live` for dynamic counts, native `<dialog>` behavior, and visible text plus color for statuses.

## 9. Legacy Express parity (`server.js`)

When changing a shared feature or API, update both runtimes unless the change is explicitly Worker-only:

- `server.js` uses bcrypt, a 12-hour JWT with no sliding refresh, SMTP/Nodemailer, weaker email/password validation, and startup schema auto-creation.
- The Worker uses PBKDF2, 20-minute sliding sessions, Resend, stricter validation, and D1 migrations.
- Keep the endpoint shapes, status codes, role rules, and audit action names aligned where practical.
- Do not copy production D1 data into SQLite or vice versa.

## 10. Deployment

Production deployment is currently **manual**:

```powershell
npm run build
npm run db:migrate   # only when migrations/ changed
npm run deploy
```

There is **no `.github/` directory and no GitHub Actions deployment workflow** in this repository. If Cloudflare dashboard Git integration is enabled, it is configured outside this repo and cannot be inferred from the code. Do not assume pushes deploy automatically.

Operational rules:

- Order for schema changes: add migration, apply remote D1, then deploy code that depends on it.
- `npm run build` is a dry-run bundle only; it does not deploy.
- `APP_URL` must stay in sync with the actual Worker URL because reset links use it.
- Documentation-only changes under the repo root do not require redeployment because only `public/` is published as assets.
- Keep `dist/`, `.wrangler/`, `data/`, and database files out of git.
- If asked to add CI/CD, use GitHub secrets for `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; never hardcode them. Keep migrations explicit and reviewable rather than silently applying them on every push.

## 11. Verification checklist

Before declaring work complete:

1. Run `npm run build` and fix any Wrangler/bundling errors.
2. If `server.js` changed, run `node --check server.js`.
3. If inline frontend JavaScript changed, extract the `<script>` block to a temporary `.js` file and run `node --check` on it, or verify in a browser.
4. If schema changed, apply against local D1 (`npm run db:migrate:local`) and test the affected APIs.
5. If notice/emergency flows changed, run `node .notice-emergency-smoke.cjs`.
6. Manually verify role behavior:
   - Unauthenticated `/api/me` returns `401`.
   - Member cannot use admin routes (`403`).
   - Admin can create/edit/reset members and approve payments.
   - Activity log is admin-only and excludes `/api/activity-log` itself.
7. Confirm no passwords, tokens, image payloads, or NID values appear in logs or responses.
8. Update the relevant docs and `todo.md` when behavior or status changes.

## 12. Known limitations and pitfalls

- Password recovery returns `503` until Resend secrets and a verified sender are configured.
- No online payment gateway or automatic payment verification.
- No server-side pagination for payments; `GET /api/payments` returns at most 500 rows.
- In-memory rate limits are per isolate, not global.
- Logout clears the cookie but does not revoke already issued JWTs before expiry.
- No member self-service password change; admins reset member passwords.
- No payment reversal workflow; edits/deletions are audited but not reversible.
- No audit retention/archive policy; `audit_logs` grows indefinitely.
- D1 backups and restore procedures are not automated in this repo.
- `ensureAdmin()` caches per isolate; credential changes may require a redeploy to bootstrap a new admin.
- The `tech arcitechture.md` ER diagram uses conceptual audit names; use `migrations/0002_audit_logs.sql` (`actor_source`, `status`, `details`, `created_at` text) as authoritative.
- Windows `workerd` may crash; legacy `npm start` avoids it.

## 13. Documentation index

- `README.md` — setup, deployment, operating notes, current limitations.
- `tech arcitechture.md` — Worker/D1/API/auth/upload/print architecture.
- `visualmap.md` — screens, roles, navigation, dialogs, print layouts, responsive behavior.
- `todo.md` — completed work, active work, blockers, recommended follow-ups.
