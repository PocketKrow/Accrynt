# Accrynt v0.2 QA evidence

Verified on **2026-10-16**, against a source snapshot of `main` at `a093a2ee3693cd96144bb09c594e733cafbbeac7` plus the stabilization changes in this PR. The baseline's 36 tracked files were checked against GitHub blob hashes before modification. No production browser profile or real financial data was used in tests.

## Environment and results

Linux container; Node.js **24.19.0**, npm **11.9.0**. Resolved runtime packages include Vue **3.5.44**, Pinia **3.0.4**, Vue Router **4.6.4**, Dexie **4.4.6**, and Zod **4.6.7**. Build/test tooling includes Vite **7.3.7**, TypeScript **5.9.3**, Vitest **4.1.12**, Playwright **1.64.1**, and fake-indexeddb **6.2.5**. Existing runtime/build dependency ranges were retained; Vitest was updated to a patched 4.1 release after audit findings in the original test-tool chain; the generated lockfile records exact resolutions.

| Check | Actual result |
| --- | --- |
| `npm ci` | Passed; reproducible installation from the committed dependency graph |
| `npm run typecheck` | Passed; includes Vue templates, application, unit tests, E2E tests, and configs |
| `npm test` | Passed: **40 tests** in 2 files |
| `npm run build` | Passed, including production service-worker generation |
| Chromium production browser smoke suite | Passed: **9 tests**, using real IndexedDB and service workers |
| `git diff --check` | Passed |
| Firefox, WebKit/Safari, real mobile devices | Not executed locally |
| Remote GitHub Actions | Not represented as a successful run by this local report; inspect the PR checks |

The browser command was:

```bash
ACCRYNT_CHROMIUM_PATH=/absolute/path/to/chromium npm run test:e2e -- --project=chromium --workers=1
```

The normal Playwright browser download returned a 195-byte HTML response instead of a browser ZIP in this environment. Local browser tests therefore used **Chromium 153.0.8010.0**, extracted from the npm-distributed `@sparticuz/chromium` **153.0.0** runtime, with Playwright's custom-executable option. That runtime is external test infrastructure and is not an application or repository dependency. This is a passing Chromium smoke run, not proof that the default Playwright Chromium/Firefox binaries or every browser work. CI is configured to install the standard Chromium and Firefox runtimes.

The install emits an upstream `glob@11.1.0` deprecation warning. The successful production build emits two upstream Zod pure-annotation warnings, which Rollup removes. These did not cause validation failures; see the point-in-time advisory audit below.

## Finance and storage coverage

The unit/storage suite uses fake-indexeddb in isolated Node workers; it does not touch a browser profile. Cases cover:

- Exact cents, monetary grouping, supported amount limits, leap days, low calendar years, month/year rollover, and date bounds.
- Plan/actual separation and unchanged debt balances when paid status changes.
- Missing debt/obligation references, incompatible new transaction types, positive new transaction amounts, and immutable historical obligation months.
- Stale edits, deleted records, and consecutive edits within the same millisecond.
- Link-safe deletion and concurrent link creation/debt deletion.
- December-to-January copy with new IDs, reset statuses, preserved source history, and rejection of occupied targets or absent sources.
- Optional examples only in a completely empty workspace.
- JSON roundtrip and database close/reopen; duplicate keys in every table; malformed payloads, unsupported schema versions, invalid dates, and missing references.
- Restore rollback after an injected write failure partway through replacement, with all original tables preserved.
- Consistent backup snapshots during concurrent deletion, valid v1 zero-value history, and cross-month payment links.
- Live-query refresh, subscription disposal/restart, and read-error recovery.

## Real-browser coverage

The nine production tests use fresh Playwright profiles with synthetic records:

1. Income drafts close when months change; income, obligations, and paid status survive reload without generating ledger transactions. On launch the selected month returns to the current month, so the test navigates back to the saved historical month.
2. Transaction dates determine offered obligations; changing to income clears an existing payment link in the exported record.
3. JSON download, invalid JSON rejection, cancelled deletion, incorrect DELETE text, correct deletion, validated restore, and exported-record equality.
4. Storage estimate, the persistence request's actual browser response, and dark-theme preference after reload. Firefox's native persistence prompt is explicitly granted in that isolated Playwright context; Chromium follows its normal browser decision.
5. Service-worker readiness, a subsequent controlled navigation, offline reload with saved records, and offline Reports navigation.
6. All six pages in both themes at **320 × 800**, no document-level horizontal overflow, mobile navigation, dialog autofocus, Escape and focus restoration, and reduced-motion emulation. A **1440 × 1000** check confirms the desktop rail remains to the right of main content.
7. Real cross-tab paid-state refresh and rejection of a stale edit after the other tab deletes its obligation.
8. A temporary IndexedDB-open failure shows Retry; re-enabling access and retrying restores the view with its saved obligation intact.

The mobile light/dark Overview and desktop dark Overview screenshots were visually inspected. Screenshot outputs and failure traces are generated under ignored `test-results/`; the HTML browser report is under ignored `playwright-report/`. The two contrast corrections address the light-theme small secondary labels (about **4.91:1** against their table-heading surface) and cyan text on the dark allocation panel (about **10.18:1**). These targeted checks are not a complete WCAG or screen-reader audit.

9. A controlled pending persistence decision shows Waiting, disables duplicate requests, and handles refusal while preserving the saved obligation. This refusal case stubs only the permission promise; the other tests use real IndexedDB.

## CI findings and follow-up

The initial [GitHub Actions run](https://github.com/PocketKrow/Accrynt/actions/runs/38879693112) passed install, type checking, all 40 unit/storage tests, the production build, and 15 of 16 browser cases on the standard Chromium/Firefox runtimes. Its Firefox persistence case waited for an unanswered native permission prompt. The test now explicitly grants Firefox persistence through Playwright's supported permission API, and the app visibly reports a pending permission decision with a separate refusal regression. The latest PR checks are authoritative for the final cross-browser result.

An explicit `npm audit --json` found advisories in the original Vitest 3 test-tool chain. Updating to Vitest **4.1.12** removed those findings; the post-update audit reported **zero advisories** on 2026-10-16. No application runtime library range was changed. This is point-in-time advisory evidence, not a guarantee of absence of security defects. Relevant advisories: [Vitest mocker](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), [Tinypool worker options](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), and [Tinypool run options](https://github.com/advisories/GHSA-85c8-ppgw-ccpr).

## Remaining limits and next milestone

- Local Firefox and Safari/WebKit validation, physical-device testing, full accessibility testing, PWA installation UI, and the update-available reload flow remain unverified.
- Browser persistence can be refused; clearing site data or a browser profile can still remove records. Portable backups remain unencrypted, and the UI import limit remains 15 MB.
- There is no schema migration in this change: IndexedDB schema version 1 and portable JSON schema version 1 are retained. Valid v0.1 history is preserved.
- Existing manual paid status and real ledger transactions intentionally remain separate. There is no automatic principal/interest reconciliation or debt-balance reduction.
- Next milestone: complete monthly budgeting with deliberate recurring definitions, due-date states, and preserved history. Implement linked payment recording only with explicit partial-payment and reconciliation rules.

Implementation references: [Dexie transactions](https://dexie.org/docs/Dexie/Dexie.transaction()), [Dexie liveQuery](https://dexie.org/docs/liveQuery()), [Playwright web server](https://playwright.dev/docs/test-webserver), and [Playwright service workers](https://playwright.dev/docs/service-workers).
