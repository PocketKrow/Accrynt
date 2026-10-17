# Accrynt — UI polish and responsiveness verification

This extends the open, main-targeted PR #12. The starting tree was `530bf79f7c8a404b79eabbcf4e08aa5cf380c4d1` (remote head `5cd9be7d30c0802fd57428edff846f4e21d860f7`). The same local tree was `fe4ef6d`. Main was still `9d7a127`; it has not been merged or deployed. The earlier recovery/receipt work remains included in that PR rather than being stranded behind another feature-branch target.

## Visual and interaction changes

- Page headings now contain one grouped month/action toolbar. Controls share a vertical center and deliberate gaps instead of being distributed across the full viewport as independent flex items.
- Consolidated the accumulated style overrides into one readable stylesheet, with font declarations separated. Shared body text, metadata, headings, number spacing and controls use deliberate sizes, line heights and weights. Most body/table content is 12px rather than 10–11px; secondary notes remain 11px and eyebrows 10px. Important warnings retain full wording.
- Eyebrows are block elements with explicit spacing above titles. Buttons use the same alignment and line height. Utility links remain lighter; no new decoration, hero sections, rounded-card system, icon package or animation library.
- Table head styles apply only to the head. Body row headings, dates, amounts, descriptions and provenance notes no longer inherit uppercase/tracking/background rules. Scheduled descriptions wrap without forcing wide date columns.
- Monthly Plan keeps Edit/Delete aligned across paid and unpaid rows. Manual-paid and cross-month provenance sits with the bill description, leaving status compact. Repeat monthly is beside the bill it applies to. Payment/status semantics are unchanged.
- Definition-list margins are reset and label/value columns align consistently. Debt actions have a real gap. Reference dates, methods, unknown rates, paid-off disclosures and all existing calculation details remain available; cards follow their content instead of a forced uniform height.
- Settings uses two independent content columns, avoiding empty row gaps under short panels. Smaller layouts follow the same reading order.
- Reports uses a shared plot height so Partial/Future labels cannot shrink a column's bars. A keyed legend matches the actual series colors; month row headings have the same borders and type treatment as other body cells. Exact values and date cutoffs remain visible.
- Native inputs, selects, checkboxes, file controls and dialogs retain their semantics. Dark controls use the dark color scheme. Table regions are labelled and keyboard-focusable for horizontal scrolling; focus indicators and the narrow-width 44px button treatment remain.
- Demo controls separate description from actions. The synthetic-data identity and reset/return behavior remain explicit.

The approved Carbon × Glacier colors, geometric A logo, full viewport, right-side navigation and six routes remain. This is a shared UI pass, not a separate mobile redesign. Narrow layouts and existing horizontal-table behavior are tested, including keyboard scrolling.

## Performance work

Payment status now groups transactions by bill once, then calls the existing authoritative calculation on each small group. The finance store shares the resulting map between summary, available cash, Overview and Monthly Plan. It invalidates on obligation/transaction snapshots or today's date, not search keystrokes. Receipt status, linked payment dates and recurring IDs are also derived once instead of repeatedly scanning all transactions for every rendered label.

Currency and UTC month formatters are reused. All-time transaction sorting is a separate computed value, so typing a search does not sort the same snapshot again. Ledger renders **50 matching rows per page**; search and filters still run over the full scope, metrics remain full-month values, and CSV exports **all matching entries**, not just one page. Pagination announces the visible range, resets when filters/month change, clamps after deletions and clears an inspector selection that leaves the visible page.

Removed unused Inter 800/900 and JetBrains Mono 800 assets and declarations. Both families retain 400/500/600/700 and their original licenses. Final PWA precache: **23 entries / 676.29 KiB**, compared with **26 / 742.73 KiB** on the starting tree. Final CSS: **28.73 kB raw / 6.37 kB gzip**; main JS: **451.98 kB / 144.70 kB gzip**. The added grouping/paging code trades a small JS increase for bounded Ledger DOM and cheaper recalculation; no dependency versions changed.

### Reproducible calculation measurement

