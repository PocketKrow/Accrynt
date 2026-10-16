# Accrynt · v0.4

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
- Connected payments are corrected by undoing and recording again. Undo requires newer payments on that debt to be undone first and the debt balance to match the receipt's closing balance. Statement adjustments must be reconciled before undo. If the original debt was deleted, undo only removes the Ledger entry and refreshes any remaining bill link.
- Ordinary Ledger transactions retain their editor. A generic debt-payment entry records outflow only; use Record payment to apply principal as well.
- Money uses integer cents and annual rates use integer basis points. Valid older zero-value Ledger history remains restorable; new money movements must be positive.

## Recurrence behavior

Recurring items are **monthly plan definitions**, not background money movements. A month is generated when opened in the app, including offline. Deterministic occurrence keys and an IndexedDB transaction prevent duplicate generation across reloads or tabs. Days beyond the month's length use its last day.

Use **Repeat monthly** on an existing bill to adopt that entry without duplicating it. Adding a new bill rule with the same name in its start month is rejected with a pointer to this action. Existing monthly entries are snapshots. Editing or pausing a rule affects months not generated yet; already generated months retain their edits. Deleting a generated bill leaves a skipped occurrence so it does not return on reload. Income can be edited, skipped, and restored for one month. Previous-month copy copies additional expected income and non-recurring bills alongside generated bills without duplicating recurrence; it does not carry opening cash forward.

## Debt forecasts

Use card APR for credit cards and annual interest rate for loans; loan APR may include fees. Forecasts apply `balance × annual rate ÷ 12`, rounded half up to cents before each fixed monthly payment. The final payment is capped at the amount owed. Blank payment uses the saved minimum, held constant; explicit zero means no payment. Missing rates mean unknown; enter 0 for interest-free accounts.

Payoff is a count of monthly payments, not a calendar date. Projections stop at 1,200 months and withhold incomplete lifetime totals. Daily interest, promotional balances, changing minimums, new charges, and lender-specific reconciliation are outside the estimate. Comparing an extra payment does not change your saved payment plan. See [debt calculation evidence](docs/QA-debt-interest.md).

## Data and recovery

Records remain in IndexedDB **`accrynt-local-v1`**, now at Dexie schema version **3**. Its name is unchanged. Upgrades preserve existing records, add unknown opening cash and empty payment receipts, and create recurring-rule and recurring-occurrence tables. Stored data belongs to the exact origin and browser profile: domains, ports, `localhost`, `127.0.0.1`, and different browsers have separate stores. Only theme preference uses `localStorage`.

**Settings → Download JSON backup** exports all six tables using `accrynt-portable` schema **3**, including receipts, opening balances, rules, skipped entries, and monthly snapshots. Strict v1/v2 backups remain supported with neutral defaults for new fields. Old app releases cannot restore v3 exports. Restore validates IDs, references, receipt arithmetic, and recurrence keys before atomic replacement. The file picker has a 15 MB limit. Backups are unencrypted.

Browser data clearing, profile removal, or eviction can remove records. Persistent-storage permission may be declined and does not replace external backups. A storage error offers Retry without clearing records. Selected month starts at the current month on launch; historical plans remain accessible. Optional historical example data loads only on request into a completely empty workspace.

## Offline operation and validation

A production app visited online can reload offline after its service worker activates and controls a subsequent navigation. Updates use a user-controlled reload prompt. `npm run dev` is not the offline verification target.

GitHub Actions checks types, unit/storage tests, the production build, and Chromium/Firefox browser workflows. Detailed contracts and verification are in [docs/QA-connected-workflow.md](docs/QA-connected-workflow.md). Earlier [v0.2 evidence](docs/QA-v0.2.md) and [v0.3 debt evidence](docs/QA-debt-interest.md) document those releases.

There is no bank syncing, server, cloud account, analytics, structured account-transfer system, encrypted backup, or Tauri/Rust build. Domain rules remain separate from storage for a future Tauri 2/SQLite adapter.
