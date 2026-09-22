# VCP Bench Adoption — Plan

Source of truth for the adoption feature. Facts below come from vancortlandt.org/bench and the VCPA
Google Form; anything marked *placeholder* is ours until VCPA confirms.

## Program facts

- Adopt an existing bench: **$3,500** (*placeholder amount, stored in config*). New-bench installs are out of scope.
- **Fixed 10-year term.** VCPA repairs the bench during the term and may relocate a plaque if a bench is removed.
- Payment online, check, or Zelle **after speaking with a VCPA rep**. Optional group fundraising. The site takes a
  request, never a payment.
- Plaque text: **max 300 characters, up to 7 lines**, no per-line limit.
- Plaque installed **6–8 weeks after full payment and final plaque text**; applicant must acknowledge this.
- 8 ft benches carry two plaques (one per side), 4 ft carry one. Bench types: World's Fair, concrete base.
- Bench ids are `<number><region letter>` (e.g. `6A`); geometry lives in `data/benches.json`.

## Deployment

- Next.js on Vercel (existing app). Route handlers in `app/api/**`, Node runtime, official `mongodb` driver.
- MongoDB Atlas (M0 free tier is enough to start; it supports the multi-document transactions we use). Vercel's
  Atlas integration injects `MONGODB_URI`. Env vars: `MONGODB_URI`, `MONGODB_DB`, `ADMIN_KEY`.
- Local dev uses the JSON file store (no MONGODB_URI) or `mongod --replSet rs0` for a real replica set.
- The database holds only what people create. Bench geometry stays in the repo until real positions exist, then
  `BENCH#` items join the same table and the map reads `/api/benches`.

## Data model — one collection `items` (single-table style: PK/SK plus index fields)

| Item | PK | SK |
|---|---|---|
| Adoption (request → adoption) | `BENCH#6A` | `SIDE#1#<ulid>` |
| Side lock (optimistic concurrency) | `BENCH#6A` | `SIDE#1` → `{ version }` |
| Pricing config | `CONFIG` | `PRICING` → `{ adoptCents: 350000 }` *placeholder* |

Indexes (`tools/create-indexes.ts`): unique `{PK, SK}`, `{GSI1PK, GSI1SK}` … `{GSI4PK, GSI4SK}` sparse, and a TTL
index on `expiresAt` (mirrored from `ttl`).

### Adoption attributes

```
id              ulid (same as the SK suffix)
benchId         "6A"
side            1 | 2            (4 ft benches only have side 1)
status          inquiry → awaiting_payment → paid → installed → cancelled
                active / expired are DERIVED from termStart / termEnd, never stored
requestedStart  "2027-04"        applicant's preferred timing, optional
termStart       "2027-05-14"     set by staff when the plaque goes on
termEnd         termStart + 10 years
donor           { name, email, phone? }      never returned publicly
honoree         "In memory of ..."           optional, public
plaque          { text }                     ≤ 300 chars, ≤ 7 lines; public once installed
amountCents     copied from CONFIG at request time
payment         { status: pending | paid | waived, method?: online | check | zelle, ref? }
fundraising     boolean          wants VCPA's group fundraising platform
acknowledgedTimelineAt   ISO timestamp of the 6–8-week acknowledgement
questions       free text from the applicant
notes           staff only
relocatedFrom   benchId, when a plaque was moved
holdExpiresAt   epoch seconds; TTL index — an `inquiry` holds a side 30 days, then auto-deletes
createdAt, updatedAt
```

Rules
- One live (non-cancelled, non-expired) adoption per side at a time.
- A renewal is a new item with `termStart = previous termEnd + 1 day`.
- Side status for the map, derived: `available` · `pending` (inquiry / awaiting_payment / paid) · `adopted` (installed,
  today ≤ termEnd). Bench status = worst of its sides; an 8 ft with one free side is `partial`.

### Indexes

- `GSI1` — `ADOPTER#<email>` → `createdAt`. Donor "my benches" and staff lookups.
- `GSI2` — constant `ADOPTION` → `status#termEnd`. One query returns every live adoption for the map.
  Plain compound index in Mongo; no partition concerns.

## API

| Route | Auth | Behaviour |
|---|---|---|
| `GET /api/adoptions` | public | All non-cancelled, non-expired adoptions: benchId, side, status, honoree, plaque (installed only), termEnd. `Cache-Control: s-maxage=60`. |
| `GET /api/benches/[id]` | public | Static bench record + adoptions per side incl. history. Feeds the bench panel. |
| `POST /api/adoptions` | public | Request a side. Body: benchId, side, donor, honoree?, plaque.text, requestedStart?, fundraising?, acknowledgedTimeline (must be true), questions?. |
| `PATCH /api/adoptions/[id]` | `x-admin-key` | Status transitions, payment method/ref, termStart, notes, relocatedFrom. |
| `DELETE /api/adoptions/[id]` | `x-admin-key` | Sets `cancelled` (soft delete). |
| `GET /api/config/pricing` | public | Placeholder amounts. |

