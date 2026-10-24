# Accrynt · v1 release candidate

A personal, local-first finance workspace built with **Vue 3, Vite, TypeScript, SCSS, Pinia, Vue Router, Dexie/IndexedDB and Zod**. Carbon × Glacier Refinement 02 retains the compact full-viewport workspace, geometric A identity, light/dark themes and right desktop navigation. Its six sections are Overview, Monthly Plan, Ledger, Debts, Reports and Settings. No accounts, backend, analytics or bank connection.

**1.0.0-rc.1 is a candidate, not public v1 approval.** It is a USD workspace for
manual planning and recorded money movements. Account labels are descriptive,
not separate balances or a transfer system. Physical-device, manual accessibility,
production-origin and owner-trial gates remain in the [v1 QA matrix](docs/QA-v1.md).
See [candidate changes](docs/RELEASE-NOTES-v1.md), [recovery/moving records](docs/RECOVERY.md),
[deployment checks](docs/DEPLOYMENT.md) and [security reporting](SECURITY.md).

The intended browser scope is current Chromium/Firefox desktop and Safari/iOS,
with IndexedDB and site storage enabled; production offline use needs HTTPS and a
successful initial online visit. Automated Chromium, Firefox and WebKit checks
provide engine evidence. Real Safari/iOS, phones and screen readers still need the
recorded manual checks before their v1 support claim is approved. Private/temporary
profiles are unsuitable as the only copy of durable records. No older browser
version or embedded webview support is promised.

## Run and validate

Use Node **22.12+ in the 22.x line, or 24+**, and npm:

```bash
git clone https://github.com/PocketKrow/Accrynt.git
cd Accrynt
npm ci
npm run dev
```

Vite prints the local URL, normally `http://127.0.0.1:5173`. The lockfile makes installation reproducible.

```bash
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
```

Browser workflows use production preview, disposable profiles and synthetic records. Linux browser dependencies depend on the distribution; CI uses Ubuntu. `ACCRYNT_CHROMIUM_PATH` optionally selects an existing Chromium executable for local testing. CI runs type/unit/build checks on Node 22 and 24, with the full browser suite on Node 24. The displayed app version imports package.json.

## Daily use

1. Set **opening cash** in Overview for the beginning of the selected month, across the accounts you intend to track. Blank means unknown; zero and negative cash are valid. An optional suggestion from the previous completed month's recorded closing needs explicit acceptance and Save. Historical edits never cascade into later months.
2. Add bills and expected income in **Monthly Plan**. Additional expected income is separate from recurring income snapshots. Expected income is planning, never a cash deposit.
3. When money arrives, choose **Record receipt**, or record income in **Ledger** and explicitly select its scheduled-income link. Partial, multiple and excess receipts are allowed. Existing deposits remain unlinked until selected; skipping/restoring the plan preserves cash records.
4. Use **Record payment** from Overview, Plan or Debts for a connected bill/debt payment. Confirm the amount and principal/interest split. The Ledger entry, receipt, debt balance and bill effects commit together or roll back together.
5. Use statement adjustments to reconcile saved debt balances, and download external backups regularly from **Settings**.

Ordinary transaction entry offers up to 20 recent distinct descriptions and account labels from the current workspace. Suggestions only fill the selected text field. **Save transaction** remains the default. **Save and add another** is available for new ordinary income/expense entries: it retains date/type/category/account, clears description/amount/links, generates a new request ID and focuses Description after success. Failed saves retain inputs and request ID for retry. Editing, connected payments and generic debt outflow do not offer repeat entry. Explicit bill/income links apply only to the saved entry and clear from the next draft. Native suggestion popups may consume the first Escape before the dialog can close.

## Cash and Ledger scope

**Tracked available** = opening cash + selected-month recorded income − selected-month recorded outflow, dated through the local current date. Unknown opening cash produces an unknown result, not zero. **After outstanding bills** subtracts unpaid remainders. **Still committed** is their sum. Each offers a keyboard-accessible **View breakdown** with the exact store calculation, bounded bill lists and contextual Ledger/Plan links. Future entries are excluded from actuals. Historical, current and future months retain the same date rules.

