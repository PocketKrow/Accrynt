# Accrynt · v0.2

A personal, local-first finance workspace built with **Vue 3 + Vite + strict TypeScript + SCSS + Pinia + Vue Router + Dexie/IndexedDB + Zod**. The approved Carbon × Glacier interface, geometric logo, six views, and desktop right sidebar are preserved.

## Run locally (Fedora / Bash)

Use Node.js **22.12+ within the 22.x line, or 24+**, and npm. From an authenticated clone:

```bash
git clone https://github.com/PocketKrow/Accrynt.git
cd Accrynt
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173`. The committed `package-lock.json` records the resolved dependencies. Use `npm ci` for reproducible installs.

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

Browser regression tests run against the production build, using isolated profiles and synthetic records:

```bash
npx playwright install chromium firefox
npm run build
npm run test:e2e
```

On Linux, Playwright may require system libraries; its `npx playwright install --with-deps chromium firefox` command installs them on supported distributions. Fedora users should follow Playwright's current Linux support guidance if their distribution is not supported. The CI workflow uses Ubuntu. An optional `ACCRYNT_CHROMIUM_PATH` environment variable selects an existing Chromium executable for constrained test environments; it does not affect the app.

## What v0.2 changes

- Consistent database snapshots for the live workspace and JSON exports, including across tabs.
- Full backup validation at the restore boundary, with all-or-nothing replacement of the four tables.
- Transactional relationship checks, link-safe deletion, and stale-editor protection. An editor cannot recreate a record deleted in another tab or silently overwrite a newer version.
- Income drafts close when the selected month changes. Historical obligations cannot be moved into another month by an edit.
- Transaction obligation choices follow the transaction date. An existing cross-month link remains visible with its month; income saves clear the payment link.
- Debt balances may legitimately exceed their starting balance, with an explicit amount-above-baseline label.
- Strict monetary grouping and calendar boundaries, storage retry, and guarded backup-file selection.
- A committed npm lockfile, finance/storage regression tests, production browser smoke tests, and GitHub Actions validation.
- Small contrast corrections within the existing palette; the visual structure is unchanged.

## Daily workflow

Start in **Monthly Plan**: set expected income, add obligations, and mark them paid as you complete them. Copy the preceding plan into an empty month when needed; this is a deliberate copy, not an automatic recurrence engine. Use **Ledger** to enter actual money movements. **Debts** maintains manually entered balances. **Reports** shows monthly summaries. **Settings** contains theme, storage, backup, restore, and deletion controls.

An optional historical October example is available only in an entirely empty workspace. It never loads automatically. Its figures are examples, not verified current balances.

## Financial truth rules

- **Planned outflow** sums monthly obligations, whether paid or unpaid.
- **Unallocated** is expected income minus planned outflow. It is not a bank balance or verified spendable cash.
- **Actual outflow** sums manually recorded expense and debt-payment transactions by transaction date.
- **Actual net** is recorded income minus recorded outflow.
- Marking an obligation paid changes checklist status only. It does not insert a transaction.
- Linking a payment to an obligation does not change its paid status or add planned outflow again. A payment may legitimately occur in a different month from its obligation.
- Debt minimums are reference amounts; balances do not decrease automatically. Principal/interest reconciliation is not implemented.
- New or edited transactions must be positive. Valid v1 zero-value transaction history remains restorable without rewriting it.
- Amounts use integer cents; APR uses integer basis points.

## Data location and recovery

Records live in the browser's IndexedDB database **`accrynt-local-v1`**, schema version 1. The browser owns the physical files; Accrynt does not choose a normal filesystem folder. Storage belongs to the exact origin and browser profile. `localhost`, `127.0.0.1`, different ports, deployed domains, other browser profiles, and a future desktop installation have separate stores. The selected month starts at the current month on launch; saved historical months remain available with the month controls. Only theme preference uses `localStorage`.

Use **Settings → Download JSON backup** to move records or keep an external copy. Restore validates the archive, shows its record counts, and requires confirmation before replacing all local records atomically. The portable format remains `accrynt-portable`, schema version 1; v0.1 backups remain supported. The file picker has a 15 MB import limit. Backup files are **unencrypted**.

Browser site-data clearing, profile removal, or storage eviction can remove records. The explicit persistent-storage request can be declined or unavailable, and does not replace external backups. Deletion affects the current browser's database; it does not remove previously downloaded backups. A temporary database error offers Retry without clearing stored records.

## Offline operation and validation

After a production build has been visited online and its service worker has activated, the app shell can load offline. A subsequent navigation/reload acquires service-worker control; `npm run dev` is not the offline verification target. Updates use a user-controlled reload prompt.

Actual QA commands, results, tested browser/runtime, and remaining gaps are recorded in [docs/QA-v0.2.md](docs/QA-v0.2.md). Automated finance/storage tests use in-memory IndexedDB; browser tests exercise real IndexedDB in disposable profiles. GitHub Actions runs type checking, unit/storage tests, a production build, and Chromium/Firefox tests. A configured workflow is not itself a successful remote CI run.

## Scope and future desktop support

There is no account system, server, cloud sync, analytics, bank connection, account reconciliation, structured transfers, spreadsheet importer, amortization engine, encrypted backup, or Tauri/Rust build. Domain logic lives in `src/domain/`, database operations in `src/data/`. A future Tauri 2/SQLite adapter can reuse the UI, domain rules, and explicit portable backup migration path.

Next milestone: complete monthly budgeting, including deliberate recurring definitions and clear due-date states. Linked payment recording should follow with explicit partial-payment and reconciliation rules. Brand SVGs were reconstructed from approved image references; original vector masters remain desirable for final exports without redesigning the mark.
