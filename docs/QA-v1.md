# v1 candidate validation and release gates

Prepared 24 October 2026. Baseline main: `e2014085c484d6f26995a0be8bf2f574d925831c`.
No applicable AGENTS.md was found in the checkout/its task ancestors. No open issues
or PRs were returned when work began. The final exact delivery SHA, tree comparison
and remote CI links are recorded in the PR because this report belongs to that tree.
This is **1.0.0-rc.1**, not a public-v1 sign-off.

## Automated evidence

| Area | Evidence |
| --- | --- |
| Fresh baseline | Node 24.19.0, npm ci, typecheck, 183 tests / 15 files, production build passed before implementation |
| Financial/storage regressions | Existing integer-cent/date/link/receipt tests, connected rollback/idempotency/stale-tab/undo, v1–v5 portable imports, native historical migrations, unsupported-schema refusal, legacy-writer edits/deletes/replacements, out-of-order exports and demo isolation retained |
| Fingerprint compatibility | `src/tests/fingerprint.spec.ts` compares independent original canonical witnesses against every synthetic table and nested JSON; verifies the embedded-NUL raw-key regression |
| Downloaded recovery | `e2e/recovery-drill.spec.ts`: six months, all seven nonempty tables, bill/income recurrence, partial/connected payments, historical receipts, statement event, skipped occurrence and future entry; creates a further connected payment, downloads actual bytes, restores in a fresh profile, compares every financial field and three cash totals; Chromium additionally exports to Firefox |
| Legacy and refusal paths | Retained storage tests cover v1–v5 imports; browser suites retain legacy import/native upgrade, invalid arithmetic/links, malformed file preservation, real non-ASCII >15 MB restore, exact 64 MB and oversized refusal, damaged/raw recovery and failed replacement rollback |
| Browser/accessibility | Existing responsive/populated layout, all six sections, both themes, narrow long content/large amounts, keyboard dialogs, focus restoration, error/status announcements, offline reopen, real waiting worker update and New York/Auckland date boundaries retained; new security test visits empty and populated sections in both themes; transaction initial focus added; first-use walkthrough checks opening → bill/income → partial receipt/payment → exact cash disclosure → backup |
| WebKit expansion | `connected.spec.ts`, `recovery-drill.spec.ts`, `webkit-reliability.spec.ts`, `security.spec.ts` plus original smoke; focused connected receipt/debt/cash/undo, stale form, recurring income, fresh restore, retained failed save and exactly-once retry/draft checks |
| Host policy | `deployment/headers.json` enforced by production preview and the synthetic PWA-update server; no unexpected external requests/page errors; Chromium/Firefox have no CSP violations across routes/themes; intentional inline-script negative control must be blocked; Zod interpreted mode avoids eval; the WebKit native-select CSP blocker remains strict and visible |
| Advisory review | Two vulnerable transitive **build-time** packages reached through vite-plugin-pwa → workbox-build: fast-uri via ajv and serialize-javascript via the terser plugin. Browser financial input is not supplied to these tools. Targeted compatible resolved updates only; fresh audit evidence is in `v1-evidence/advisories-{before,after}.json` |
| Source privacy/security inspection | No application fetch/outbound endpoint, remote executable/font import, console financial logging, v-html or innerHTML sink found in src. Local-only request checks complement that inspection, not a live-host log audit. Existing JSON UTF-8/receipt/link and CSV formula-boundary tests retained |

### Known automated WebKit blocker

