# Accrynt v0.7 — review decisions and verification

This change uses the supplied Step 5 code overview, DeepSeek code overview and Gemini desktop UX review. Those reviews were advisory: findings were checked against the actual source and browser before changes were made. The earlier production-continuation handoff remains the compatibility contract. The approved Carbon × Glacier identity, full viewport, right navigation, six routes and existing stack are retained. Mobile redesign remains deferred; existing responsive behavior is regression-tested.

## Integration

At the start of this change, `main` was `9d7a127ffe6ca4133554bfc2b6e2d58185b34321`, tree `c3b6dd75c490bb7fce0b8bdfbb2b5a20566ac08f` (v0.5). The reviewed continuation was `f290949e7b0a542142494cf396bdb0984eb1d346`, tree `7217d96ee283201548eb7613cc3fbb2e50d1886f` (v0.6). The latest merged continuation head `9b7e5c2757d959bcd4f3f8e1ded619b25ffe0600` has that same tree. All earlier PRs were marked merged, but later feature-branch merges never advanced main. No open PR conflicted with this work. No applicable AGENTS.md was present.

The new branch joins main and the complete continuation ancestry, preserving the reviewed v0.6 tree before adding the current changes. One PR targets **main** directly. This avoids another chain of dependent PR targets. No force push, merge to main or deployment is part of this task. The GitHub connector publishes the tested tree; the final remote tree is checked against Git's local tree hash.

## Decisions from the code reviews

| Finding | Decision and evidence |
| --- | --- |
| Main still lacks candidate fixes | Include the complete continuation, preserving its recovery → receipts → interest-context → workflow ancestry. Re-run the actual full suite on the combined result. |
| Fatal recurrence handling, prior-cycle interest, ordinary-transaction request deduplication, corrupt-current-state recovery, provenance warning and offline fonts | Already fixed in the reviewed continuation. Keep these implementations and their original regression coverage. Add an explicit browser assertion for the cross-workspace restore warning. |
| Failed native upgrade makes Settings/raw export unreachable | Reproduced with a native Dexie v3 database whose legacy debt contains an unexpected property. Strict v4 migration fails repeatedly while all six legacy stores remain intact. The fatal storage screen now offers native, versionless, read-only recovery without calling Dexie. Unit and real Chromium/Firefox tests verify all rows, unknown legacy properties, actual native version 30 and repeatability after Retry. |
| Explicit zero additional income overwritten by previous-month copy | Treat this as a product-policy improvement over the documented nonzero-preservation behavior. A modal explicitly offers income replacement. Existing zero and nonzero income stay by default; a new target can preselect source income. Opening cash always stays. Tests exercise both choices, copied paid marks and persisted values through portable export. |
| Update/reload discards open forms | Add a cancellable discard confirmation before the user-triggered service-worker update when a native dialog form or inline editor is open. No draft persistence or dirty-field tracking. Unit coverage verifies cancel, continue and no-form behavior. The full service-worker update installation lifecycle is not newly simulated. |
| Incomplete-plan alert flashes during normal generation | Show neutral preparation status while generation runs; show the error and Retry only for a real recurrence warning. Keep incomplete-total semantics and explicit retry after failure. Another tab's repair does not silently certify this tab's failed generation; Retry remains deliberate. |
| Cross-month linked payment is unclear | Bill rows display actual linked payment dates outside the bill's month. A browser fixture proves the October bill is paid while its September payment stays excluded from October actual outflow. Financial date rules are unchanged. |
| Grouped status computations / maximum-scale performance | Defer optimization pending a measured personal-workspace bottleneck. The nested transaction scans remain a known scale limit. No new pagination, worker, aggregate cache or claimed 100k-row benchmark. A wall-clock bound in an ordinary unit test would be environment-dependent. |
| Aggregate precision beyond safe integers | Keep current arithmetic; no BigInt aggregate rewrite. Individual amounts are bounded, while aggregate Number precision is not guaranteed beyond `Number.MAX_SAFE_INTEGER` cents. This is not a practical personal-data regression found in this review. |
| Safety-file saved checkbox | Keep truthful download-initiated wording and the existing confirmations. A checkbox cannot verify a durable disk save and would add another step without that guarantee. |
| Signed Ledger CSV | Defer the export-contract change. Display labels can improve while existing CSV kinds, positive amounts plus direction column, quoting and formula neutralization stay compatible. |
| Guided statement wizard, carry-forward, portfolio strategy, encryption, transfers, richer recurrence or Tauri | Deferred feature work. Existing statement adjustments and user-confirmed interest allocation remain available. No auto-accrual, inferred deposit links or automatic cash carry-forward. |

