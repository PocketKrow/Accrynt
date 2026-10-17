# Implementation review — 2026-10-16

## Baseline

Authoritative main: `7b1ae2ba51f00f17170baff3548a396ba833e965`. Every tracked snapshot file matched the GitHub Git blob SHA. No AGENTS.md exists in that tree. Baseline: typecheck/build pass; 92 Vitest tests pass; 18 Chromium E2E tests pass using an available headless Chromium executable after the default browser CDN returned truncated archives.

## Audit reconciliation

| Finding | Audit evidence and source verification | Decision / implementation | Regression coverage |
| --- | --- | --- | --- |
| Copy after opening/income | Gemini + Grok; Plan gate and repository rejected any month row | Fixed; preserve opening and nonzero additional income; reject manual bill conflicts | foundation/storage tests |
| Payment draft resets | Gemini; both selection watchers called destructive capture | Fixed; snapshot refresh separate from edited fields; changing debt invalidates/reviews interest | demo E2E; stale-tab existing E2E |
| Scheduled shown as paid | Claude + Grok; default cutoff was year 9999 | Fixed; actual/status cutoff is today, scheduled amount distinct, manual paid independent | foundation tests and existing payments E2E |
| Wrong amortization examples | Gemini disagrees with independently reviewed values | Rejected; six reviewed integer-cent golden fixtures added unchanged | foundation tests |
| Extra recurrence index/transaction | Gemini proposal duplicates v3 code | Rejected; keep historical schema and current atomic/idempotent implementation | existing concurrent-generation tests |
| Unknown APR = zero | Grok proposal understates unknown interest | Rejected; unknown requires explicit manual interest, zero remains known | existing rate-state tests |
| Strict receipt debt=current bill debt | Grok proposal breaks historical relinking/deletion | Rejected; validate arithmetic and income links, preserve historical identity | foundation backup tests |
| Remove undo balance guard | Would allow reversing across reconciliation | Rejected; retain guard; event model belongs to debt phase | existing connected tests |
| Ledger same-day order | Claude + Grok; date-only sort | Fixed; recorded receipt timestamp then deterministic ID; never infer creation from updatedAt | demo/connected tests |
| Progress half-up / premature 100% | Grok verified floating-point boundary | Fixed using BigInt; 100% only when zero remains | foundation tests |
| Public example resembles personal records | Handoff + verified source | Replaced with generic fictional bills; selected-month labels corrected | storage/E2E |
| Skip link under hash router | All audits proposed browser verification | Fixed click focus without changing route; added navigation target and menu Escape | demo E2E |
| Full viewport density | All three; shell already full-width | Implemented in workbench slice (`src/views`, `src/styles/main.scss`); no shell cap or brand rewrite | responsive browser matrix |
| Exact 6.125%, dated estimates, adjustments | Gemini precision finding; Claude/Grok accounting proposals | Implemented in precise accounting slice (`src/domain/debt.ts`, `src/data/balance-events.ts`, `src/data/database.ts`, ADR 0001); exact v4 migration | migration/golden/event tests |

## Foundation storage contract

No Dexie/portable schema bump. Historical versions 1–3 unchanged. `accrynt-local-v1` remains normal storage. Query `?demo=1` selects `accrynt-demo-v1` once, before the singleton is constructed; switching performs full navigation. Normal mode never auto-seeds. Demo seeding and reset use all-table write transactions; concurrent entry seeds once. Demo theme preference has its own key. Demo exports have a `DEMO-SYNTHETIC` filename. Legacy consumers can still import portable v3 without extra schema keys.

Actual totals and obligation statuses use ledger entries dated through today. Future linked outflow is scheduled coverage; it continues to reserve money until dated. Partial actual payments remain Partial even when more is scheduled. Manual paid confirmation stays independent and does not synthesize outflow. Cross-month actual payment links settle their obligation only when the payment date is reached.

Demo fixture has six synthetic months, six debts, recurring expected income, recorded income, partial/overdue/scheduled/manual payments, a skipped occurrence, and a reversible split receipt. Foundation uses 6.12% for the installment sample because v3 cannot store 6.125% exactly; the precise migration must update the fixture. No automatic interest posting. Scenarios reset the sandbox after explicit confirmation; missing and zero APR are present in every scenario.

## Workbench slice