Bill satisfaction uses explicitly linked outflow through today, even if the payment belongs to another month. Cash belongs to the transaction's own date/month. Manually marking a bill paid releases its remaining commitment without recording outflow. A conditional breakdown lists confirmations not fully covered by linked outflow; payments may be tracked elsewhere or recorded without a link. It does not prove that a transaction is missing or propose another payment. A fully covered bill cannot be unchecked; correct or undo the linked records instead.

Ledger's header cards always show the **selected month's actuals**, regardless of table filters. The compact matching summary shows count and income/outflow/net across **all matching pages**, for the selected month or all time. Scheduled counts and amounts remain separate. Rows page at 50; type/search/period changes reset pagination. Empty history, empty months and no filter matches have distinct messages; Clear filters keeps the period.

**Export CSV** exports every matching row, including scheduled entries, independent of pagination. Fields are quoted and user text with spreadsheet formula prefixes is neutralized. The receipt inspector preserves historical payment details. **Reports** provides 3/6/12-month views and report CSV; unknown values stay blank and partial periods are identified.

## Accounting rules

- Money is integer cents; annual rates are integer thousandths of one percent (6.125% = 6125). Unknown differs from zero. Existing valid zero-value history remains restorable; new movements must be positive.
- Actual outflow counts expenses and debt-payment entries once. Expected income and forecast interest never silently become actual cash or posted debt.
- Connected payment principal is amount minus interest. Normally the debt decreases by principal. If the saved balance already includes that interest, explicitly select that option: the whole payment reduces the balance and the receipt still retains the split.
- Stable request IDs support safe retries. Changed debt/bill editor baselines reject stale payment requests. Connected corrections require Undo then a deliberate new payment. Undo retains event-order and closing-balance/reference-date checks. Reverse later adjustments first; deleted debts retain historical receipt identity.
- Ordinary **Debt payment · update balance** transfers its draft to the connected editor without writing money. **Debt outflow only · balance unchanged** deliberately records generic Ledger outflow.
- Debt balance/reference-date edits create statement events. Fees, purchases, refunds, statement matches and explicit monthly interest posting retain history. Reversal only affects the latest eligible event; historical receipts do not change when a debt or bill changes later.
- There is no automatic interest posting or opening-cash rollover.

See [debt accounting](docs/ADR-0001-debt-accounting.md) and [income receipts](docs/ADR-0002-income-receipts.md).

## Recurring plans and forecasts

Recurring definitions are monthly planning, not background money movements. Visiting an eligible month generates its snapshots once, atomically across tabs. Days beyond month length clamp to its last day. Existing snapshots retain edits when rules change or pause. Generation failures keep Ledger accessible and label incomplete planning totals until Retry.

**Repeat monthly** adopts an existing bill without duplication. Deleting a generated bill preserves a skipped occurrence; explicit restore uses its saved name/amount/day, requires review of unavailable historical category/debt links and creates a new bill identity. Old receipts stay detached. Income occurrences can be edited, skipped and restored independently. **Copy previous month** keeps opening cash and existing additional income by default, with an explicit income-replacement preview and concurrent-edit check. Paid marks reset; recurrence snapshots are separate.

Debt payoff uses nominal monthly APR/12, rounded half up per period, with capped final payments and a 1,200-month limit. Blank payment uses the saved minimum; explicit zero means no payment. Missing rates remain unknown. Extra-payment comparisons do not alter plans. Separate unposted-interest estimates support completed monthly anniversaries or explicitly chosen simple daily 365/360 models. Saved balances never accrue by rendering. Lender-specific compounding, grace periods, variable rates and changing minimums are outside the model. See [forecast verification](docs/QA-debt-interest.md).

## Storage, backups and recovery

Records belong to the exact website origin and browser profile. Domains, ports, localhost/127.0.0.1 and browsers have separate stores. Personal data stays in **`accrynt-local-v1`**; demo uses **`accrynt-demo-v1`**. Native Dexie schema **v5** appends one local backup-health store; all seven financial tables and historical v1–v4 migrations remain intact. Only theme preferences use localStorage; no financial payloads or drafts are placed there.

