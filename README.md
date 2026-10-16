# Accrynt · v0.1 foundation

A local-first personal finance workspace built with **Vue 3 + Vite + strict TypeScript + SCSS + Pinia + Vue Router + Dexie/IndexedDB + Zod**. Its appearance is based on the fully approved Carbon × Glacier, Vector + Foundry right-sidebar design.

## Run locally (Fedora / Bash)

Prerequisite: Node.js 22.12+ (or a Vite-compatible newer version) and npm.

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://127.0.0.1:5173`). For production validation:

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

`npm install` generates `package-lock.json` locally; commit it to the repository for reproducible builds. The package archive intentionally has **no node_modules or lockfile** because this environment could not reach the npm registry to resolve dependencies.

## What's working at the source level

- Six routed views: Overview, Monthly Plan, Ledger, Debts, Reports, and Settings
- Light and dark Carbon × Glacier theme, approved geometric Accrynt brand mark, right-side desktop rail
- Per-month income, obligation CRUD, paid/unpaid statuses, and opt-in copying from the preceding month
- Actual transaction CRUD (income, spending, debt payment), kept separate from planning
- Debt account CRUD with optional APR, minimum and starting balance; **balances are manual**
- Summary math in integer cents, validation via Zod and a distinct service/repository layer
- IndexedDB reactive updates using Dexie `liveQuery`, with no accounts, APIs, or backend
- Versioned JSON export, schema-validated atomic replacement restore, duplicate-ID and relation checks
- Storage transparency, persistence requests where supported, destructive actions gated by confirmation
- Optional October budget example (only for a completely empty database)
- Offline PWA shell after a production build has been visited online, installable where supported

## Financial truth rules

- **Planned outflow** = monthly obligation amounts, whether marked paid or not.
- **Unallocated** = expected income − planned outflow; **this is not a bank balance**.
- **Actual outflow** = manually entered expense + debt-payment transactions only.
- Marking an obligation paid is an administrative status and **does not** insert a transaction.
- Debt payment transactions are not double-counted against plan totals; debt balances are not automatically decreased without principal/interest reconciliation.
- No bank account syncing, true running balances, multi-account transfers, amortization engine, spreadsheet import, or automatic encryption yet.
- Backup JSON is **unencrypted**. Store exported backups securely, especially when they contain private financial data.

## Browser storage location

IndexedDB database name: `accrynt-local-v1`. IndexedDB is bound to the **origin** and browser **profile**. `localhost`, deployed domains and a future Tauri app each have distinct storage. Use Settings → Download JSON backup and restore it into another installation; there is **no automatic migration or synchronization**.

Browsers may remove locally stored data; use backups. `navigator.storage.persist()` is requested explicitly by the user from Settings where supported. Theme preference only is stored in `localStorage`.

## Tauri transition

Core amounts and validation are framework-agnostic (`src/domain/`). Database interactions live in `src/data/`. When building Tauri 2, implement a SQLite repository with the same operations and reuse the JSON backup schema to migrate browser records. **No Rust/Tauri build is included in v0.1.**

## Limitations of this deliverable

The implementation has been authored and statically inspected, but dependency installation, Vue template type checking, browser end-to-end tests, and the production build **could not be executed in the artifact environment because the npm registry was unreachable**. The listed commands must be run on a machine with npm access before treating v0.1 as validated software. No GitHub branch, commit, PR, or deployment has been created.

Brand SVG assets were previously reconstructed from the approved image-based reference sheets. Replace them with original vector master exports when available.