Adds a third Overview context column, adaptive debt cards, sticky independently scrolling right rail, all-time Ledger search/type filtering, selectable receipt inspector, formula-safe CSV export and 3/6/12-month recorded-history charts with exact tables. Missing actual history is unknown, never fabricated zero. Scheduled entries stay visible in the Ledger but are excluded from actual totals and category reports until their date.

Regression matrix covers all six routes, both themes and 320/768/1280/1440/1920/2560/3840 widths. Desktop rail stays right; three debt cards share a row at 1920+. Captures 24 screenshots per browser at 320 and 1440, attached to the Playwright report. CI now retains review evidence on success too. Visual inspection of the 24 Chromium captures completed. The dense recurring income action row exposed a real 320px overflow; wrapping fixed it.

Workbench checks: 112 unit tests pass, typecheck/build pass; new reporting/CSV/viewport tests pass on Chromium and Firefox. Firefox requires `MOZ_DISABLE_CONTENT_SANDBOX=1 MOZ_DISABLE_RDD_SANDBOX=1` in this root container; those settings are only applied to local disposable test processes, not shipped to the app or CI.

## Precise accounting slice / v0.5

Implements ADR 0001, canonical milli-percent rates, exact 6.125%, saved balance reference dates, nominal completed-month and simple daily 365/360 estimates, explicit statement/interest/fee/charge/refund events, latest-event reversal and v4 portable recovery. The debt editor itself creates statement events for balance/date changes. Receipts retain their original split and previous/after reference dates. A later event blocks older Undo even if a charge and refund happen to return to the same numerical balance.

Posting a nominal monthly estimate is explicit, period-keyed and duplicate-protected; reversed period keys remain reserved. It refuses another full month when an interest-bearing payment already exists. Payment suggestions allocate an explicit posting once and select interest-already-in-balance; otherwise repeat payments require actual interest review. Known 0% remains zero on repeated payments; unknown APR never becomes zero. No unattended posting, daily posting, invented grace period or inferred statement date.

The authentic v3 fixture at `src/tests/fixtures/v3-original-export.json` was generated by running the unmodified snapshot's repository/payment/export code using fake IndexedDB. Current tests import that original export, upgrade a native v3 database containing it, reopen, and verify balances, IDs and receipt splits. Existing native v1/v2 upgrade and portable v1/v2 cases remain. Malformed rate data aborts a migration instead of persisting NaN. Historical Dexie versions 1–3 remain unchanged.

Settings previews counts, provenance and export age, warns about replacing newer records and downloads a current safety export before restore/clear. No large localStorage recovery copies. New v4 exports are incompatible with old app versions; normal database name remains `accrynt-local-v1` and demo remains `accrynt-demo-v1`. Existing demo records migrate just like normal records; Reset demo intentionally loads the new 6.125% fixture.

Also adds report CSV with blank unknown values, persistent dismissible operation-error announcements, contextual row-button names, larger small metadata/touch targets, 200% CSS-zoom coverage, a working February scenario selecting its month and clamping month-end dates, and the January 0001 report boundary fix.

## Remaining scope and validation limits

- Portfolio snowball/avalanche allocation, encrypted backups, biweekly/semimonthly recurrence, restoring deleted recurring bills from a UI control, and suggested opening carry-forward are deferred. They are optional/deeper tools, not fake controls.
- Interest estimates are deliberately simple; no lender-specific average daily balance, residual interest, grace-period or compound-interest engine. Calendar months are the duplicate-posting unit; an external lender's statement cycle may differ. Review actual statements. Payment dates before a known saved reference date require reconciliation first.
- Backups remain unencrypted and subject to the existing 15 MB picker limit. Downloads are user-initiated browser downloads; the app cannot guarantee where a user saves a file. Preserve a pre-upgrade export and recover with the updated app; native IndexedDB version upgrades cannot be rolled back by simply running an older build.
- Keyboard, native dialog focus/return, skip links, mobile Escape, labels, contrast tokens, responsive overflow and CSS zoom are exercised. No physical phone or manual assistive-technology/WCAG certification was performed. CI and disposable browser profiles do not establish real-bank correctness.
- No merge or deployment. The existing Netlify deployment is not updated by this work.

Final local validation: typecheck/build pass, **125 unit tests** and **54 Chromium/Firefox browser tests** pass. Screenshots cover all six routes in both themes at desktop/mobile. Full populated width matrix and 200% CSS zoom pass. PR #4 and #5 have confirmed successful GitHub Actions runs; the final accounting PR runs the same CI. Review in dependency order: foundation → workbench → precise accounting.
