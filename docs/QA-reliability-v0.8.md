# v0.8 reliability and daily workflow

Starting main: `f86a1371048c503379f436eccc69a56f9cbcc399` (PR #12 integrated). App milestone: 0.8.0; no release, merge, deployment, license or repository-setting change is part of this work. Final tested commit is recorded in the pull request because this evidence file is part of that commit.

## Findings and changes

| Finding | Implemented behavior | Regression evidence |
| --- | --- | --- |
| Exports could exceed the 15 MB file-picker limit | One 64,000,000-byte UTF-8 contract. Valid 15–64 MB files get an extra review before reading. Oversized portable exports are refused; labelled raw recovery remains for manual repair. | Schema-valid 24,000-row non-ASCII export is downloaded, reselected and restored through Settings; exact 64 MB and +1-byte input boundaries; malformed files and both cancellation points preserve records. A valid 80,000-row oversized workspace refuses portable export without changing records. |
| Monthly income/opening saves overwrote newer values | Required editor-opening baseline, checked inside the month write transaction. The edited field uses compare-and-set by value; current sibling fields are retained. A deleted existing month conflicts. An absent month can acquire an unchanged default field via an independent sibling save. Copy-month replacement uses the same baseline. | Competing same-field writes, actual two-tab stale editor, independent fields, absent/zero/unknown/deleted/replaced values, copy rollback, successful saves and failed-save draft retention. |
| Forms had no real dirty protection | A small shared in-memory editor registry, one three-choice review dialog, native validation before Save and continue, and in-flight checks. Route/month changes, modal Close/Cancel/Escape, demo reset and PWA update share it. Browser unload uses `beforeunload`. Fields disable during saves. | Clean/dirty/reverted drafts, cancel/discard/save, failed saves, busy/duplicate review, native cancelled reload and a real updated production service worker with dirty input. |
| Generic Debt payment looked like connected principal reduction | Ordinary payment choice transfers date/name/amount/account to PaymentForm without writing a transaction. The separate generic path says “Debt outflow only · balance unchanged.” Existing generic history is retained. | Partial connected payment, receipt, balance and bill effects, rapid double submit, outflow-only path and correct exported totals. |
| Skipped recurring bills had no restore UI | Compact selected-month list and reviewed restore. Delete captures the current bill’s name/amount/day into its existing occurrence. Restore uses that snapshot, requires category/debt review and creates a new bill identity. Deterministic occurrence identity stays unchanged. | Delete → restore → reopen/reload, concurrent tabs and repeated requests, changed/paused rules, deleted selected debt, stale skip, conflicting links and unchanged detached receipts/cash. |
| Passive restore toast intercepted a narrow Firefox control | Status-only toasts ignore pointer events; actionable update banners remain interactive. | A retained Firefox trace identified the toast interception during the existing 320px debt-schedule scenario. |

Monthly conflict checks are **field-value comparisons**, not new persistent per-field revision columns: writing a different current value is rejected; an unchanged value is still safe to edit. Identical-value rewrites (including a restore of identical monthly values) do not create a conflict. This preserves v5 compatibility and allows independent fields to save without false row-wide timestamp conflicts. The editor’s baseline never follows live store snapshots.

Skipped occurrences have no historical category/debt fields in native v4/portable v5 data. The restore UI makes that absence explicit instead of inferring mutable rule settings. Concurrent identical restores converge on the first bill; different link choices report a conflict. Deleted debts are not recreated. Old transactions and historical receipts stay detached; restored bills start without a manual paid mark or attached payment.

## Compatibility and bounded additions

- Money, APR units, unknown versus zero, date cutoffs, receipt ordering, reversals, expected income, explicit interest posting and atomic connected payment semantics remain unchanged.
- Native Dexie stays **v4**. Portable exports stay **v5** with v1–v4 import support. Existing migration code and the original v3 fixture are unchanged.
- No dependencies, dependency resolutions, engines, database names or preference keys changed. Lockfile changes only mirror the root app version. UI version imports package.json.
- Prior completed-calendar-month recorded closing cash is an optional opening draft suggestion. It needs an explicit Use action and Save. The source month and possible missing records are shown. No suggestion uses a current/future source month or replaces existing opening cash. Historical edits never cascade. Unknown/zero/negative semantics have unit coverage and a browser workflow.
- First-run buttons open opening cash, income or the bill editor directly. Demo remains optional and separate. Schema explanations live in technical/compatibility disclosures; material recovery/size warnings remain visible.
- **Deferred optional backup health**: add workspace-scoped download-initiated metadata plus a monotonic mutation revision covering insert, edit, delete, restore, clear and cross-tab operations; capture the revision of the actual exported snapshot, then show changes since that revision and a dismissible reminder. A newest-row timestamp or row count is insufficient for deletions/replacements. Never label a download saved/verified, and never put financial payloads in localStorage. This follow-up requires a deliberately reviewed revision contract; this PR does not ship a misleading approximation.

## Validation

Baseline on fresh main: `npm ci`, `npm run typecheck`, `npm test` (142 passing), `npm run build` succeeded.

Implementation commit: `e60ba7a54c112ae50bacc327068283fe2a69ccb9`. The GitHub connection created this commit with tree `909869a58bebd8c06dd3d04e79b312145cab2c47`; fetching it confirmed exact equality with the locally tested implementation tree (only commit metadata differed). Typecheck, unit tests and build were also repeated after checking out that remote implementation commit. The first delivery commit adds documentation/screenshots only. A test-only follow-up waits for completion of the large restore. A further focused fix preserves dirty state when user-typed transaction fields are transferred to connected payment; ordinary clean prefilled forms remain clean. Exact subsequent head SHAs and final browser-run results are recorded in the PR.

| Check | Final result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | **160 passed**, 14 files |
| `npm run build` | Passed; 23 offline precache entries, 688.01 KiB |
| Original complete Playwright pass | **105 passed**, no retries: Chromium 51, Firefox 51, WebKit smoke 1, timezone projects 2 |
| Typed-draft transfer follow-up | New regression **2/2 passed** locally (Chromium/Firefox), plus a new shared-guard unit test; current full suite has 107 cases, final result in PR |
| Focused Firefox 320px schedule after passive-toast fix | **3/3 passed** |
| Render capture | 14 screenshots, no page errors or document overflow |
| `git diff --check` | Passed |

A prior full run found the passive-toast pointer interception in Firefox. The trace was inspected, the cause fixed, and the complete suite rerun to 105 passing. No unsuccessful run is presented as a pass. The first remote CI run (39069206872) passed 104 cases but failed the large Firefox restore assertion on both attempts. Its trace showed disabled controls with the restore still busy and no storage error at the five-second assertion deadline. That synthetic 24,000-row test now waits up to 30 seconds for the operation to settle, then checks success and compares the actual downloaded/restored transactions. Other assertions/timeouts and application resource limits are unchanged. The typed-draft transfer follow-up adds explicit initial dirty-state inheritance to the shared guard and a regression that cancels/reviews/discards a transferred draft without writing money. Both changed browser workflows passed focused local runs. The follow-up CI result is recorded in the PR. Node is 24.19.0. The package still supports `^22.12.0 || >=24.0.0`; Node 22 was not run locally.

```bash
npm run typecheck
npm test
npm run build

# Local container only: Chromium override and disposable-browser runtime accommodations.
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
MOZ_DISABLE_CONTENT_SANDBOX=1 \
ACCRYNT_CHROMIUM_PATH=/workspace/scratch/eb09984cd021/browser-runtime/chromium \
npm run test:e2e -- --workers=2
```

Local Chromium is 153.0.8010.0, used through the existing executable override; it is not the Playwright-default Chromium build. Firefox 157 and WebKit 27.2 were downloaded with Playwright. Standard WebKit dependency installation was blocked by container package-manager permissions. Missing official Ubuntu runtime libraries were downloaded/extracted locally into the disposable browser runtime. Runtime preflight scanning was bypassed **locally**, while the actual browsers executed tests. Firefox’s content sandbox was disabled **only in disposable local test profiles** to run inside this container. CI uses standard Playwright `install --with-deps chromium firefox webkit`, with no such bypasses committed to its workflow.

Browser coverage: full Chromium and Firefox projects; focused WebKit storage/form/navigation/backup-restore smoke; America/New_York and Pacific/Auckland local-midnight/month-boundary actuals; real production PWA offline reload and waiting-worker update with a dirty editor. WebKit automation is not Safari/iOS certification. The existing matrix still exercises 320, 768, 1280, 1440, 1920, 2560 and 3840px in both themes. CSS zoom assertions remain distinct from real browser zoom.

Rendered inspection: changed Settings, skipped-bill restore and dirty review at 320×850 and 1920×1080, both themes; first-run Overview in both themes at desktop. Fourteen PNGs live in [reliability-v08](reliability-v08). Dialog captures use the visible viewport; settings/first-run include full content. No page errors or document-width overflow occurred in the capture pass. Reproduce with `node scripts/capture-reliability.mjs` (set the existing Chromium override when required).

## Performance

`node scripts/benchmark-workspace.mjs` uses a disposable browser profile, production preview, 72 months, 3,600 obligations and 24,000 transactions. It measures five full-document startup-to-render samples and five click-save-to-updated-metric samples, including IndexedDB, liveQuery, Pinia and Vue rendering. It does not merely time an isolated finance function. Synthetic data contains no personal records. Timing is local container evidence, not a device guarantee.

Final isolated samples (warm browser assets, full-document loads) are in [workspace-benchmark.json](reliability-v08/workspace-benchmark.json): startup **340, 325, 320, 317, 352 ms** (median **325 ms**); save-to-render **277, 286, 271, 292, 375 ms** (median **286 ms**). Runs performed concurrently with other browser tests were noisier (up to 974 ms save-to-render); the isolated pass was collected after those processes finished. No storage-layer rewrite was justified for this bounded milestone. `readWorkspace` still reads all seven tables in one consistent snapshot; profiling on real target hardware at larger scales remains the criterion for scoped/indexed-query work. Export/restore keeps consistent snapshots.

## Outstanding release gates

1. Physical phone checks at narrow widths: inputs, keyboard, scroll, nested draft review, file picker/download and resume/reload. Native beforeunload cannot reliably intercept OS process termination or every mobile close path.
2. Actual browser zoom (200% and 400%), keyboard-only navigation and a manual screen-reader pass for all affected editors and the review dialog. DOM and CSS zoom checks do not certify these.
3. Real Safari/iOS PWA install/update/storage behavior, plus owner confirmation of the revised workflows using personal data only after an external backup.
4. Owner decisions on a license, repository protection, release/tag and deployment. Nothing here authorizes or performs those actions.
