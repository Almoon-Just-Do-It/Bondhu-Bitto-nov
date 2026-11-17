# BonDhu Bitto — Work Status

## Current production state

- Production Worker: `https://bondhu-bitto-nov.abdullhamoon61780.workers.dev`
- Latest deployed code version: `b2820b1b-b027-42c9-a607-7a5058bd013f`
- Database: Cloudflare D1 binding `DB`, database name `bondhu-bitto`
- Assets: `public/` served through the Worker `ASSETS` binding
- `audit_logs` exists in remote D1; admin-only Activity log UI and API are deployed
- Admin member password reset is deployed and verified live
- Root documentation changes do not require redeployment

## Completed

- Cloudflare Worker production path with Hono, D1, asset serving, SPA fallback, and API-first routing.
- Administrator and member authentication with:
  - normalized email validation
  - 12–128 character password policy
  - Web Crypto PBKDF2 hashing at the Workers-compatible 100000-iteration limit
  - `bb_session` JWT cookie with `HttpOnly`, `SameSite=Strict`, HTTPS `Secure`
  - 20-minute idle expiry with sliding refresh and client heartbeat
- Administrator member creation, activation/deactivation, profile viewing, profile editing, and password reset.
  - admin-only `POST /api/members/:id/reset-password`
  - 12–128 character policy validation on the server and in the reset dialog
  - password hash replacement and outstanding reset-token cleanup
  - `member.password_reset` audit entry with no password in responses or logs
- Member profile editing with photo, NID images, nominee details, and signatures.
- Monthly kisti recording, approval workflow, editing, deletion, and role-scoped history.
- Monthly Kisti History:
  - fixed-height scroll container with sticky header
  - month filter generated from loaded records
  - status filter for approved/pending
  - free-text search across member and payment fields
  - result count and clear-filters action
  - print mode that hides filters and expands the full table
- Browser printing:
  - Monthly Kisti History print header/footer/spacer
  - Member Ledger print header/footer/spacer
  - three-page Member Profile printout with member NID and nominee NID pages
  - repeated date/time and logo footer on printed pages
- Notice board with image/file attachments.
- Member emergency messages with image/file attachments and administrator resolution.
- CSV export of approved contributions.
- User activity auditing:
  - `audit_logs` migration and D1 table with actor, target, action, category, outcome, status, detail, IP, user agent, and timestamp fields
  - Worker middleware and route-level metadata for authenticated and public API actions
  - legacy Express request-level audit middleware with login/logout actor enrichment
  - admin-only `GET /api/activity-log` with filters, stats, and filter options
  - administrator-only Activity log UI; members have no activity-log navigation
  - redaction of passwords, raw reset tokens, image payloads, and NID values
  - corrected admin scope label so the page reports all users instead of only the signed-in admin
  - corrected Worker audit action/category extraction so route rules produce named actions
  - remote `audit_logs` table verified and audit build deployed to the production Worker
  - admin-only activity-log access deployed and verified live
- In-app Ask assistant and optional WhatsApp shortcut.
- Password reset flow implementation through Resend.
- Documentation:
  - current [README.md](README.md)
  - UI map in [visualmap.md](visualmap.md)
  - architecture in [tech arcitechture.md](tech%20arcitechture.md)
  - this status file in [todo.md](todo.md)
- Verification completed for profile printing, payment filters/scroll, print output, mobile widths, monthly print regression, ledger print regression, reset-flow cleanup, Worker build, server syntax, inline UI syntax, audit-log smoke test, admin/member reset-password API checks, password non-leakage checks, local browser admin reset dialog validation, local browser admin activity-log visibility, member nav hidden with API `403`, live production admin activity-log visibility, live unauthenticated reset route `401`, and live admin reset dialog/named-audit-action checks.

## Active

- Define an audit retention/archive policy before long-term production use.
- Configure production Resend secrets and verify password recovery end to end.
- Keep D1 backups and a documented restore process before handling real money.
- Review privacy notice, receipts, approval process, and organization financial controls.

## Blocked

- Password recovery email delivery is blocked until these Wrangler secrets are set:
  - `RESEND_API_KEY`
  - `MAIL_FROM` with a verified sender domain/address
- Without those secrets, `POST /api/password/forgot` returns a configuration error.

## Recommended follow-up work

1. Set Resend secrets and test forgot-password/reset with a real mailbox.
2. Add server-side pagination or date-range filtering for payment history beyond the current 500-row API cap.
3. Add member self-service password change.
4. Add automated kisti reminders.
5. Add a payment reversal workflow; the activity log records current edits/deletions but does not reverse financial state.
6. Add audit retention/archiving and a documented review process for suspicious activity.
7. Expand automated smoke tests into a committed test suite, including admin-only access and redaction checks.
8. Document a backup/restore runbook for the production D1 database.

## Useful verification commands

```powershell
npm run build
npm run deploy
npm run db:migrate
node --check server.js
node --check "$env:TEMP\opencode\audit-inline.js"
node "$env:TEMP\opencode\activity-log-smoke.cjs"
node "$env:TEMP\opencode\activity-log-ui-check.cjs"
```

Documentation-only edits do not need `npm run deploy` because only `public/` is published as Worker assets.
