# Accrynt · v0.7

A personal, local-first finance workspace built with **Vue 3 + Vite + TypeScript + SCSS + Pinia + Vue Router + Dexie/IndexedDB + Zod**. The Carbon × Glacier identity, full-viewport workspace, six sections, and right desktop rail are preserved. There is no account system or backend.

## Run locally

Use Node.js **22.12+ within the 22.x line, or 24+**, and npm. From an authenticated clone:

```bash
git clone https://github.com/PocketKrow/Accrynt.git
cd Accrynt
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173`. The committed lockfile makes `npm ci` reproducible.

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

Browser checks use production builds, disposable profiles, and synthetic fixtures:

```bash
npx playwright install chromium firefox
npm run build
npm run test:e2e
```

Playwright may need system libraries. Its `install --with-deps` option supports its documented Linux distributions; CI uses Ubuntu. `ACCRYNT_CHROMIUM_PATH` optionally selects an existing Chromium executable for local tests and does not affect the app.

## What v0.7 adds

- A **Download raw recovery** action on the storage-error screen reads the existing native database without running an upgrade. It can preserve legacy rows after an aborted migration even when Settings cannot open. The file is unvalidated and needs manual repair; it cannot bypass browser restrictions or restore evicted data.
- **Copy previous month** previews an explicit choice to replace additional expected income. Existing income, including zero, is kept by default; opening cash is always kept. Paid marks reset on copied bills, and recurring snapshots remain separate.
- Updating the offline app asks before discarding an open dialog or inline form. Cancel keeps the form open; drafts are not persisted automatically.
- Compact debt estimates retain reference dates and methods, with details and historical paid-off payment terms available on demand. Plan and cash labels, scheduled-income navigation, cross-month payment cues, receipt timestamps and partial-period reports are clearer.

This main-targeted continuation includes the previously reviewed v0.6 work. Publishing the PR does not itself update main or deploy the app. See [v0.7 review decisions and verification](docs/QA-review-v0.7.md).

## What v0.4 adds

- **Record payment once:** review the amount and interest/principal split, then confirm one Ledger entry, a debt balance update, and the linked bill's resulting payment status.
- **Partial payments and undo:** bill status and remaining amounts derive from linked recorded outflow. Connected payments retain immutable split receipts and use a dedicated undo operation.
- **Available-money Overview:** enter start-of-month opening cash, then see recorded available money and what remains after outstanding commitments. Expected income stays separate from received deposits.
- **Monthly recurring bills and income:** define an amount, optional day, month range, and optional debt link. Each visited eligible month generates one entry per rule; income stays expected until recorded as received.
- **Individual-month changes:** edit generated bills normally, adjust/skip/restore a month's expected income, and pause future generation without rewriting existing plans.
- **Extra-payment comparisons:** explore a custom monthly increase or $25/$50/$100 presets to see payoff time and interest savings under the same forecast assumptions.
- **Less competing information:** Overview emphasizes money and next actions; budget breakdowns, recurring settings, payment receipts, and debt schedules expand when needed.

## Everyday workflow

1. In **Overview**, set the opening balance for the beginning of the selected month. Include only the accounts you intend to track. Negative and zero opening balances are supported; blank means unknown.
2. In **Monthly Plan**, add bills and expected income. Use the recurring section for monthly definitions. Additional expected income is entered separately from scheduled income to avoid counting it twice.
3. When income arrives, use **Record receipt** or add an income transaction in **Ledger**. Expected income never creates a deposit automatically.
4. When you pay a bill or debt, use **Record payment** from Overview, Monthly Plan, or Debts. Check the interest allocation, then confirm. The bill can become partially paid or paid according to total linked outflow.
5. Reconcile saved debt balances with statements for new charges, fees, or adjustments. Use **Settings** to export backups regularly.

The manual paid checkbox remains for payments tracked elsewhere. It only records your confirmation and does not create outflow. A bill covered by recorded payments cannot be unchecked; correct or undo its Ledger entries instead.

## Financial rules

- **Expected income** is additional monthly income plus non-skipped recurring income snapshots. It is a plan, not received money.
- **Planned outflow** includes all monthly obligations. **Unallocated** is expected income minus planned outflow, separate from available cash.
- **Actual outflow** counts recorded expense and debt-payment transactions once. **Actual net** is recorded income less recorded outflow.
- **Tracked available** is opening cash plus income received minus outflow, using entries in that month dated through today. Without an opening balance it is unknown, not zero.
- **After outstanding bills** subtracts only unpaid bill remainders from tracked available. Linked payments can come from another month and reduce that obligation's remainder, while cash outflow belongs to the transaction's own month.
- Future-dated Ledger entries are excluded from available money until their date. Confirmed payment actions reject future dates.
- A manual paid confirmation stops reserving a bill but does not reduce tracked cash. Enter missing transactions to keep cash estimates accurate. No bank balance is verified by Accrynt.
- Payment principal is the confirmed amount minus interest paid. By default saved debt balance decreases by principal. If the saved statement balance already includes this interest, check that option: the full payment reduces the balance while the principal/interest split remains accurate. Accrynt does not automatically accrue unpaid interest or fees.
- All payment effects commit together or roll back together. Repeated saves of the same request apply once. A changed debt or bill invalidates an open payment form.
- Connected payments are corrected by undoing and recording again. Undo requires newer balance events on that debt to be undone first and the debt balance to match the receipt's closing balance. Reverse later statement adjustments from debt history before undoing earlier payments. If the original debt was deleted, undo only removes the Ledger entry and refreshes any remaining bill link.
- Ordinary Ledger transactions retain their editor. A generic debt-payment entry records outflow only; use Record payment to apply principal as well.
- Money uses integer cents and annual rates use integer thousandths of one percent (6.125% = 6125). Valid older zero-value Ledger history remains restorable; new money movements must be positive.

