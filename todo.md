# BonDhu Bitto — Work Status

## Current production state

- Production Worker: `https://bondhu-bitto-nov.abdullhamoon61780.workers.dev`
- Latest deployed code version: `ef0e3464-23ff-4eba-b5b1-88ecda4ec72e`
- Database: Cloudflare D1 binding `DB`, database name `bondhu-bitto`
- Assets: `public/` served through the Worker `ASSETS` binding
- `audit_logs` exists in remote D1; admin-only Activity log UI and API are deployed
- Admin member password reset is deployed and verified live
- D1 migration `0003_emergency_replies.sql` applied to remote D1
- Redesigned Notice Board, full-size attachment viewer, and admin emergency replies are deployed and live-checked
- Simplified password rule is deployed: any non-empty password up to 128 characters
- Ask assistant with Samiti welcome, Kisti/bKash guidance, payable-total/status checks, payment submission steps, and friendly closing message is deployed
- Root documentation changes do not require redeployment

## Deployed in this session

- Redesigned Notice Board with card-based responsive layout, gradient accents, status/date chips, clearer attachment rows, and polished empty state.
- Added a reusable full-size attachment lightbox for notice images and emergency images with zoom, drag, backdrop/Esc close, and focus return.
- Added admin emergency replies stored in `emergency_messages.admin_reply`, `replied_at`, and `replied_by`; replying marks the message resolved and the member sees feedback under “Replies to my messages”.
- Added and applied `migrations/0003_emergency_replies.sql` to remote D1 before the Worker deploy.
- Added Worker and Express endpoints `GET /api/emergency/member` and `PATCH /api/emergency/:id/reply`, plus `emergency.replied` audit mapping with reply text redacted.
- Verified locally with `npm run build`, inline script syntax check, API smoke test, and Playwright desktop checks for notice lightbox, admin feedback composer, and member feedback visibility; live Worker check confirmed the new notice cards, lightbox, API fields, member-only feedback endpoint, and no page errors.
- Simplified password validation in Worker, Express, and the SPA to accept any non-empty password up to 128 characters; verified with API/UI smoke tests and live asset checks after deployment.
- Updated the Ask assistant to welcome members on every reply, answer Kisti amount/fine/bKash, payable total/status, and payment-submission questions with focused guidance, and send a friendly closing message; verified with response-intent checks and inline script syntax checks before deployment.

## Completed

- Cloudflare Worker production path with Hono, D1, asset serving, SPA fallback, and API-first routing.
- Administrator and member authentication with:
  - normalized email validation
  - non-empty password policy with a 128-character maximum
  - Web Crypto PBKDF2 hashing at the Workers-compatible 100000-iteration limit
  - `bb_session` JWT cookie with `HttpOnly`, `SameSite=Strict`, HTTPS `Secure`
  - 20-minute idle expiry with sliding refresh and client heartbeat
  - role-specific overview landing on every login/session restore (admin: Admin Panel Overview; member: Member Overview)
  - all password inputs cleared immediately on logout/session expiry
- Administrator member creation, activation/deactivation, profile viewing, profile editing, and password reset.
  - admin-only `POST /api/members/:id/reset-password`
  - simple password validation on the server and in the reset dialog
  - password hash replacement and outstanding reset-token cleanup
  - `member.password_reset` audit entry with no password in responses or logs
- Member profile editing with photo, NID images, nominee details, and signatures.
  - own and nominee signatures can be uploaded or drawn in a touch/mouse signature pad
  - drawn signatures are cropped, saved as white-background JPEG data URLs, and accepted by the existing 650 KB server validation
- Community Promise full-screen viewer with zoom, drag-to-pan, accessible close behavior, and focus return.
- bKash-inspired red visual theme layered over navigation, cards, forms, dialogs, login, and notice/emergency surfaces with screen-scoped print-safe overrides.
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
- Modernized navigation surfaces:
  - glass gradient top bar with accent rail, status chip, and refined account area
  - gradient sidebar with brand card, section divider, icon tiles, active glow, and hover shimmer
  - polished mobile drawer with animated menu button and full-width navigation rows
- In-app Ask assistant with guided Samiti answers and optional WhatsApp shortcut.
- Password reset flow implementation through Resend.
- Documentation:
  - current [README.md](README.md)
  - UI map in [visualmap.md](visualmap.md)
  - architecture in [tech arcitechture.md](tech%20arcitechture.md)
  - this status file in [todo.md](todo.md)
- Verification completed for profile printing, payment filters/scroll, print output, mobile widths, monthly print regression, ledger print regression, reset-flow cleanup, Worker build, server syntax, inline UI syntax, audit-log smoke test, admin/member reset-password API checks, password non-leakage checks, local browser admin reset dialog validation, local browser admin activity-log visibility, member nav hidden with API `403`, live production admin activity-log visibility, live unauthenticated reset route `401`, live admin reset dialog/named-audit-action checks, desktop/mobile navigation rendering, mobile menu animation, navigation active-state switching, live navigation asset checks, Community Promise full-screen viewer desktop/mobile interaction, zoom/pan, backdrop/Esc close, focus return, and live viewer asset checks, own/nominee signature drawing on desktop mouse and mobile touch, empty-pad validation, JPEG persistence within the 650 KB limit, admin signature-pad preview handling, and live signature-pad drawing on desktop/mobile with changes discarded, repeated admin/member login redirects plus logout password clearing, and live repeated admin redirect after navigating away and logging out, bKash theme rendering on desktop and mobile, and print-safe theme overrides, Ask assistant welcome/intent/closing response checks, Ask widget desktop/mobile layout and interaction checks, member dashboard average API/UI checks with and without an `average` field, generated-PDF checks confirming the shared brand/date/time footer on every page of Monthly Kisti History, Member Ledger, and the 3-page Member Profile.

## Active

- Ask widget UI refresh implemented locally with a branded header, suggested prompts, distinct user/bot bubbles, larger touch targets, mobile bottom-sheet layout, dimming scrim, and close/scrim/Escape handling; verified with Worker build, inline script syntax check, and Playwright desktop/mobile layout/interaction checks, not deployed yet.
- Member dashboard average fix implemented locally: member `/api/dashboard` responses now include community-wide average savings per active member in both Worker and Express, and the SPA renders it instead of `—`; verified with Worker build, server/inline syntax checks, and mocked member-login browser checks, not deployed yet.
- Shared print footer implemented locally: all three print formats use one fixed `#printBrandFooter` with BonDhu Bitto name/logo and date/time; the logo is decoded before printing and print CSS keeps the footer visible above role-class hiding rules. Verified with generated PDFs, not deployed yet.
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
