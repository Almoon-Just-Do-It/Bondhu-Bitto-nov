# BonDhu Bitto — Visual / UI Map

Scope: the single-page UI in `public/index.html` (markup, inline CSS, inline JS). Static assets are in `public/image/`. Sections are `<section>` elements toggled by `showPage()`; role-specific elements carry `.adminnav` or `.membernav` and are toggled by `showApp()`.

## 1. Application shell

### 1.1 Desktop shell (≥ 901 px)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ .layout (flex)                                                                 │
│ ┌───────────────────┐ ┌──────────────────────────────────────────────────────┐ │
│ │ .side (sticky)    │ │ .main (max-width 1580px, padded)                     │ │
│ │ 240–264px         │ │ ┌──────────────────────────────────────────────────┐ │ │
│ │                   │ │ │ .top (sticky, glass)  [☰ hidden on desktop]      │ │ │
│ │ [logo] BonDhu     │ │ │ ADMIN PANEL / OVERVIEW  or  MEMBER PORTAL / OVERVIEW │ │ │
│ │        Bitto      │ │ │ Admin Panel Overview    Member Overview  · Logout   │ │ │
│ │ WORKSPACE         │ │ └──────────────────────────────────────────────────┘ │ │
│ │ ▦ Overview        │ │ ┌──────────────────────────────────────────────────┐ │ │
│ │ ♙ Members   (A)   │ │ │ .hero   “Save together. Grow together.”          │ │ │
│ │ ৳ Kisti     (A)   │ │ │         [＋ Record kisti] (A) / no CTA (M)        │ │ │
│ │   My kisti  (M)   │ │ └──────────────────────────────────────────────────┘ │ │
│ │ ◉ Profile         │ │ [#profileOverview card — member only, moved here]  │ │
│ │ ▤ Member Ledger(A)│ │ ┌─────────┬─────────┬─────────┬─────────┐          │ │
│ │ ▧ Notice board    │ │ │ .stat×4: total / members / this-month / average │ │ │
│ │ ! Emergency (M)   │ │ └─────────┴─────────┴─────────┴─────────┘          │ │
│ │ ! Emergency inbox │ │ ┌──────────────────────────┬─────────────────────┐ │ │
│ │              (A)   │ │ │ .panel (tables/forms)    │ .panel (promise)    │ │ │
│ │ ◷ Activity log(A) │ │ └──────────────────────────┴─────────────────────┘ │ │
│ │ ▤ Reports   (A)    │ │                                                    │ │
│ │ ┌ motto card ┐     │ │ footer: © <year> BonDhu Bitto                      │ │
│ └───────────────────┘ └──────────────────────────────────────────────────────┘ │
│ floating bottom-right: [ ? Ask ] [ WhatsApp (shown when configured) ]        │
└────────────────────────────────────────────────────────────────────────────────┘
```

`(A)` = admin only, `(M)` = member only. Nav order as rendered: Overview, Members, Kisti records / My kisti, Profile, Member Ledger, Notice board, Emergency / Emergency inbox, Activity log, Reports. The side bar is `position: sticky` with its own scroll; the top bar is sticky inside `.main`. Every successful login and restored session returns to `#overviewPage` with Overview active and a role-specific heading; logout clears all password inputs immediately.

### 1.2 Mobile shell (≤ 900 px)

```
┌───────────────────────────────┐
│ .top (sticky, wraps)          │
│ [☰] ADMIN / MEMBER OVERVIEW   │
│ Admin Panel / Member Overview │
│ Account · Logout              │
├───────────────────────────────┤
│ .hero (column, CTA full width)│
│ #profileOverview (member)     │
│ .stats (2 cols; 1 col ≤ 420)  │
│ .grid → single column         │
│ panels / .tablewrap scroll-x  │
│ footer                        │
├───────────────────────────────┤
│ fixed [? Ask] [WhatsApp] ↘    │
└───────────────────────────────┘

When body.nav-open:
┌──────────────────────┬────────┐
│ .side drawer         │ .nav-  │
│ min(290px, 86vw)     │ scrim  │
│ full nav + motto     │ (dark) │
│ slide from left      │        │
└──────────────────────┴────────┘
```

The hamburger lives in `.top`; the scrim, nav buttons, Logout, Escape and resize > 900 px close the drawer. Side/hero videos are hidden on small screens and when `prefers-reduced-motion` is set.

### 1.3 Login / forgot / reset screens

All three are `<form class="login">` cards inside `#loginView .loginwrap`; only one is visible via `showAuthForm()`.

```
              LOGIN (#loginForm)
        ┌───────────────────────────────┐
        │ [logo] BonDhu Bitto           │
        │ SAVINGS COMMUNITY             │
        │ Welcome                       │
        │ Sign in to your community     │
        │ savings account.              │
        │ [loginError — hidden message] │
        │ Email address      [ input ]  │
        │ Password           [ input ]  │
        │ [ Sign in ]                   │
        │ [ Forgot password? ]          │
        │ sub: accounts created by admin│
        │      sessions end after 20 min│
        └───────────────────────────────┘

              FORGOT (#forgotForm)
        ┌───────────────────────────────┐
        │ Forgot password?              │
        │ Enter the valid email address │
        │ on your account ...           │
        │ [forgotMessage — hidden]      │
        │ Email address      [ input ]  │
        │ [ Send reset link ]           │
        │ [ Back to sign in ]           │
        └───────────────────────────────┘

              RESET (#resetPasswordForm)  ← opened via ?reset=<token>
        ┌───────────────────────────────┐
        │ Set a new password            │
        │ Any password up to 128 chars │
        │ (non-empty)                   │
        │ [resetMessage — hidden]       │
        │ New password       [ input ]  │
        │ Confirm password   [ input ]  │
        │ [ Save new password ]         │
        │ [ Back to sign in ]           │
        └───────────────────────────────┘
```

## 2. Role-based views

| Area / control | Admin | Member | Mechanism |
| --- | --- | --- | --- |
| Sign in | Yes | Yes | Shared login form |
| Overview | Yes | Yes | `.stats` labels and values differ (see §4.1) |
| Profile overview card on dashboard | Hidden | Shown | `#profileOverview` toggled in `showPage()` / `showApp()` |
| Members (create, activate/deactivate, view profile, reset password) | Yes | Hidden | `.adminnav` |
| Kisti records / My kisti | “Kisti records” | “My kisti” | `.adminnav` / `.membernav` labels in one nav button |
| Record Monthly Kisti | Select any active member | No member picker; records own payment | `#paymentMember` is `.adminnav`; description text changes |
| Payment history actions & Member column | View / Approve / Edit / Delete + Member column | Own rows only; no Member column or Actions | `.adminnav`, `.paymentActions` |
| Member Ledger | Yes | Hidden | `.adminnav` nav + page |
| Notice board (read, full-size image viewer) | Yes | Yes | Shared page; `.attachment-open` → `#attachmentLightbox` |
| Post / delete notice | Yes | Hidden | `.adminnav` form / delete button |
| Emergency inbox and reply composer | Yes | Hidden | `.adminnav` nav + panel |
| Emergency message composer and admin reply list | Hidden | Yes | `.membernav` nav + panels |
| Reports / Export CSV | Yes | Hidden | `.adminnav` nav + page |
| Activity log | Yes | Hidden | `.adminnav` nav + page; `/api/activity-log` is admin-only |
| Ask assistant | Yes | Yes | `.quick-actions` shown after login; role-aware answers, branded chat panel, and mobile bottom sheet |
| WhatsApp shortcut | Yes (when configured) | Yes (when configured) | `/api/contact-info` controls visibility |

Idle sessions expire after 20 minutes of inactivity; activity refreshes the session via `/api/me` about every 5 minutes.

## 3. Navigation flow

```
                         start()
                            │
             ┌──────────────┴───────────────┐
             │ ?reset token present         │ no token
             ▼                              ▼
   #resetPasswordForm              GET /api/me ── 200 ──► showApp() ──► loadAll()
             │                                  │
   /api/password/reset                          └── 401 / failure ──► #loginForm
             │
   clear token → #loginForm ── POST /api/login ──► showApp() ──► loadAll()
                                                        │
   showApp(): toggle .adminnav/.membernav, show .quick-actions,
              set name / A/C label, start idle timer, sync videos
                                                        │
    loadAll(): /api/dashboard, /api/payments, /api/profile, /api/notices,
               /api/contact-info
               admin only: /api/members, /api/members/:id/ledger (if selected),
                           /api/emergency
               member only: /api/emergency/member
                                                         │
    nav click ──► showPage(page) ──► one section visible, button .active,
                                    refresh notices / emergency inbox / replies as needed
                                                        │
   #who button ──► showPage('profile')       hero “＋ Record kisti” ──► payments
   Logout / idle timeout / 401 ──► expireSession() ──► #loginForm
```

## 4. Screen-by-screen map

### 4.1 Overview (`#overviewPage`)

```
┌ .stats ─────────────┬────────────┬────────────┬────────────┐
│ Total savings       │ Members    │ This month’s│ Average    │
│  (my total savings) │ (community)│ collection │ savings/mbr│
└─────────────────────┴────────────┴────────────┴────────────┘
┌ .panel (admin) “Member profile completion” ────────────────┐
│ Member | profile completion (progress + %) | Active badge  │
│ scrollable tablewrap (max-height 340px)                    │
└─────────────────────────────────────────────────────────────┘
┌ .grid ─────────────────────────────┬─────────────────────────┐
│ “Recent contributions” / “Recent  │ “Community promise”     │
│  Kisti” table (latest 8 approved) │  tappable photo + note  │
└────────────────────────────────────┴─────────────────────────┘
```

Admin sees totals across all recorded contributions; member sees own lifetime savings, community total, community member count, and the same community-wide average savings per active member. The profile overview card (photo, name, email, father, mother, nominee, NIDs) sits directly under the hero for members. The Community promise photo opens a full-screen viewer by mouse click or tap, with zoom controls, drag-to-pan, backdrop/Esc close, and focus return.

### 4.2 Members (`#membersPage`, admin)

```
┌ panel “Community members” ────────────────────────────────────────────────┐
│ #memberForm: Full name* | Email* | Phone | Temporary password*            │
│              [ Add member account ]   #memberMessage                     │
├───────────────────────────────────────────────────────────────────────────┤
│ #memberRows table: Member (name + A/C) | Email | Phone | Total saved |    │
│ Account status | Profile [View] | Action [Reset password] [Deactivate / Activate] │
└───────────────────────────────────────────────────────────────────────────┘
```

`View` opens the member profile dialog (§5.2). `Reset password` opens the password reset dialog (§5.4). New accounts get an A/C number shown in the status message.

### 4.3 Kisti records / My kisti (`#paymentsPage`)

```
┌ .grid ────────────────────────────────┬──────────────────────────────────┐
│ panel “Record Monthly Kisti”          │ panel #paymentHistoryPanel       │
│ (admin: Member* picker)               │ “Monthly Kisti History” [Print]  │
│ Amount (BDT)* | For month*            │ ┌ .payment-filters ────────────┐ │
│ Payment date* | Payment method        │ │ Month [All months ▾]         │ │
│ Reference / transaction ID            │ │ Status [All statuses ▾]      │ │
│ Note                                  │ │ Search [text]                │ │
│ [ Save payment record ]               │ │ Showing N of M records  Clear│ │
│ [ Cancel edit ] (edit mode only)      │ └──────────────────────────────┘ │
│ #paymentMessage                       │ ┌ .payment-history-scroll ─────┐ │
│                                       │ │ sticky header + rows, scroll│ │
│                                       │ └──────────────────────────────┘ │
└───────────────────────────────────────┴──────────────────────────────────┘
```

Payment methods: Cash, bKash, Nagad, Bank transfer, Other. Member submissions are Pending until approved by an admin; admin submissions count immediately. Edit reuses the form with “Update payment record” + “Cancel edit”; delete uses a browser confirm.

**Monthly Kisti History — filter bar and scroll container (current implementation)**

| Element | Behavior |
| --- | --- |
| Month (`#paymentMonthFilter`) | Populated from distinct kisti months in loaded payments, newest first; “All months” default |
| Status (`#paymentStatusFilter`) | All statuses / Approved / Pending |
| Search (`#paymentSearch`) | Case-insensitive match on member name, email, phone, month, paid date, method, reference, note, status |
| Result count (`#paymentFilterCount`) | “Showing N of M record(s)”, `aria-live="polite"` |
| Clear (`#clearPaymentFilters`) | Resets month, status and search, then re-renders |
| `.payment-history-scroll` | Fixed-height viewport: `max-height: clamp(300px, 55vh, 540px)`, `overflow: auto`, `overscroll-behavior: contain`, `scrollbar-gutter: stable`; table `min-width: 780px` so columns do not collapse |
| Sticky header | `.payment-history-scroll thead th { position: sticky; top: 0; z-index: 3 }` |
| Print | `.payment-filters { display: none !important }`; scroll container becomes `max-height: none; overflow: visible`, so the whole table expands onto the printout |

### 4.4 Member individual details ledger (`#memberLedgerPage`, admin)

```
┌ panel “Member Kisti Records” ────────────────────────────────────────────┐
│ Select member [ <name> — <A/C or No A/C> ▾ ]                             │
└──────────────────────────────────────────────────────────────────────────┘
┌ #memberLedgerPrint (hidden until a member is chosen) ───────────────────┐
│ <name> — Kisti Ledger | A/C No | [ Print Details ]                      │
│ Date / Time (print-only meta)                                            │
│ “Monthly Kisti History” table: Month | Paid date | Amount | Method |    │
│ Reference | Note | Status                                                │
└──────────────────────────────────────────────────────────────────────────┘
```

Selecting a member fetches `/api/members/:id/ledger` and unhides the table container. The `.ledger-summary` block exists in markup but is hidden at runtime, so its contact, NID, and total fields are not displayed on screen or in print.

### 4.5 My Profile (`#profilePage`)

```
┌ panel “My profile” ─────────────────────────────────────────────────────┐
│ [photo / initials] Profile photo [choose file]      [ Edit profile ]    │
│ Full name* | Email (readonly) | Father's name | Mother's name          │
│ Nominee's name                                                          │
│ ─ NID information ─                                                    │
│ My NID number | Nominee NID number                                      │
│ My NID card image [preview/remove] | Nominee NID card image [...]      │
│ My signature [preview/upload/draw] | Nominee signature [preview/upload/draw] │
│ [ Save profile ]  #profileMessage                                       │
├──────────────────────────────────────────────────────────────────────────┤
│ #profileOverview (rendered on the dashboard, not here at runtime)       │
└──────────────────────────────────────────────────────────────────────────┘
```

Fields are disabled until “Edit profile”; “Cancel edit” discards pending images and reloads the profile. Images are converted to JPEG and size-reduced client-side before saving. Own and nominee signatures can be uploaded or drawn in a touch/mouse signature pad; drawing pads crop the ink to a white JPEG and attach it to the pending profile before saving.

### 4.6 Reports / CSV (`#reportsPage`, admin)

```
┌ panel “Financial records” ───────────────────────────────┐
│ Download the full contribution ledger as CSV. [Export CSV]│
│ message: exports contain contact + financial records      │
└───────────────────────────────────────────────────────────┘
```

`Export CSV` navigates to `/api/report.csv`. There is no on-screen report table.

### 4.7 Notices (`#noticesPage`)

```
┌ panel “Post a notice” (admin) ───────────────┐
│ Title* | Notice (textarea)                   │
│ Image (optional) | File (PDF/DOC/DOCX/TXT)   │
│ [ Publish notice ] #noticeMessage            │
└───────────────────────────────────────────────┘
┌ panel “Notice board” (all roles) ────────────┐
│ ┌ .notice-item card, gradient accent ─────┐ │
│ │ timestamp kicker | Title | Notice badge │ │
│ │ Posted by <name> | body (pre-wrapped)   │ │
│ │ [image: tap to enlarge] [↓ file]        │ │
│ │ [Delete] (admin only)                   │ │
│ └──────────────────────────────────────────┘ │
│ ... or “No notices posted yet.”              │
└───────────────────────────────────────────────┘
                       │
                       ▼
              #attachmentLightbox
       full-screen image with zoom, pan,
       backdrop/Esc close, and focus return
```

### 4.8 Emergency inbox / widget (`#emergencyPage`)

```
MEMBER                                   ADMIN
┌ “Emergency message” ───────────┐      ┌ “Emergency inbox” ──────────────┐
│ Send an urgent message ...      │      │ #emergencyInboxMessage          │
│ Message (textarea)              │      │ ┌ .notice-item ───────────────┐ │
│ Image (optional) | File (...)   │      │ │ name + A/C | email · phone ·│ │
│ [ Send to admin ]               │      │ │ timestamp | New/Resolved    │ │
└─────────────────────────────────┘      │ │ body, image, file download  │ │
┌ “Replies to my messages” ───────┐      │ │ existing feedback (if any)  │ │
│ #emergencyRepliesList           │      │ │ [feedback textarea]         │ │
│ feedback cards from admin       │      │ │ [ Send feedback ]           │ │
└─────────────────────────────────┘      │ │ [ Mark resolved ]           │ │
                                          │ └─────────────────────────────┘ │
                                          └─────────────────────────────────┘
```

### 4.9 Ask assistant (`.quick-actions`)

```
                     ┌ #askWidget ─────────────────────────┐
                     │ ?  Ask BonDhu Bitto       [ × ]     │
                     │    Instant help for members         │
                     │ [Kisti amount] [Payment status] ... │
                     │ ┌ #askMessages (scrollable) ─────┐ │
                     │ │ Welcome to BonDhu Bitto Samiti│ │
                     │ │       <user bubble>           │ │
                     │ │ <welcome + matched guidance>   │ │
                     │ └────────────────────────────────┘ │
                     │ [ Type your question ] [ Ask ]     │
                     └────────────────────────────────────┘
[ ? Ask ] [ WhatsApp ]  ← fixed pills, bottom-right of viewport
```

`Ask` toggles a branded chat panel with a suggested-question row, visually distinct user/bot bubbles, large touch targets, and a scrollable conversation area. On mobile it becomes a bottom sheet with a dimming scrim; the close button, scrim, or Escape closes it. Every reply begins with the BonDhu Bitto Samiti welcome. Questions are matched locally to guidance about Kisti amount (৳1,000), late fine (৳200 per 20 days), bKash 01735011844 with the ৳20 Send Money charge, checking totals/status through the WhatsApp Group and website Overview, submitting payments through My Kisti, plus profile/NID/nominee/signature, notices, emergency, and A/C number. Closing phrases such as thanks or bye return the friendly closing message. No network call is made by the assistant.

### 4.10 WhatsApp shortcut

`#whatsappShortcut` is a fixed pill next to `Ask`. It is hidden until `/api/contact-info` returns a configured number, then becomes an `https://wa.me/...` link with a prefilled greeting and `target="_blank" rel="noopener noreferrer"`.

### 4.11 Activity log (`#activityLogPage`)

```
┌ panel “Activity log” ────────────────────────────────────────────────────────┐
│ [Refresh]                                                                  │
│ ┌ .audit-filters ────────────────────────────────────────────────────────┐ │
│ │ User | Action | Area | Result | From | To | Search                    │ │
│ │ [Clear filters]                                                        │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│ [total events] [today] [failed] [users] [Showing X of Y]                  │
│ ┌ .tablewrap (max-height 560px, sticky page table styling) ─────────────┐ │
│ │ Time | User | Role | Action | Area | Target | Result | Details | Source│ │
│ │ ... server-side audit records, newest first ...                       │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

The `Activity log` nav item and page are administrator-only; members have no activity-log nav item and receive `403` from `GET /api/activity-log`. Administrators can filter by any actor. Filters are sent to `GET /api/activity-log`, the result summary uses `aria-live="polite"`, and details render as escaped key/value text with nested JSON where applicable.

## 5. Dialogs

### 5.1 Payment detail (`#paymentDetailDialog`)

Admin only; opened by “View” on a Pending row in Monthly Kisti History.

```
┌ dialog: Payment submission ────────────────────────────────┐
│ Payment submission | Pending admin approval / Approved    │
│                                             [ Close ]     │
│ Member      | Email        | Phone                        │
│ Amount      | Kisti month  | Paid date                    │
│ Payment method | Reference | Note | Submitted at          │
│ [ Approve payment ]  (only while Pending)                 │
└────────────────────────────────────────────────────────────┘
```

Approving from the dialog calls the same endpoint as the row action, reloads data and closes the dialog.

### 5.2 Member profile (`#memberProfileDialog`)

Admin only; opened by “View” in the Members table.

```
┌ dialog: Member profile ────────────────────────────────────────────┐
│ Member profile | View member details. Select Edit ...             │
│                          [ Print profile ] [ Close ]              │
│ Full name* | Email* | Phone | Father's name | Mother's name       │
│ Nominee's name | Member NID | Nominee NID                         │
│ Profile photo [preview/upload/remove]                             │
│ Member NID image [...] | Nominee NID image [...]                  │
│ Member signature [upload/draw] | Nominee signature [upload/draw]  │
│ [ Save member changes ] [ Edit / Cancel edit ]                    │
│ #adminMemberProfileMessage                                        │
└────────────────────────────────────────────────────────────────────┘
```

Opens read-only with Save disabled; “Edit” enables fields and Save, “Cancel edit” refetches and restores the original values. “Print profile” is disabled while editing. Saving patches `/api/members/:id/profile`, closes the dialog and refreshes the dashboard.

### 5.3 Member profile print preview / flow

```
Members table [View]
        │ GET /api/members/:id/profile
        ▼
viewMemberProfile(profile)
        ├── populate dialog form + image previews
        ├── setAdminMemberEditing(false)
        └── renderMemberProfilePrint(profile) ──► hidden #memberProfilePrint
                                                  (built in the DOM, off-screen)
        │
        ▼
[Print profile] ──► update date/time ──► body.printing-member-profile
        │                                  (hides app + dialog, shows print doc)
        ▼
window.print() ──► afterprint removes body.printing-member-profile
```

The print document is generated from the same profile object shown in the dialog, so unsaved edits are not printed.

### 5.4 Reset member password (`#memberPasswordDialog`)

Admin only; opened by “Reset password” in the Members table.

```
┌ dialog: Reset member password ──────────────────────────────────┐
│ Reset member password | <member> · <email> · A/C <account no>   │
│                                                  [ Close ]     │
│ New temporary password * | Confirm new password *              │
│ #memberPasswordMessage                                         │
│ [ Reset password ]                                             │
└─────────────────────────────────────────────────────────────────┘
```

The form validates the same simple non-empty password rule used for new members, allows any characters up to 128, and checks that both entries match. Submitting calls `POST /api/members/:id/reset-password`, closes the dialog, refreshes data, and shows a status message in `#memberMessage`; the new password is never displayed after submission.

## 6. Print outputs

Printing is driven by `window.print()` plus body classes: `printing-ledger` for the member ledger, `printing-member-profile` for the 3-page profile, and neither for Monthly Kisti History. Date/time values are refreshed on `beforeprint`; all three outputs use A4 portrait (12 mm sides, 24 mm bottom) and show the logo at bottom-right.

### 6.1 Monthly Kisti History

```
┌ print header ─────────────────────────────────────────────────┐
│ BON DHU BITTO                        Date: 17 Nov 2026       │
│ Monthly Kisti History                Time: 10:42 AM          │
│ <member name or “BonDhu Bitto Administrator”>                 │
│ A/C No: ... / “Monthly kisti printout”                       │
├───────────────────────────────────────────────────────────────┤
│ Month | Paid date | Amount | Method | Reference | Note |     │
│ Status | Actions (admin)                                     │
│ ... filtered rows, full table (filter bar hidden) ...        │
├── print footer (fixed) ──────────────────────────────────────┤
│                            BonDhu Bitto   [logo]             │
└───────────────────────────────────────────────────────────────┘
```

The Print button is hidden in print; a `tfoot` spacer reserves footer space.

### 6.2 Member Ledger

```
┌ print meta (right-aligned): Date / Time ─────────────────────┐
│ <name> — Kisti Ledger      Member A/C No: ...                │
│ Monthly Kisti History table (7 columns, all rows)           │
└ print footer (fixed): BonDhu Bitto [logo] bottom-right ─────┘
```

Only `#memberLedgerPrint` is visible in `printing-ledger` mode; the Print Details button and the hidden `.ledger-summary` block do not appear.

### 6.3 Member Profile — 3 pages

```
PAGE 1 — Member Profile
┌───────────────────────────────────────────────────────────────┐
│ BON DHU BITTO                            ┌ passport photo ┐  │
│ Member Profile                           │ (35×45 mm,     │  │
│ Account No: ...                          │  top right)    │  │
│ ───────────────────────────────────────── └────────────────┘  │
│ Member name | Email | Phone | Member NID                      │
│ Father's name | Mother's name | Nominee's name | Nominee NID  │
│ ┌ Member signature ──────┐ ┌ Nominee signature ─────┐        │
│ │ image or “Not uploaded”│ │ image or “Not uploaded”│        │
│ └────────────────────────┘ └────────────────────────┘        │
└ footer: Date · Time · BonDhu Bitto · [logo] bottom-right ────┘

PAGE 2 — Member NID
┌───────────────────────────────────────────────────────────────┐
│ Member NID            NID number: ...                         │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ NID card image (contained; “No image uploaded.” if none) │ │
│ └───────────────────────────────────────────────────────────┘ │
└ footer: Date · Time · BonDhu Bitto · [logo] bottom-right ────┘

PAGE 3 — Nominee NID
┌───────────────────────────────────────────────────────────────┐
│ Nominee NID           NID number: ...                         │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Nominee NID image (contained; “No image uploaded.”)      │ │
│ └───────────────────────────────────────────────────────────┘ │
└ footer: Date · Time · BonDhu Bitto · [logo] bottom-right ────┘
```

Pages use `break-after: page` except the last. The footer is `position: fixed; right: 0; bottom: 0`, so date/time, brand text and logo repeat at the bottom-right of every page.

## 7. Responsive behavior

| Breakpoint | Behavior |
| --- | --- |
| ≥ 901 px | Sticky side bar `clamp(240px, 18vw, 264px)`, rounded, independently scrollable; `.main` max-width 1580 px; sticky top bar; hero and panels at full styling |
| ≤ 900 px | Side bar becomes an off-canvas drawer (`min(290px, 86vw)`) with scrim and hamburger; `.layout` becomes block; `.main` full width; stats 2 columns; grid 1 column; dialogs constrained to viewport; horizontal page scrolling suppressed; side/hero videos hidden |
| ≤ 650 px | Tighter padding/typography; stats 2 columns with 8 px gap; `.formgrid` 1 column; hero CTA full width; login card smaller; ledger summary 1 column; payment and activity-log filter fields stack full width with their clear buttons on their own rows; payment scroll area `max-height: 60vh`; smaller table cells |
| ≤ 420 px | Stats 1 column; smallest heading sizes |
| `prefers-reduced-motion` | Background/hero animations disabled; videos hidden or paused; transitions/animations reduced to near-zero |

Tables always live in `.tablewrap` with `overflow-x: auto` (and `-webkit-overflow-scrolling: touch`); Monthly Kisti History adds its own fixed-height scroll container.

## 8. Key style tokens

The active bKash-inspired red theme is appended as `#bkashTheme` in `public/index.html`; it overrides earlier `modernStyles`, `navStyles`, and legacy color blocks without changing layout or behavior. The effective palette is rose and deep burgundy; older teal variables remain compatibility aliases.

| Token | Value | Used for |
| --- | --- | --- |
| `--navy` / `--navy-2` | `#250510` / `#3d081d` | Deep burgundy sidebar and dark headers |
| `--bkash` / `--bkash-deep` | `#e2136e` / `#b30d58` | Primary actions, links, badges, active states |
| `--teal` / `--teal-2` | `#e2136e` / `#ff5c9f` | Compatibility aliases for older rules and accents |
| `--bg` / `--card` | `#fff7fa` / `#ffffff` | Blush page background / white card surfaces |
| `--ink` / `--muted` | `#271722` / `#7d6874` | Primary text / secondary text |
| `--line` | `#f2dbe4` | Borders, dividers |
| `--shadow-sm` / `-md` / `-lg` | `0 2px 4px…, 0 18px 44px -24px…` / `0 4px 8px…, 0 28px 64px -30px…` / `0 6px 12px…, 0 44px 100px -36px…` (rgba `67,8,33`) | Cards, hover elevation, dialogs |
| Fonts | `Space Grotesk` headings; `Manrope` body | Loaded from Google Fonts with system fallbacks |
| Radius | 12–30 px (cards 24 px, dialogs 26 px, hero 30 px, side 28 px) | Rounded surfaces |
| Navigation surfaces | Glass gradient top bar, gradient side rail, icon tiles, rose active glow, hover shimmer | Sidebar navigation, sticky header, mobile drawer |
| `.panel` / `.stat` / `.hero` | White/blush cards with pink top accents; burgundy-to-magenta hero with pink glow | Main content blocks |
| `.badge` | Rose pill (`Approved`, `Success`, `Active`) / amber variant (`Pending`) | Status display |
| `.tablewrap` | White rounded bordered container, `overflow-x: auto` | All data tables |
| `#paymentFilterCount` | Small muted bold text | Payment filter result count |
| `#activityLogSummary` | Pill row of muted metadata | Activity log totals and result count |

## 9. Accessibility notes

- Form controls use `<label>` elements; several bind via `for`/`id` (filters, profile photo, NID/signature uploads, member ledger select, notice/emergency attachments). Required fields, `maxlength`, `autocomplete` and input modes are set on auth/member/payment forms.
- `#paymentFilterCount` and `#activityLogSummary` use `aria-live="polite"` so filter changes are announced.
- Dialogs are native `<dialog>` opened with `showModal()` and closed with `close()`: the browser provides focus containment, backdrop and Escape-to-close; Close buttons are explicit. The dialogs themselves do not declare custom ARIA roles/labels.
- The mobile menu button has `aria-label="Open navigation menu"` and `aria-expanded` kept in sync; the scrim, nav selection, Logout, Escape and resize all close the drawer.
- Decorative background videos are `muted`, `aria-hidden="true"`, and removed for reduced-motion users.
- Status information is conveyed with text plus color (`Approved`/`Pending`, `Active`/`Inactive`), not color alone.
- Maintenance watch items: some inline-generated field labels are not associated via `for`/`id`, and message regions (e.g. `#paymentMessage`, `#noticeMessage`) are plain text nodes without `role="status"`/`aria-live`.