## Recurrence behavior

Recurring items are **monthly plan definitions**, not background money movements. A month is generated when opened in the app, including offline. Deterministic occurrence keys and an IndexedDB transaction prevent duplicate generation across reloads or tabs. Days beyond the month's length use its last day.

Use **Repeat monthly** on an existing bill to adopt that entry without duplicating it. Adding a new bill rule with the same name in its start month is rejected with a pointer to this action. Existing monthly entries are snapshots. Editing or pausing a rule affects months not generated yet; already generated months retain their edits. Deleting a generated bill leaves a skipped occurrence so it does not return on reload. Income can be edited, skipped, and restored for one month. Previous-month copy adds non-recurring bills alongside generated bills without duplicating recurrence. Existing additional income (including zero) stays unless replacement is explicitly selected; a new month can preselect previous additional income. It does not carry opening cash forward.

## Debt forecasts

Use card APR for credit cards and annual interest rate for loans; loan APR may include fees. Forecasts apply `balance × annual rate ÷ 12`, rounded half up to cents before each fixed monthly payment. The final payment is capped at the amount owed. Blank payment uses the saved minimum, held constant; explicit zero means no payment. Missing rates mean unknown; enter 0 for interest-free accounts.

Payoff is a count of monthly payments, not a calendar date. Projections stop at 1,200 months and withhold incomplete lifetime totals. Payoff remains a nominal monthly planning model. A separate date-aware estimate supports completed monthly periods or explicitly selected simple daily 365/360 models. Neither changes saved balances. Variable rates, lender grace periods, changing minimums and lender-specific daily balances remain outside the model. Comparing an extra payment does not change your saved payment plan. See [debt calculation evidence](docs/QA-debt-interest.md).

## Data and recovery

Records remain in IndexedDB **`accrynt-local-v1`**, now at Dexie schema version **4**. Its name is unchanged. The v4 upgrade preserves balances and receipt splits, converts legacy basis-point rates exactly (×10), adds unknown balance reference dates and creates a balance-event table. Historical Dexie versions 1–3 are unchanged. Stored data belongs to the exact origin and browser profile: domains, ports, `localhost`, `127.0.0.1`, and different browsers have separate stores. Only theme preference uses `localStorage`.

**Settings → Download JSON backup** exports all seven tables using `accrynt-portable` schema **5**, including receipts, opening balances, rules, skipped entries, and monthly snapshots. Strict v1/v2/v3/v4 backups remain supported with neutral defaults for new fields. Old app releases cannot restore v5 exports. Restore validates IDs, references, receipt arithmetic, and recurrence keys before atomic replacement. The file picker has a 15 MB limit. Backups are unencrypted.

Browser data clearing, profile removal, or eviction can remove records. Persistent-storage permission may be declined and does not replace external backups. A storage error offers Retry and a separate native raw-recovery download without clearing records. Native recovery includes the actual database version and all existing stores in a `tables` object; it does not validate, migrate or repair them. Native version 30 means Dexie v3, and 40 means Dexie v4. Both this envelope and the existing Settings raw envelope are deliberately rejected by portable import. Browser-denied storage remains inaccessible, and raw JSON is intended for the app’s JSON-compatible records. Selected month starts at the current month on launch; historical plans remain accessible. Optional historical example data loads only on request into a completely empty workspace.

## Offline operation and validation

A production app visited online can reload offline after its service worker activates and controls a subsequent navigation. Updates use a user-controlled reload prompt, with an additional discard confirmation when a dialog form or inline editor is open. This checks for an open form rather than tracking whether individual fields changed. It does not protect against an ordinary browser reload or navigation. `npm run dev` is not the offline verification target.

GitHub Actions checks types, unit/storage tests, the production build, and Chromium/Firefox browser workflows. Detailed contracts and verification are in [docs/QA-connected-workflow.md](docs/QA-connected-workflow.md). Earlier [v0.2 evidence](docs/QA-v0.2.md) and [v0.3 debt evidence](docs/QA-debt-interest.md) document those releases.