Step's prior-cycle example understates the old suggestion: after a $56.67 posting, `$4,056.67 × 17% ÷ 12` rounds to **$57.47**, not $57.44. The correct already-posted suggestion remains $56.67 included in balance. Operation errors already use persistent, separately dismissible alerts; the 4.5-second notice toast is not their only presentation. Stable request protection concerns repeat saves from the same request, not two deliberate new forms. These claims were not copied into new acceptance criteria.

## Decisions from the desktop UX review

| Finding | Implemented or corrected |
| --- | --- |
| Reports month/partial subtitle collision | Extend block `.cell-sub` treatment to row-header cells and add explicit row scope. Browser checks the computed display; fresh captures show the subtitle on its own line. |
| Debt-card information density | Keep saved balance, rate, payment, reference date, dated-estimate method, first-month interest and payoff visible. Collapse secondary dated details and retain first principal in calculation details. Preserve schedule, comparisons, adjustments and receipt history. At 1920px light, regular synthetic cards measure about 631px rather than the earlier 845px. This is a fixture measurement, not an arbitrary percentage target. |
| Paid-off payment terms appear current | Put retained minimum/payment/rate under **Historical payment terms**, with an explanation that this account is excluded from planned-payment totals. Do not overwrite saved terms with zero. Browser checks disclosure behavior. |
| Cash versus unallocated plan | Rail explicitly labels **Unallocated planned income** and explains expected income minus planned bills, separate from recorded cash. Budget disclosure uses the same scope. Do not call it a budget target. |
| Technical Ledger strings | Map stored transaction kinds to readable labels and format receipt timestamps with timezone. Exact ISO timestamps remain in `datetime` and `title`; stored receipts and CSV are unchanged. |
| Scheduled-income discovery | Add a keyboard-focusable **Review scheduled income (N)** action beside expected income. It scrolls/focuses the existing income section. Keep the established bill-first workbench rather than moving the whole panel without usability evidence. |
| Record payment hierarchy | Use an outlined button for the Monthly Plan row action, leaving Edit/Delete as utility text links. |
| Empty other-month section | Suppress its heading, counts and list when empty; retain one concise empty-state sentence. |
| Current chart resembles a full month | Add a hatched current actual bar and visible Partial label, with a legend. Exact table values and date cutoffs remain authoritative; future periods are labelled Future. |
| Settings unstyled picker / rail missing separation | Source and actual screenshots already show styled native file-selector buttons and a bordered rail summary. Preserve working native controls; no unnecessary hidden-input replacement. |
| Shrink eyebrows, force equal heights, imply offline settlement or require APR for every loan | Reject these suggestions. Preserve readable metadata, natural card height, truthful manual-paid wording and annual-rate terminology. Loan APR can include fees. |

Manual status now reads **Marked paid manually · no transaction added**. This describes what the action does without inventing an offline settlement. The existing **Record extra receipt** action is retained with the section's explicit linked-deposit explanation, avoiding a partial terminology change across the receipt workflow.

## Data and recovery compatibility

This v0.7 increment introduces **no persisted field, native migration or portable-version change** over v0.6. Native Dexie remains v4 with database names `accrynt-local-v1` and `accrynt-demo-v1`; portable export remains v5 and accepts v1–v5 imports. The continuation already adds optional `transactions.incomeOccurrenceId`; missing links stay unlinked. Older builds cannot preserve v5 linked data. Preserve an external pre-update export for rollback and do not edit linked records with old builds.

