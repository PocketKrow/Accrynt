# Accrynt v0.9 — clarity, backup confidence and ordinary entry

Baseline: main `ab458cfde632642b1e21284299abca6cb68dfad8`, v0.8.0, PR #13 integrated. Rechecked before publication; main had not advanced. Implementation head/tree and final remote CI are recorded in the PR because this document is part of the tested tree. No merge, deployment, tag, release, license or repository-setting change is included.

## Scope matrix

| Requirement | Status | Result and focused evidence |
| --- | --- | --- |
| A · Ledger scope and filtered totals | Complete | Selected-month actual cards retain their meaning. Full matching counts and actual income/outflow/net stay independent of 50-row pagination; future amounts/counts are separate. Empty month/history/filter states and clear-filters retain period. CSV retains every matching row, including scheduled. 122-row synthetic fixture exercises all type/scope/search states and CSV. |
| B · Inspectable cash and commitments | Complete | One native disclosure dialog reuses store cashflow/payment states for all three metrics, exposes opening unknown/zero/negative, cross-month bill satisfaction, capped outstanding/manual-confirmation lists and contextual month/type/status links. Manual confirmation is explained without alleging a missing payment. Keyboard entry, Escape/close and focus return have browser coverage. |
| C · Backup freshness | Complete, conservative unknown fallback | Native v5 metadata, atomic monotonic revisions, exact-snapshot export association, older/out-of-order export guards, persisted SHA-256 witnesses for untracked legacy writers, unknown on unsafe relationship, personal/demo isolation and seven-day Settings-only reminder/snooze. Portable v5 remains unchanged. See [ADR 0003](ADR-0003-backup-revisions.md). |
| D · Ordinary entry | Complete | Bounded explicit native suggestions and Save and add another for new ordinary income/expense. Retained convenience fields; clean next draft, new request ID, cleared links and Description focus after enabling controls. Failure/retry, double-click, distinct records, editing restrictions, generic outflow exclusion and normal shared-guard save/close tested. |
| Maintenance | Complete | package/lock root 0.9.0 only, current README, unchanged dependency resolutions and Node support, Node 22 type/unit/build CI job alongside primary Node 24 full browser job. |

## Storage and compatibility decisions

All financial writes pass through one DBCore middleware, including implicit/bulk writes and the audited repository/seed/restore/clear entry points. Revision and witness changes use the same native transaction as cash/plan/debt records. Failed writes abort even when a caller catches the failure. Same-value durable writes conservatively count; idempotent requests that issue no write stay clean. Counter/epoch metadata survives restore/clear/reset. No browser health metadata enters portable exports or affects financial arithmetic.

An executable compatibility test found that Dexie v4 declarations can reopen a native v5 database after versionchange closes them. A version bump alone is not a writer fence. Per-table content witnesses detect legacy edits/deletions/replacements even while this app was absent. Such relationships become **unknown**, never falsely current. A same-content rewrite cannot be distinguished from identical content; the exact UI assertion is “No later tracked record changes.” No claim is made about malicious metadata tampering, verified bank balances or actual files saved to disk. Unsafe/missing metadata remains unknown rather than being repaired from timestamps or row counts.

Witnesses are established on upgrade without changing financial rows. Only Settings and export verify the full witness set; ordinary routes retain their original consistent financial snapshot. Affected-table mutation checks stay atomic and bounded, with no full-workspace hashing on draft input and no per-record storage lookup. The benchmark now seeds through portable restore rather than an untracked raw writer, and includes transaction-table saves.

Compatibility evidence includes original portable v3, strict v1/v2/v4 fixtures and pre-v0.9 portable v5 roundtrips; native v1/v2/v3 migrations, unchanged existing native v4 rows and native v5 reopen; failed-upgrade raw recovery; all seven financial tables; legacy links/receipts; invalid imports and rollback. Raw native recovery now correctly sees eight stores/version 50; its unvalidated envelope remains deliberately rejected by portable import. The 64,000,000-byte UTF-8 ceiling and review above 15,000,000 bytes remain unchanged. Valid 24,000-row non-ASCII restore and 80,000-row oversize refusal stay in the suite.

## Automated checks

Baseline before changes: lockfile `npm ci`, typecheck, **160 tests** and production build passed. The original source was tested locally at `8d5f420bfdb5085732e0379bb8ee54305b872360`. Its app code is identical to implementation commit `43e632885c9fc49711f2e382ce0bd8022a4c73c0`; the follow-up only makes the long-label browser fixture sort into the bounded review list. The connection-created implementation commit `4d6015c03bd30430567fe6d994649adc1fae02c1` has exactly the same Git tree (`0cddd55a03c4cdd6a9a8e54194096c1b631285aa`) as that local implementation commit. Delivery adds this report, focused images, timing evidence and the test fixture correction. A final native-version guard refuses unsupported newer schemas (including extra financial stores) without writing or exporting their data; its additional regression raises the final unit count to 183. The final guard and its tests are revalidated before the PR handoff. Final remote tree/head and CI are verified in the PR.

| Check | Executed result |
| --- | --- |
| Node 24.19.0 typecheck and unit/storage | Passed · **183 tests**, 15 files |
| Node 22.23.3 typecheck and unit/storage | Passed · **183 tests**, 15 files |
| Production build on both Node lines | Passed · 23 offline precache entries |
| Complete browser suite on final source | **125 passed**, no retries: Chromium 61, Firefox 61, WebKit smoke 1, timezone projects 2 |
| Diff whitespace check | Passed |