`POST /api/adoptions` validation (hand-rolled, no schema lib): bench exists in `benches.json`; side valid for its
size; email shape; name 1–80 chars; plaque ≤ 300 chars and ≤ 7 lines; acknowledgement true.
Write path: query `BENCH#id` / `SIDE#n#` for live items → reject 409 if any → one Mongo transaction:
insert adoption (unique `{PK,SK}`) + update side lock filtered on `version = read`. Race loser gets 409.
Response 201 with the public shape of the adoption.

## Frontend

- On load fetch `/api/adoptions`; colour benches: available (type colour), partial, pending (amber), adopted (red-brown).
- Click a bench → sidebar bench panel: type, size, one row per side with plaque / honoree / term end, or **Request this side**.
- Request form mirrors the Google Form: name, email, phone (optional), honoree, plaque text with live 300-char and
  7-line counter, preferred timing, fundraising interest, 6–8-week acknowledgement, questions.
  Shows "$3,500 — VCPA will contact you to arrange payment."
- Success state: request id, what happens next, VCPA contact details.
- Section detail shows real adopted / pending / available counts; the landing stats use live numbers.

## Build order

1. `tools/create-indexes.ts` — idempotent indexes; `tools/seed.ts` — pricing item and ~60 sample adoptions.
2. `lib/db.ts` (Document client from env) and `lib/adoptions.ts` (query, free-side check, transact write,
   public shape). One assert-style check for the free-side and plaque rules.
3. Routes: `GET/POST /api/adoptions`, `GET /api/benches/[id]`, `PATCH/DELETE /api/adoptions/[id]`, `GET /api/config/pricing`.
4. Frontend: bench status colouring, bench panel, request form, live counts.
5. Vercel env vars, deploy, smoke test with curl and the admin key.

## Deferred

- Donor / staff emails (Resend, one route) once the routes work.
- Staff UI; curl with the admin key until staff need a screen.
- Payment provider; `payment.ref` is shaped to hold a Stripe `payment_intent` id.
- Real bench positions from VCPA replacing the generated `benches.json`.

## Renewal reminders and payment (added)

Data: `reminders { channels, nextReminderAt, sent[] }`, `stripeCustomerId?`, `unsubscribeToken` on the adoption;
`CONFIG / REMINDERS` holds the cadence as day offsets from `termEnd` (e.g. `[-365,-180,-90,-30,-14,0,30]`).
Index `GSI3` `REMINDER` → `nextReminderAt`.

Scheduler: Vercel Cron, daily, `GET /api/cron/reminders` guarded by `CRON_SECRET`. Query due items, conditional
update of `nextReminderAt` (skip if another run already advanced it), send per opted-in channel, append to `sent`.
Cleared when the next term is paid or the adoption is cancelled. `dryRun=1` logs instead of sending.

Channels: email via Resend with a signed one-click unsubscribe; SMS via Twilio only with explicit consent;
staff mailing export `GET /api/adoptions?expiring=90d` (admin key) for letters.

Payment, level 1 (ship first): reminder carries a Stripe Checkout link with `metadata.adoptionId`;
`POST /api/webhooks/stripe` on `checkout.session.completed` creates the renewal item (`termStart = termEnd + 1 day`),
marks it paid, clears reminders. Check / Zelle keep going through admin `PATCH`, which also stops reminders.

Payment, level 2 (only if VCPA wants it): card on file via Checkout `setup_future_usage: off_session` with an explicit
consent checkbox; day-0 cron charges off-session, failure falls back to level 1. Annual installments instead:
a Stripe Subscription with a yearly price and `cancel_at` ten years out; Stripe owns dunning and retries.

Order: cron + dry run → Resend + unsubscribe → Stripe link + webhook → SMS / card on file on request.

## Report a problem (added)

FAQ today says: email info@vancortlandt.org if something happens to your bench or plaque. The site replaces that
with a form on the bench panel, so every report is tied to a bench id and, when it applies, an adoption.

Data — same table:

| Item | PK | SK |
|---|---|---|
| Report | `BENCH#6A` | `REPORT#<ulid>` |

```
id, benchId, side?            side only when the issue is a plaque
adoptionId?                   linked automatically if the reporter's email matches a live adoption
category      damaged_bench | damaged_plaque | missing_plaque | graffiti | bench_missing | other
description   ≤ 1000 chars
photos        [ { url, key } ]   0–3 images, Vercel Blob, presigned upload, 5 MB each   (skip first pass if not needed)
reporter      { name?, email?, phone? }   optional; anonymous reports allowed
status        open → acknowledged → fixed → closed   (and `duplicate`)
staffNotes, resolvedAt, createdAt, updatedAt
```