WebKit 27.2 (Playwright 1.64.1) emits a `style-src-attr` violation when it creates a
native `<select>`, including a plain HTML page with no authored styles. The event
target is the select; the source application call site is `document.createElement`.
This was reproduced independently of Accrynt. Playwright's maintainer confirms the
WebKit regression in [#43497](https://github.com/microsoft/playwright/issues/43497)
and [#43416](https://github.com/microsoft/playwright/issues/43416), tracked upstream
as WebKit 327212. The current latest stable Playwright queried here is 1.64.1; an
alpha or browser downgrade was not introduced to manufacture a pass.

`security.spec.ts` still exercises **all** routes/themes/states, headers, cache
controls, local-only requests and a blocked inline-script control before asserting
zero recorded CSP violations. It remains a real failing check on WebKit. No retry,
skip, broad console filter, `bypassCSP`, unsafe-inline allowance or weakened assertion
hides it. Connected workflows, fresh restores and failure/retry run independently.
Real Safari/iOS behavior is not inferred from this engine warning; verify on hardware
and rerun the strict automated check when a fixed stable WebKit build is available.
The immediate observed impact is CSP violation noise from native controls; no
financial failure was reproduced by that warning. Clean WebKit CSP validation remains
a release gate and the PR must disclose its failing CI job.

Reproduce with the standard production build:

```bash
npx playwright test --project=webkit-smoke e2e/security.spec.ts
```

Minimal independent reproduction: serve `<select><option>A</option></select>` with
`Content-Security-Policy: default-src 'none'; style-src 'self'; style-src-attr 'none'`
and attach a `securitypolicyviolation` listener before navigation in WebKit 27.2.
Creating a select dynamically reproduces it too. The other engines do not emit it.

Final test counts and runtime details are recorded below. Historical
v0.9 counts are not reused as current results. No automated check certifies a saved
file on a real device or manual assistive-technology completion.

## Performance decision

Use production preview and the existing valid portable-restore fixture. Seven
samples each for startup, monthly save-to-render and ordinary transaction save.
Small workspace: 6 months / 60 bills / 240 transactions. Large workspace: 72 months /
3,600 bills / 24,000 transactions. Viewport 1920×1080, disposable Chromium 153.0.8010.0,
Ubuntu 24.04 container, Node 24.19.0. Date is fixed without mocking the performance APIs.

Instrumented baseline, large fixture: median startup **394 ms**, monthly save
**386 ms**, transaction save **955 ms**. For the transaction path, median measured
before-write table read **194.7 ms**, canonicalize/encode across both witnesses
**113.8 ms**, SHA-256 waits **11.1 ms**, financial mutate request **0.7 ms**, full
workspace refresh **230.2 ms**, payment selector **3.2 ms**, monthly summary **4.2 ms**.
These spans do not sum to total latency: some overlap, the post-write read/commit,
rendering and Playwright observation are outside them. Long tasks were typically
two ~80–100 ms tasks. Heap bytes were unavailable from this Chromium runtime; no
memory claim is made. Small baseline medians: **92 / 71 / 82 ms** respectively.

An experiment replaced Object.fromEntries/map-pair allocation with direct ordered
property copying, preserving the original JSON witness and special __proto__ handling.
Large transaction median stayed essentially unchanged (**954 ms**), canonicalization
fell to **104.2 ms**, and small transaction median was **74 ms**. That modest result
does not justify extra canonicalization complexity. The experiment was **removed**.
Its startup/monthly samples overlapped unit-test load and are unsuitable for comparison;
they are retained transparently as experiment data, not a performance improvement.
No tail-percentile claims are made from seven observations.

Retain full affected-table before/after witnesses and consistent workspace reads:
they protect against legacy writers and false backup freshness. No worker, incremental
hash, cache invalidation protocol or storage rewrite was added. Only the independent
NUL-shape correctness fix remains. Final uninstrumented candidate measurements below
are the supported local envelope, not a physical-device guarantee or speedup claim.
Representative-device performance acceptance is still required.

Final uninstrumented candidate (seven samples per operation):

| Synthetic workspace | Startup median | Monthly save median | Transaction save median |
| --- | --- | --- | --- |
| 6 months / 60 bills / 240 transactions | 104 ms | 73 ms | 93 ms |
| 72 months / 3,600 bills / 24,000 transactions | 396 ms | 389 ms | 931 ms |

A separate instrumented candidate run measures the full write-transaction lifetime
through native completion at **627.8 ms**, both affected-table reads at **437.4 ms**,
canonicalization/encoding **122.2 ms**, SHA-256 waits **11.0 ms**, snapshot refresh
**231.3 ms**, and snapshot-publication to a subsequent animation frame **32.7 ms**
(medians, large transaction path). The last span includes Vue reconciliation and
frame scheduling, not an isolated GPU paint measurement. Transaction spans contain
their read/hash/write children and must not be added together. The instrumented
candidate transaction end-to-end median was 994 ms; do not compare its overhead
to the uninstrumented candidate as a speed regression. Raw final samples are
`candidate-{large,small}.json` and `candidate-profile-{large,small}.json`.


Reproduce on a stable checkout, with no other tests/builds running:

```bash
npm run build
node scripts/benchmark-workspace.mjs
node scripts/benchmark-workspace.mjs --small
# Optional stage diagnosis; generated dist is for profiling only:
node scripts/profile-build.mjs
node scripts/benchmark-workspace.mjs
node scripts/benchmark-workspace.mjs --small
# Always replace the instrumented output before correctness checks/delivery:
npm run build
```

`ACCRYNT_CHROMIUM_PATH` may select a local Chromium binary. Keep identical browser,
host load, fixture, sample counts and build settings when comparing. Raw samples
live in [v1-evidence](v1-evidence). The profiler transforms build inputs in memory,
never source files. Its hooks fail explicitly if source shapes change.

## Required manual matrix — all Pending

Record each result as: **candidate SHA / date / browser version / device / OS version /
scenario / Pass, Fail or Pending / evidence or issue reference / tester**. “Pending”
means unavailable equipment or owner action, never an emulation pass. No physical
device, manual screen reader, real zoom or confirmed live host was available here.

| Gate | Steps and expected result | Evidence record |
| --- | --- | --- |
| Android phone | Actual numeric keyboard, date/file picker, bill/transaction/payment entry at narrow width; Save/Cancel reachable and amounts/dates correct | Pending · device/browser/OS/SHA/result/issue needed |
| iPhone input/resume | Same flow, rotate, background/resume, return after OS termination; saved records persist; unsaved memory-only draft limitation understood | Pending · device/iOS/Safari/SHA/result/issue needed |
| Safari/iOS install | Install on Home Screen from HTTPS, relaunch, inspect persistent-storage decision and saved records | Pending · device/iOS/build needed |
| Safari/iOS recovery | Download actual JSON, locate file in Files, restore into separate empty storage, compare links/receipts/totals | Pending · device/iOS/build needed |
| Safari/iOS offline/update | Online worker activation, close/reopen offline; compatible new build prompts explicitly; Keep editing and Save and continue protect draft | Pending · device/iOS/builds needed |
| Real 200% zoom | Browser's zoom control on all sections/themes and payment/transaction/restore flows; internal scrolling and actions reachable | Pending · desktop/browser/OS/build needed |
| Real 400% zoom | Repeat with browser zoom control; no lost controls/content or keyboard trap | Pending · desktop/browser/OS/build needed |
| Screen reader setup | Complete opening cash → bill/expected income; navigation, focus, names and announcements understandable | Pending · reader/browser/OS/build needed |
| Screen reader money | Record income receipt, ordinary transaction and connected payment; review principal/interest, errors and cash breakdown | Pending · reader/browser/OS/build needed |
| Screen reader recovery | Download, locate/select portable JSON in empty profile, review counts/warnings and restore; status and focus understandable | Pending · reader/browser/OS/build needed |
| Representative performance | Repeat normal/large relevant workspace actions on intended supported desktop and phone; record sample counts/median and acceptability | Pending · device/browser/OS/build needed |
| Production origin/headers | Confirm host and final URL, apply contract, run checker and browser network/header/MIME/cache smoke from DEPLOYMENT.md | Pending · operator/URL/deployment/SHA needed |
| Production update/recovery | Real worker update, offline reopen, downloaded fresh-profile restore, bad-build fix-forward rehearsal; origin migration before cutover if applicable | Pending · operator/URL/builds/results needed |
| Privacy/reporting/license | Confirm host logs/retention, establish private report route, decide project distribution license; retain font notices | Pending · owner decision references needed |
| Owner RC trial | One-to-two-week normal-use checklist below, including deliberate month rollover; no data-loss/incorrect-total/duplicate-payment/failed-restore defects | Pending · Jake's recorded acceptance needed |

Proposed v1 scope keeps current desktop Chromium/Firefox and Safari/iOS intended;
it does not silently drop Safari/iOS because hardware is unavailable. Jake must
approve any support limitation. `1.0.0` promotion requires these intended-support
gates, exact-candidate CI, production verification and explicit owner approval.

## Jake's one-to-two-week candidate trial

1. Start from an external backup, verify it in an empty profile, and keep the original.
2. Use real daily planning: opening cash → bill/income plan → actual receipt/payment
   → cash breakdown → external backup. Check unknown/zero and scheduled/actual distinctions.
3. Edit a bill, make partial and connected payments, reconcile a debt statement,
   retry a deliberately failed synthetic save in an isolated profile, and review undo order.
4. Close/reopen offline and background/resume on the intended device. Review any
   explicit update with a dirty synthetic form. Record browser, build and anomalies.
5. Deliberately inspect the next month: recurrence only once, preserved monthly edits,
   skipped items retained, future entries separate, opening cash accepted explicitly.
   Include actual local midnight/month rollover when the trial crosses it.
6. Download and independently restore a final backup. Compare records and totals.
   Log any mismatch with synthetic reproduction; accept the candidate only when
   critical defects and required gates are resolved. Nothing runs autonomously later.


## Executed runtime and visual checks

- Node 24.19.0: npm ci, typecheck, 185 unit/storage tests in 16 files and production
  build passed. Node 22.23.4: typecheck, the same 185 tests and production build passed.
- The local deployment checker passed against the exact production preview HTML,
  JavaScript/CSS, MIME types, security headers and revalidation/immutable cache controls.
- `scripts/capture-v1.mjs` captured 48 screenshots: all six sections, populated and
  empty storage, both themes, at 320×850 and 1920×1080. Desktop and narrow contact
  sheets were opened and inspected. No page errors or document overflow occurred.
  Optional Settings disclosures remain readable in the narrow scrolling workspace.
- Local browser runtime: Chromium 153.0.8010.0 via ACCRYNT_CHROMIUM_PATH, official
  Firefox 157 and WebKit 27.2. The official Chromium download was truncated; the
  separate Chromium executable was used instead. The host's dependency installer
  could not change container groups. WebKit used extracted Ubuntu libraries and a
  local wrapper around the official binary. Firefox content sandbox/host preflight
  scanning were disabled only for these disposable local profiles. Machine-specific
  config is excluded from delivery; CI uses standard Playwright browser installation.
- The focused recovery, strict-CSP and failed-save/draft batch completed 8/9 cases;
  WebKit's native-select CSP violation was the sole failure. Cross-browser
  Chromium-to-Firefox export/restore passed after the launch override was corrected.
  The final complete local suite was interrupted when the execution host was reset
  during the session pause; it is not reported as a completed pass. Exact final
  standard-browser suite counts, CI job conclusions and commit SHA are recorded in
  the PR after remote execution.

A temporary profiling build had also been served while an early baseline browser
run was active, so that mixed-build run is discarded as baseline evidence. Final
benchmarks use isolated builds and the profiler is removed by a normal rebuild.
No successful check is inferred from an interrupted or mixed-build run.