There is no bank syncing, server, cloud account, analytics, structured account-transfer system, encrypted backup, or Tauri/Rust build. Domain rules remain separate from storage for a future Tauri 2/SQLite adapter.

## Interactive synthetic demo

Run `npm ci`, `npm run build`, then `npm run preview`. Open `http://localhost:4173/?demo=1#/` (or choose **Try demo** in the app). The ordinary workspace remains at `/#/`.

The demo runs the same forms, calculations, repository and IndexedDB writes as the app. Its separate `accrynt-demo-v1` database seeds six months of fictional history once, persists edits across reloads, and supports a confirmed **Reset demo** with negative-cash, near-payoff and February scenarios. **Return to my workspace** performs full navigation back to `accrynt-local-v1`; it does not copy or clear personal records. Demo backups carry a `DEMO-SYNTHETIC` filename and synthetic-workspace metadata. Theme preferences are separate.

Offline use requires one successful online load and an installed service worker. Browser storage is profile/origin specific; backups are still necessary. No backend or telemetry is involved. See `docs/IMPLEMENTATION-REVIEW.md` for audit decisions, date semantics and staged migration notes.

The wide-screen workbench adds an Overview commitments column and Ledger receipt inspector. In Ledger choose **All time**, filter by type, and **Export CSV** for the visible results. CSV quotes every field and neutralizes spreadsheet formula prefixes in user-entered text. Reports offers 3/6/12-month views based on saved plans and dated entries; **No records** means unknown, not zero. Playwright captures all six pages in both themes for desktop/mobile review; CI publishes these in `playwright-review-evidence`.


## Debt balances, adjustments and v4 recovery

Set a balance reference date and estimate method in the debt editor for automatically recomputed, clearly labeled unposted-interest and present-balance estimates. An unknown reference date or rate stays unknown. The monthly payoff forecast is separate from the selected dated-accrual model.

**Adjust balance** records statement matching, fees, charges or refunds without implying cash movement. Nominal monthly interest posting has a rate/period/amount confirmation and a deterministic per-debt/month key; it refuses a second period posting or a month already containing interest-bearing payments. It cannot tell whether an external lender has already included interest: review your statement before confirming. Daily estimates are display-only. No automatic posting is enabled.

Changing a balance/reference date in the debt editor also records a statement event. **Balance adjustment history** reverses only the latest active event when its after-balance still matches. Reversal history is retained; a reversed interest period cannot be posted again—use an actual statement adjustment for corrections. Payments recorded after posted interest suggest the already-in-balance option and only the unallocated posted amount. Subsequent payments without an explicit posting require manual interest review rather than assuming another full monthly charge.

Restore previews record counts, provenance and export age, warns when newer local records exist, and initiates a current recovery download before replacement or clearing. Keep that file outside the browser. v1–v4 imports remain supported; new v5 exports require the updated app. Database upgrades are forward-only: export a backup before upgrading, and use the updated app for recovery rather than opening a migrated profile in an older release. See [accounting contract](docs/ADR-0001-debt-accounting.md) and [implementation review](docs/IMPLEMENTATION-REVIEW.md).

**Reports → Export report CSV** exports the selected 3/6/12-month view. Unknown values remain blank. See [v0.5 verification](docs/QA-v0.5.md) for the migration fixtures, responsive matrix and browser evidence.

## Production continuation

Scheduled income now shows received/partial/remaining totals derived from explicitly linked Ledger deposits. Record receipt selects its plan entry; use Ledger → Edit → Scheduled income link to reconcile existing deposits. Generic income stays unlinked until selected. Partial, multiple and extra receipts are supported; future-dated deposits stay scheduled. Skipping a plan does not delete receipts. Receiving income never changes expected income. Edit additional income changes only the additional part of the plan.

Native Dexie remains v4 with an optional transaction link and no automatic record rewrite. Portable v5 preserves links; v1–v4 imports remain supported. Older builds must not edit linked records; preserve a pre-update export for rollback. See [ADR 0002](docs/ADR-0002-income-receipts.md).

A recurring-generation error keeps the Ledger live and flags incomplete plan totals until explicit retry. Invalid current data can be preserved as a clearly labelled raw recovery file; this is not an importable portable backup and requires manual repair. Recovery downloads are initiated, not guaranteed saved to disk. Cross-workspace restore warns before replacing personal/demo data.

Payment forms show prior-cycle posted interest, allocation context and reference-date changes. Later statement/refund events make allocation uncertain and require manual review. All splits remain user-confirmed. Direct balance edits retain the chosen date and now show a warning when it is unchanged. No estimates are automatically posted.

Overview shows capped-list scope and separates other-month upcoming items. Ledger marks scheduled rows, Reports aligns category tracks and marks partial months, paid-off debts are compact, and both font families are locally bundled with licenses and precached offline. These presentation changes do not alter saved descriptions, balances or receipts. New synthetic demo seeds use explicit income links; existing demo records are not silently relinked.

Review and validation for this continuation are in [QA production continuation](docs/QA-production-continuation.md).
