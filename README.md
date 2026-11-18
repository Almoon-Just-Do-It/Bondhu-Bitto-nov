# BonDhu Bitto — Savings & Monthly Kisti Management

BonDhu Bitto is a role-based savings portal for an administrator and community members. It records monthly kisti, tracks approval status, maintains member profiles and NID images, publishes notices, handles emergency messages, and exports contribution reports.

The production application is a Cloudflare Worker using Hono, Cloudflare D1, and static assets served from `public/`. A legacy Express/SQLite implementation remains in the repository for local and migration testing.

## Documentation

- [README.md](README.md) — setup, commands, deployment, and operating notes
- [visualmap.md](visualmap.md) — screens, roles, navigation, dialogs, print layouts, and responsive behavior
- [tech arcitechture.md](tech%20arcitechture.md) — Worker, D1, API, authentication, upload, print, and deployment architecture
- [todo.md](todo.md) — completed work, remaining work, and known blockers

## Features

- Administrator and member sign-in with 20-minute idle sessions
- Administrator-created member accounts with generated A/C numbers
- Administrator-initiated member password reset from the Members table
- Member profile editing with photo, NID images, nominee details, signatures, and on-screen signature drawing pads
- Community Promise image with hover zoom and a keyboard-accessible full-size lightbox
- Monthly kisti recording with pending submissions and administrator approval
- Monthly Kisti History with month/status/search filters and a scrollable table
- Individual member ledger and browser-based printing
- Three-page member profile printout with NID pages
- Notice board with optional image/file attachments
- Member emergency inbox with optional attachments and resolution workflow
- CSV export of approved contributions
- Activity log page: administrator-only view of every user's actions
- In-app Ask assistant and optional WhatsApp shortcut
- Password reset links through Resend when mail secrets are configured

## Requirements

- Node.js 20 or newer
- npm
- Cloudflare account and Wrangler CLI for Worker deployment
- Cloudflare D1 database for production
- Resend account and a verified sender domain/address for password reset emails

## Production project layout

| Path | Purpose |
| --- | --- |
| `src/index.js` | Hono Worker and all production API routes |
| `public/index.html` | Complete browser UI: markup, CSS, and JavaScript |
| `public/image/` | Logos, videos, and community images |
| `wrangler.toml` | Worker name, asset binding, D1 binding, variables, and observability |
| `migrations/0001_init.sql` | Base D1 schema |
| `migrations/0002_audit_logs.sql` | Activity log table and indexes |
| `server.js` | Legacy Express/SQLite server |
| `.env.example` | Legacy server configuration template |
| `.dev.vars.example` | Local Worker development configuration template |

There is no frontend build step. `public/index.html` is served directly as a single-file SPA.

## First-time Cloudflare setup

```powershell
npm install
npx wrangler login
```

If the D1 database does not already exist, create it and copy the returned `database_id` into `wrangler.toml`:

```powershell
npx wrangler d1 create bondhu-bitto
```

Apply all migrations:

```powershell
npm run db:migrate
```

For an existing deployment, this applies the new `0002_audit_logs.sql` migration. Run it before using the Activity log page; until then, audit writes fail quietly and only appear in Worker logs.

Set production secrets. Wrangler prompts for each value; do not commit real values:

```powershell
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put MAIL_FROM
```

Configuration notes:

- `JWT_SECRET` must be at least 32 random characters.
- `ADMIN_PASSWORD` must be 12–128 characters, including uppercase, lowercase, a number, and a symbol. It cannot contain the admin email local part or a name token of three or more characters.
- The administrator account is created lazily on the first login when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are configured.
- `APP_URL`, `ADMIN_NAME`, and `WHATSAPP_NUMBER` are ordinary variables in `wrangler.toml`.
- `APP_URL` must match the deployed Worker URL because it is used as the password-reset link base.
- Password recovery requires both `RESEND_API_KEY` and a verified `MAIL_FROM`.

## Build and deploy

```powershell
npm run build
npm run deploy
```

- `npm run build` validates and bundles the Worker with `wrangler deploy --dry-run --outdir=dist`.
- `npm run deploy` runs `wrangler deploy`.
- Root documentation files are not part of the Worker asset directory, so documentation-only changes do not require a redeploy.

## Local development

### Worker development

```powershell
Copy-Item .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev:worker
```

On Windows, `workerd` may crash with an access violation. Install the latest Microsoft Visual C++ Redistributable. If local Worker development remains unstable, validate with `npm run build` and test against the deployed Worker.

### Legacy Express/SQLite development

```powershell
Copy-Item .env.example .env
npm run dev
```

Or run without file watching:

```powershell
npm start
```

The legacy server stores data in `data/bondhu-bitto.sqlite` and serves the same `public/` UI on `http://localhost:3000`. It is not the production deployment target and does not share all production security behavior. Local SQLite data is not copied into D1 automatically.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Start the legacy Express/SQLite server |
| `npm run dev` | Start the legacy server with Node watch mode |
| `npm run dev:worker` | Start local Cloudflare Worker development |
| `npm run build` | Dry-run bundle validation into `dist/` |
| `npm run deploy` | Deploy the Worker |
| `npm run db:migrate` | Apply migrations to remote D1 |
| `npm run db:migrate:local` | Apply migrations to local D1 |

## Security and operating notes

- Deploy only over HTTPS. The session cookie is `HttpOnly`, `SameSite=Strict`, and `Secure` on HTTPS requests.
- Never commit `.env`, `.dev.vars`, database files, API keys, JWT secrets, or admin credentials.
- Keep D1 backups and test restoration before recording real money.
- Restrict administrator access to trusted users.
- Review approvals, deletions, receipts, privacy notices, and financial controls before production use.
- Audit records store actor snapshots, target labels, action metadata, IP, user agent, status, and timestamps. Passwords, raw reset tokens, image payloads, and NID values are not written to the activity log.
- The activity log is administrator-only; members cannot open the page or query audit records.
- Generated member credentials and administrator-reset passwords must be shared securely.
- An administrator password reset deletes that member's outstanding email reset tokens, but already issued JWTs remain valid until their short expiry.
- Rate limits are in-memory per Worker isolate, not shared globally.
- Clearing the session cookie does not revoke an already issued JWT before its expiry.
- The payment list API returns at most 500 rows; the browser filters only the loaded rows.
- Payments are manually recorded and approved; there is no automatic bKash, Nagad, bank, or card verification.

## Current limitations

- No online payment gateway or automatic payment verification
- No automated SMS or email kisti reminders
- No downloadable PDF receipt; printing uses the browser print dialog
- No member self-service password-change workflow; admins can reset member passwords from the Members table
- No payment reversal workflow; edits and deletions are recorded in the activity log, but independent records and backups are still recommended
- No audit-log retention or archive policy; D1/SQLite storage grows as activity accumulates
- Password recovery does not work until Resend secrets and a verified sender are configured