Portable JSON remains **`accrynt-portable` v5**, with v1–v4 import support. Local revision/backup-health metadata is excluded. Export validates data and enforces **64,000,000 UTF-8 bytes**. File selection checks that limit before reading; files above **15,000,000 bytes** require extra review. Restore validates IDs, links, recurrence keys and receipt arithmetic before replacing all financial tables atomically. A current safety download is initiated before confirmed restore/clear. Backups are unencrypted.

Settings distinguishes no tracked portable download, **Backup download initiated [time] / No later tracked record changes**, **Records changed since that snapshot**, and **Freshness unknown**. This describes browser tracking, never proof that a file was saved, verified, secure or recoverable. Raw recovery does not establish portable backup freshness. Restore never trusts the imported exportedAt as a new backup event.

Atomic monotonic revisions cover financial mutations, including deletions and replacements. Exports capture the exact consistent snapshot revision; later writes and out-of-order downloads cannot falsely make it current. Because older Dexie builds can reopen newer native schemas, persisted SHA-256 table witnesses detect untracked legacy writes and conservatively report unknown. Missing/corrupt health metadata also stays unknown. These checks run on storage snapshots, not draft keystrokes. Full contract and limits: [ADR 0003](docs/ADR-0003-backup-revisions.md).

A single nonblocking reminder appears **only in Settings**, when a populated workspace has unexported changes with no tracked export or an export at least seven days old. Dismissal snoozes it for seven days per workspace, surviving writes/reload. Unchanged exported records do not nag as time passes. Nothing downloads automatically.

Browser clearing, eviction or profile removal can remove records. Persistent-storage permission may be declined and never replaces external backups. Storage errors offer Retry and native **raw recovery** without migration/validation; damaged-record recovery needs manual repair and is not directly importable. Native recovery includes every existing store (native version 50 means Dexie v5). It cannot bypass denied storage or recreate evicted records. Database upgrades are forward-only; preserve a pre-update portable export and avoid older writers. Optional example data loads only on request into a financial-empty workspace.

## Offline operation and draft protection

A production app visited online can reload offline once its service worker activates and controls navigation. `npm run dev` is not the offline target. Updates use an explicit reload action. Dirty modal/inline forms share **Save and continue**, **Discard changes**, and **Keep editing** across close/Escape, routes/months, demo reset and PWA updates. Clean forms do not prompt. Busy operations block leaving; failed saves retain drafts. Save and continue always performs normal save/close, even when repeat entry is available.

Native `beforeunload` protects ordinary reload/close where supported and after qualifying interaction. Browsers control the wording. It cannot guarantee mobile OS process termination, every mobile close path or a custom save flow. Drafts stay in memory and are not automatically persisted.

## Synthetic demo and release evidence

Choose **Try demo**, or open `http://127.0.0.1:4173/?demo=1#/` after `npm run build` and `npm run preview`. The same forms, calculations and repository seed six months of fictional records once. Edits persist; confirmed Reset demo selects showroom, negative-cash, near-payoff or February scenarios. Existing demos are never automatically reseeded. Returning to the personal workspace neither copies nor clears its data. Demo backup filenames say `DEMO-SYNTHETIC`; theme and backup metadata are isolated too.

[v0.9 QA and scope matrix](docs/QA-v0.9.md) records actual checks, compatibility, performance and focused before/after evidence. Historical evidence remains in the earlier QA files. Physical phones, real 200%/400% browser zoom, manual screen readers and Safari/iOS PWA/storage are separate manual release gates. Automated WebKit smoke and emulated widths do not certify them.

The current [v1 QA/release matrix](docs/QA-v1.md) supersedes historical counts and
records the performance decision, fresh-profile recovery drill, strict-CSP browser
coverage and exact remaining gates. Local-first does not mean encryption or
protection from someone using an unlocked profile. The website host may retain
access logs; no production host logging policy has been verified. Do not post
personal backups or financial screenshots in public issues. Weekly dependency
updates and read-only PR dependency review are configured; fixes require review and CI.

No project license has been selected. Owner licensing approval remains a separate
distribution decision; the bundled third-party font notices are preserved.

No new top-level section, backend, bank/cloud sync, AI assistant, chart dependency, account-transfer subsystem, encryption project or Tauri build is included. Domain/storage boundaries remain suitable for a later Tauri 2/SQLite adapter. This milestone does not authorize merging, deployment, releases, licensing or repository-setting changes.