Run `node scripts/benchmark-finance.cjs` after `npm ci`. An optional absolute checkout path measures that checkout's actual finance module. The script bundles the real module with the existing development toolchain; it does not reimplement its formulas. Baseline and updated checks ran with Node **24.19.0** on this runner. Each figure is the median of five executions; module compilation is outside the measured interval.

| Work | Starting tree | Updated tree |
| --- | ---: | ---: |
| 2,000 bills / 20,000 transactions: summary, cash and every bill status | 2,331.913 ms | 5.229 ms |
| 10,000 USD formatting calls | 258.433 ms | 4.631 ms |

The calculation checksum is identical: `paidCount 254`, `actualOutflowCents 12467000`, `trackedCents -11210000`, `outstandingCents 5130000`. The formatting checksum is 112885 characters for both. The fixture includes manual paid marks, future entries, prior-month payments and income entries. Regression tests assert exact aggregate values and equivalence to the original per-bill function. There is **no wall-clock pass/fail threshold**.

These numbers measure isolated calculations on a synthetic workload, not whole-app latency or guaranteed performance on another device. Ledger filtering still examines all matching records; IndexedDB/liveQuery still reads a full snapshot. This does not certify the portable import maxima as interactive UI targets. No worker, new index or persistent cache was added.

## Executed checks

- Dependency install, typecheck and production build passed with the original lockfile.
- **142 unit/storage tests across 11 files passed.** Added exact grouped-status coverage for manual/zero bills, cross-month/current/future payments, ignored income links, changing date cutoffs, unknown cash and the large fixture. Existing migration, receipt, rollback and financial tests remain intact.
- **80 full production Playwright tests passed in 46.9s**: 40 Chromium and 40 Firefox. This includes all existing 74 checks plus six new browser cases.
- New browser checks exercise grouped header geometry, paid/unpaid action alignment, Settings column gaps, consistent plot baselines, separated debt actions, narrow keyboard scrolling, dialog focus/bounds, 120-entry pagination, filter reset, inspector reset and complete CSV export from a paged table.
- After removing unused font files, rebuilt and reran **eight focused two-browser cases** for offline fonts, control alignment, keyboard access and the complete viewport/screenshot sweep: all passed in 13.1s.
- Matrix: all six routes in both themes at 320/768/1280/1440/1920/2560/3840px, long names/large numbers, 200% CSS zoom, persistence, offline reload, demo isolation, backups, failed native upgrades, atomic rollback and ordered undo.
- Fresh screenshot evidence: 48 full-page Chromium/Firefox matrix captures (six routes × two themes × 320/1440px × two browsers), plus 12 supplemental 1920px desktop captures in light/dark with the Ledger inspector selected. The before/after package uses the starting v0.7 light screenshots for comparison. All data is synthetic.
- `git diff --check` passed. Supplemental captures had no uncaught page errors or failed requests.

Local standard Chromium downloads again returned truncated archives, so the existing executable override used separately unpacked Chromium **153.0.8010.0**. Firefox **157.0 / Playwright 1555** installed from the official fallback host. Root-container Firefox environment flags and browser binaries remain outside the repository; CI uses standard browsers. The initial missing-runtime launch attempt ran no app workflows; it is not counted as product validation. Existing npm proxy/Zod annotation notices are nonfatal.

No physical-device, Safari/WebKit, manual screen-reader or physical browser-zoom certification is claimed. CSS zoom is separately tested. Visual review is human judgment supported by captures and targeted geometry checks, not a claim of universal pixel perfection.

## Financial and persistence boundary

No new record field, migration, receipt edit, financial formula, export version or dependency. Native Dexie remains v4; portable exports remain v5 with v1–v5 import support. Derivations and pagination are in memory. Income stays planned until recorded, receipts remain immutable, manual paid marks do not create cash outflow, and cross-month cash belongs to the transaction date. The existing recovery actions and destructive confirmations remain.

For interactive review: `npm ci`, `npm run build`, `npm run preview`, then `http://localhost:4173/?demo=1#/`. Use `/#/` for the separate personal workspace. Keep origin/profile constant for persistence. The screenshot ZIP's `OPEN-REVIEW.html` lets a reviewer switch the same page between before/after and light/dark without a live server.
