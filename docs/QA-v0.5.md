# Accrynt v0.5 verification

## Reproduce

```bash
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium firefox
npm run test:e2e
```

Run from a checkout of the final feature branch. Default demo: `http://localhost:4173/?demo=1#/` after `npm run preview`; ordinary workspace: `http://localhost:4173/#/`. Use the same host/port/profile to retain records. Reset demo requires confirmation. February reset selects February; other scenarios select the current month.

In this root container Chromium's primary CDN returned truncated archives, so local tests used the available headless Chromium executable through the existing `ACCRYNT_CHROMIUM_PATH` configuration. Firefox downloaded from its official fallback host and required `MOZ_DISABLE_CONTENT_SANDBOX=1 MOZ_DISABLE_RDD_SANDBOX=1` in the disposable test process. No browser-specific flags are shipped in product code; GitHub's Ubuntu CI uses the normal browser installs.

## Coverage

- Reviewed original golden amortization fixtures and independent Python Decimal 6.125% fixture: 847500 cents / 31000 cents per month → 30 payments, 67628 cents interest, 16128 cents final payment.
- Date-aware 365/360, leap days, month ends, unknown and zero rates, invalid periods; no estimate mutations.
- v1/v2 native upgrades and backups, authentic original-v3 export/native-v3 upgrade, reopen and v4 roundtrip; rollback on simulated write failure.
- Duplicate payment and interest requests, stale tabs, same-balance newer events, explicit statement history, safe reverse/Undo order, deleted debt history, dangerous backup invariants and safety snapshots.
- Fully populated synthetic demo, two-tab atomic seeding, all six routes, real forms, split receipts, persistence, offline reload, theme, export/import, reset and personal database isolation.
- Selected-month/all-time Ledger, inspector, safe CSV quoting/formula prefixes, report CSV, missing-history semantics, date cutoffs and January 0001 boundary.
- Both themes on all six routes at 320, 768, 1280, 1440, 1920, 2560, 3840px; no document overflow; rail remains right; three debt cards at 1920+. Desktop/mobile full-page screenshots, keyboard skip links preserving routes, menu Escape and native dialog focus/return. 200% CSS zoom is tested separately; physical browser zoom and manual screen readers were not inspected.

## Evidence

Each browser captures all six routes in both themes at 320px and 1440px: 24 screenshots per browser, 48 total. Attached to the Playwright report and published by CI as `playwright-review-evidence`, including successful runs. Contact sheets were visually inspected locally; the full captures are the review evidence. See `IMPLEMENTATION-REVIEW.md` for audit reconciliation and the accounting ADR for policy limits.

## Actual final local execution — 2026-10-16

| Check | Result |
| --- | --- |
| `npm ci` (original lock, dependency set unchanged) | Pass; 418 packages installed |
| `npm run typecheck` | Pass |
| `npm test` | 125 tests pass, 7 files |
| `npm run build` | Pass; PWA generates service worker and 15 precache entries |
| Full Playwright suite | 54 tests pass: 27 Chromium + 27 Firefox; 48.5 seconds |
| Populated route/theme/width matrix | Pass at all seven specified widths |
| 200% CSS zoom and February scenario | Pass in both browsers |
| Demo persistence/offline/isolation | Pass in both browsers |
| `git diff --check` | Pass |

Only dependency warnings about Zod pure-comment annotations and npm's environment proxy configuration appeared; no validation failures remain in the final run. Build output is approximately 472 KiB of precached assets. No dependency was added or upgraded; package version changed to 0.5.0.