Index: `GSI4` `REPORT#<status>` → `createdAt` — the staff queue ("all open, oldest first") in one query.

API

| Route | Auth | Behaviour |
|---|---|---|
| `POST /api/reports` | public | Validate bench id, category, description length, email shape. Rate limit 5 per IP per hour (Vercel KV or in-memory per region is enough). Emails VCPA (Resend) with the bench id, category, description, photo links and a map deep link `/?bench=6A`. Reporter gets a receipt if they left an email. |
| `GET /api/reports?status=open` | `x-admin-key` | Staff queue. |
| `PATCH /api/reports/[id]` | `x-admin-key` | Status, notes; moving to `fixed` emails the reporter and, if linked, the adopter. |
| `GET /api/benches/[id]` | public | Already exists; adds `openReports` count so the panel can show "1 open report" instead of inviting duplicates. |

Frontend: **Report a problem** button in the bench panel; the form knows the bench id, asks for category, description,
optional photo(s), optional contact. If the bench already has an open report, show it and offer "add to this report"
(a new report with `duplicateOf` set) rather than a blank form. Map: an open report shows a small warning badge on the
bench when zoomed in.

Deferred: photo upload if VCPA is happy with description-only at launch; a public "recently fixed" list.

## Admin side (added)

### Login
- Email + password. Staff records live in `CONFIG / STAFF` as `{ email, hash }` with Node's built-in `scrypt`;
  no auth library, no email dependency for getting in. Signed session cookie (HMAC, `AUTH_SECRET`), 30-day expiry.
- First admin bootstraps from `ADMIN_EMAIL` / `ADMIN_PASSWORD` on the first login; afterwards admins add colleagues
  with a temporary password from `/admin/staff`, and everyone changes their own password there. Forgotten password:
  another admin resets it. Self-service reset by email can be added once Resend is in place.
- Everything under `/admin/**` and every admin route checks the session. The `x-admin-key` header stays as a
  machine key for curl and scripts only; cron and Stripe keep their own secrets.

### Pages (`app/admin/**`, server components + the existing routes)
| Page | Shows |
|---|---|
| `/admin` | Analytics dashboard (below). |
| `/admin/requests` | Adoption queue by status; open one to move status, record payment, set term start, add notes. |
| `/admin/reports` | Report queue, oldest open first; acknowledge / fixed / closed. |
| `/admin/waivers` | Create and revoke waiver keys, see redemptions. |
| `/admin/staff` | Staff email allowlist. |

### Analytics
Computed on request from the table, no separate store. One GSI2 query (~1,000 items) plus one GSI4 query, cached
60 s. Tiles and one chart each:
- Benches: total, adopted, partial, available, pending — overall and per region.
- Requests: new this month, awaiting payment, paid but not installed, median days from request to installed.
- Money: pledged vs received (placeholder amounts), waived count and value.
- Renewals: terms ending in the next 12 months, reminders sent this month, unsubscribes.
- Reports: open, median time to fixed, by category.
- `GET /api/admin/stats` (session or admin key) returns the same JSON for exports.

### Waiver keys (one free bench)
| Item | PK | SK |
|---|---|---|
| Waiver | `WAIVER#<code>` | `META` |

```
code           12 chars, unambiguous alphabet (no 0/O/1/I), shown once at creation
label          "Rotary Club 2026", who it is for
createdBy      staff email, createdAt
expiresAt      optional, TTL
restrictTo     optional { benchId } or { region }
usedAt, usedBy adoptionId, usedByEmail     set on redemption; a key redeems exactly once
revokedAt
```

- Created in `/admin/waivers`, handed to the client by staff. The request form has an optional **Waiver code** field.
- `POST /api/adoptions` with a code: validate (exists, not used, not revoked, not expired, restriction matches), then
  redeem inside the same `TransactWriteItems` as the adoption: update waiver with `attribute_not_exists(usedAt)`.
  A second redemption attempt fails the transaction → 409. Adoption is written with `payment.status = waived`,
  `payment.method = waiver`, `amountCents = 0`, `waiverCode` recorded, and it skips `awaiting_payment` straight to `paid`.
- `GET /api/waivers/[code]/check` (public, rate limited) lets the form say "valid, covers one bench" before submit.
- Admin routes: `GET/POST /api/admin/waivers`, `DELETE /api/admin/waivers/[code]` (revoke). Codes are never listed in
  full after creation; the list shows label, status, and the last 4 characters.

Build order insert: after the public routes (step 3) and before the frontend (step 4): Auth.js + allowlist → admin
requests/reports pages (they reuse the PATCH routes) → waivers → dashboard.