Local Chromium used the existing executable override (153.0.8010.0), rather than Playwright's default Chromium. Official Firefox 157 and WebKit 27.2 binaries ran. The default Chromium download was truncated by the environment. WebKit's missing official Ubuntu libraries were downloaded and extracted into disposable scratch; an uncommitted local config only selected a wrapper around the same official WebKit binary so it could load those libraries. Local Firefox content sandbox and host preflight scanning were disabled inside disposable container profiles. None of these runtime accommodations changes CI: it installs standard Playwright Chromium/Firefox/WebKit with system dependencies. Physical Safari/iOS remains unverified. Final local browser invocation used `ACCRYNT_CHROMIUM_PATH`, `MOZ_DISABLE_CONTENT_SANDBOX=1`, `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` and `npx playwright test --config=playwright.local.config.ts --workers=2`; that machine-specific config is intentionally excluded from the PR.

Checks run without broad retries or raised assertion timeouts:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
git diff --check
```

The v0.9 test file exercises each financial table, direct and bulk mutation, rollback including post-write witness failure, same-count replace, deletion-only change, recurrence idempotency, manual paid, connected payment/undo, adjustments/reversal, income/opening/copy, skipped bill restore, explicit example and demo seed isolation, cross-connection writes, exact capture/write/initiation races, reversed export completion, metadata persistence failure, missing/legacy initialization, counter exhaustion, untracked legacy reopening and exact reminder boundaries. Domain tests cover opening unknown/zero/negative, partial/cross-month and undone payments, future-only matching and totals beyond one page.

A final scope correction keeps repeat entry available for ordinary linked income/expense (including seeded income receipts); both association types are tested to remain on the saved row and clear from the next draft. Browser additions cover filters/counts/CSV/empty states, all three breakdowns and context links, bounded manual-paid review with long labels at 320px, repeat entry and distinct records, failure/retained inputs/retry, normal Save and continue, cross-tab backup health, deletion/restore and demo isolation, reminder dismissal/reload and unchanged old exports. The retained broader suite covers connected semantics, local midnight in New York/Auckland, offline reload and a real waiting production service-worker update with a dirty editor. Its responsive matrix remains 320/768/1280/1440/1920/2560/3840 in both themes.

During development: repeat focus initially targeted a disabled field; it now runs after busy clears. A native Firefox datalist popup consumed Escape; the test dismisses suggestions before testing the clean dialog's Escape. Existing empty-state assertions were updated to the deliberate month-specific wording. A repeated abort initially masked the original injected storage failure; the guard now preserves that error while retaining rollback. The long-label fixture originally sorted its partially covered bill outside the intentionally capped first ten; its name now sorts first, preserving the exact $80 assertion and the cap. Earlier unsuccessful runs are not reported as passes.

## Visual evidence

Baseline screenshots were captured from main's production build before implementation. The changed production surfaces were captured using synthetic demo records at 320×850, 390×850 and 1920×1080 in both themes, with no page errors or document overflow. Native dialog content scrolls internally; entry-action captures scroll to the buttons. Focused before/after images were opened and inspected, including desktop Ledger, Overview and Settings, narrow Settings and breakdown, and transaction entry/actions. Representative images are retained in [v09-evidence](v09-evidence); the capture script produces the full local matrix.

| Surface | Before | After |
| --- | --- | --- |
| Ledger · light desktop | [Before](v09-evidence/before-light-1920-ledger.png) | [After](v09-evidence/after-light-1920-ledger.png) |
| Settings · dark desktop | [Before](v09-evidence/before-dark-1920-settings.png) | [After](v09-evidence/after-dark-1920-settings.png) |
| Entry · dark 390px | [Before](v09-evidence/before-dark-390-entry.png) | [After](v09-evidence/after-dark-390-entry-actions.png) |
| Overview · light desktop | [Before](v09-evidence/before-light-1920-overview.png) | [After](v09-evidence/after-light-1920-overview.png) |
| Cash disclosure · dark 320px | New disclosure | [After](v09-evidence/after-dark-320-breakdown.png) |
| Settings · light 320px | [Before](v09-evidence/before-light-320-settings.png) | [After](v09-evidence/after-light-320-settings.png) |

Reproduce: `node scripts/capture-v09.mjs after`, optionally with the repository's Chromium executable override. Manual-confirmation screenshots are also attached to the browser report using wholly synthetic records.

## Performance and remaining manual gates

Visual captures and timing samples were collected from the app code at `8d5f420bfdb5085732e0379bb8ee54305b872360`, before the final ready-time native-version guard; that follow-up only rejects unsupported database versions and makes no supported-workspace layout change. The final isolated six-year samples are retained in [workspace-benchmark.json](v09-evidence/workspace-benchmark.json). Fixture: 72 months, 3,600 obligations, 24,000 transactions, 1920×1080, production preview and a disposable Chromium profile. Startup includes IndexedDB, Pinia and rendering; saves include committed metadata/witness work and updated UI. The first raw-seeded run was unsuitable for measuring verified health; the corrected fixture uses actual portable restore. Concurrent runs were noisier and are not the final comparison. Final isolated medians: startup **398 ms**, monthly save-to-render **386 ms**, transaction creation/save-to-render **923 ms** (three transaction samples: 931/916/923 ms). The earlier v0.8 report measured 325/286 ms for startup/monthly save in its own run; timings vary with runtime and host load. These are local container measurements, not universal latency promises. Table witness checks add work on large transaction writes; no unbounded selector or N+1 query path is added.

Physical phone keyboards/file pickers/resume, actual 200%/400% browser zoom, manual screen readers and real Safari/iOS PWA install/update/storage remain release gates. Automated WebKit, viewport emulation and CSS zoom do not certify those checks. Browser download initiation never proves external saving. The owner still controls merge/deployment/release/licensing decisions.