Native recovery opens without a requested version, reads all existing object stores in one read-only transaction, closes its connection, and never repairs or deletes rows. An absent database creation is aborted. Open failures, blocked access and timeouts produce a visible failure; this cannot bypass denied browser storage or recover evicted data. Native 30/40 are IndexedDB's Dexie version encoding, not portable schema versions.

The native recovery envelope uses `format: accrynt-raw-recovery`, source database name/version, workspace, timestamp, warning and a `tables` object. Settings retains its pre-existing raw recovery envelope. Both are unvalidated, JSON-compatible record snapshots for manual repair and are deliberately not importable portable backups. Downloads are initiated; the app cannot guarantee disk save. No user's real data is accessed in testing.

## Executed validation

| Check | Result |
| --- | --- |
| Dependency installation | `npm ci --prefer-offline` passed: 418 packages. Initial offline-only attempt lacked cached Zod; ordinary install completed. Dependency versions remain unchanged. |
| Reviewed baseline | Typecheck, 134 unit tests / 10 files and production build passed before edits. |
| Final typecheck and unit/storage tests | Passed: **139 tests / 11 files**. Includes repeated aborted upgrades, native read-only recovery, absence handling, current corrupt rows, explicit copy choices and update cancellation. |
| Final production build | Passed: Vite 7.3.7, 198 modules, PWA 26 precache entries (742.73 KiB). Existing Zod annotation warnings are nonfatal. |
| New browser regressions | Passed in both browsers: failed legacy upgrade recovery, copy income choices, debt/report/receipt/income navigation and cross-month cash scope. |
| Full production Playwright suite | **74 passed / 45.0 seconds**, 37 Chromium + 37 Firefox, 4 workers. |
| Layout matrix | Six routes, both themes, 320/768/1280/1440/1920/2560/3840px, long names/large values and 200% CSS zoom; right rail placement and wide debt layout pass. Mobile behavior is preserved, not redesigned. |
| Existing financial/storage regressions | Old portable imports, native upgrades/reopen, atomic rollback, confirmed splits, ordered undo, recurrence failure/retry, income links, demo isolation, cross-tab changes, backup roundtrip and offline reload/fonts pass. |
| Screenshot evidence | 48 full-page captures from the full suite: six routes × light/dark × 320/1440 × two browsers. Six additional desktop-light captures at 1920×1080, with Ledger inspector open, were visually inspected. |
| Whitespace | `git diff --check` passed. |

The first full runs found six date-sensitive failures because the runner's default browser timezone was **Asia/Seoul**: a 16:00 UTC fixture had already crossed into the next local date. Fixed-time profiles now explicitly use UTC and en-US; the complete suite passes with the intended original amounts and dates, without changing production calendar logic or weakening assertions. Desktop-light supplemental captures use America/New_York to show localized timestamps. Browser timers keep running normally under `setFixedTime`.

Local Chromium is 153.0.8010.0 selected with the existing executable override. Firefox is 157.0, Playwright build 1555, from the official fallback download host. Local root-container Firefox needs `MOZ_DISABLE_CONTENT_SANDBOX=1 MOZ_DISABLE_RDD_SANDBOX=1`. These runtime files/environment settings are outside the repository; standard CI installs remain unchanged. npm proxy notices and existing Zod annotation warnings do not fail checks.

No manual screen-reader, Safari/WebKit, physical device or actual browser-zoom certification is claimed. CSS zoom is a separate automated check. Update confirmation has unit coverage, not a newly staged multi-version service-worker deployment. Maximum-scale performance, downloads saved to disk and lender-specific accounting are not certified.

## Review locally

Use Node 22.12+ in the 22.x line or 24+, then `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. Install Playwright Chromium/Firefox and run `npm run test:e2e`. CI retains the full browser report and screenshots in `playwright-review-evidence`.

Run `npm run preview -- --host 127.0.0.1 --port 4173`, then open `http://127.0.0.1:4173/?demo=1#/` for the interactive synthetic demo. Its six routes use the same forms and calculations with separate storage. Normal workspace: `http://127.0.0.1:4173/#/`. Keep origin/profile constant for persistence. The review ZIP contains the fresh screenshots and this decision record.
