# BonDhu Bitto — Savings & Monthly Kisti Management

A full-stack starter application with:
- Administrator and member sign-in
- Member account creation and activation/deactivation
- Monthly kisti/payment recording
- Member-submitted payments remain pending until an administrator approves them
- Admin-managed notice board with image/file attachments, member emergency inbox with attachments, and an in-app Ask FAQ assistant
- WhatsApp contact shortcut for signed-in users (configured with `WHATSAPP_NUMBER`)
- Individual member savings history
- Organization dashboard and monthly collection totals
- CSV export of the payment ledger
- SQLite database (created automatically)

## Requirements
- Node.js 20 or newer
- npm

## Setup (Windows / VS Code)
1. Extract the ZIP file.
2. Open the extracted `bondhu-bitto` folder in VS Code.
3. Open Terminal → New Terminal.
4. Run `npm install`.
5. Copy `.env.example` to a new file named `.env`.
6. Edit `.env` and set:
   - `JWT_SECRET` to a long random string (at least 32 characters)
   - `ADMIN_EMAIL` to the administrator's email
   - `ADMIN_PASSWORD` to a strong password of at least 10 characters
   - `APP_URL` and `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` to enable password reset emails
   - `WHATSAPP_NUMBER` in international digits (country code, no `+` or spaces) to show the WhatsApp contact button
7. Run `npm start`.
8. Open `http://localhost:3000` in your browser.

The initial administrator is created automatically the first time the server starts.
The database is stored in `data/bondhu-bitto.sqlite`.

## Deploying to Cloudflare Workers

The Worker version in `src/index.js` uses Cloudflare D1 instead of SQLite and is configured in `wrangler.toml`. The old Express/SQLite server (`server.js`) still runs locally with `npm start`.

1. Install dependencies and sign in to Cloudflare:
   ```powershell
   npm install
   npx wrangler login
   ```
2. Create the D1 database:
   ```powershell
   npx wrangler d1 create bondhu-bitto
   ```
   Copy the returned `database_id` into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.
3. Apply the schema:
   ```powershell
   npm run db:migrate
   ```
4. Set secrets (prompted values):
   ```powershell
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put ADMIN_EMAIL
   npx wrangler secret put ADMIN_PASSWORD
   ```
   `JWT_SECRET` must be at least 32 characters, `ADMIN_PASSWORD` at least 10 characters. The administrator is created automatically on the first login.
5. Update `APP_URL` in `wrangler.toml` to your Worker URL after the first deploy. Password reset email also requires `RESEND_API_KEY` and `MAIL_FROM` secrets (Cloudflare Workers cannot use SMTP/nodemailer).
6. Build and deploy:
   ```powershell
   npm run build
   npm run deploy
   ```

Build command: `npm run build` (bundles and validates with `wrangler deploy --dry-run`).
Deploy command: `npm run deploy` (runs `wrangler deploy`).

The Worker uses Web Crypto PBKDF2 password hashing, so it runs on the Workers Free plan. Legacy bcrypt hashes from an old SQLite database are still accepted for login, but they can exceed the Free plan CPU limit.

For local Worker development, copy `.dev.vars.example` to `.dev.vars`, run `npm run db:migrate:local`, then `npm run dev:worker`. Requires a current Microsoft Visual C++ Redistributable on Windows; if `workerd` crashes with an access violation, install the latest VC++ Redistributable.

Data in the local `data/bondhu-bitto.sqlite` database is not copied to D1 automatically.

## Important before real use
This is a functional starter project, not a certified banking or accounting system.
- Deploy only over HTTPS.
- Use a strong, private JWT secret and admin password.
- Back up the `data/` directory regularly and test restoring backups.
- Restrict access to authorized administrators.
- Have the organization's rules, receipts, approval process, audit trail, privacy notice and financial controls reviewed before recording real member money.
- Do not expose the SQLite database or `.env` file publicly.
- For multiple server instances or larger scale, move to PostgreSQL and managed session/auth infrastructure.
- Members are created by an administrator; share their login details securely and ask them to change temporary passwords (password-change workflow should be added before production use).

## Current limitations
- No online payment gateway or automatic bKash/Nagad verification.
- No automated SMS/email reminders.
- Password recovery requires SMTP configuration; there is no SMS fallback or member self-registration.
- No editing/reversal workflow for payment mistakes; administrator can delete a payment, so maintain independent backups and approval records.
- No downloadable PDF receipt yet.
