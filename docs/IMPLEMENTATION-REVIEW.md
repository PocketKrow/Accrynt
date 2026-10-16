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
| Full viewport density | All three; shell already full-width | Workbench phase; no shell cap or brand rewrite | responsive browser matrix |
| Exact 6.125%, dated estimates, adjustments | Gemini precision finding; Claude/Grok accounting proposals | Debt phase with ADR and real versioned migration; no parser-only rounding | migration/golden/event tests |

## Foundation storage contract

No Dexie/portable schema bump. Historical versions 1–3 unchanged. `accrynt-local-v1` remains normal storage. Query `?demo=1` selects `accrynt-demo-v1` once, before the singleton is constructed; switching performs full navigation. Normal mode never auto-seeds. Demo seeding and reset use all-table write transactions; concurrent entry seeds once. Demo theme preference has its own key. Demo exports have a `DEMO-SYNTHETIC` filename. Legacy consumers can still import portable v3 without extra schema keys.

Actual totals and obligation statuses use ledger entries dated through today. Future linked outflow is scheduled coverage; it continues to reserve money until dated. Partial actual payments remain Partial even when more is scheduled. Manual paid confirmation stays independent and does not synthesize outflow. Cross-month actual payment links settle their obligation only when the payment date is reached.

Demo fixture has six synthetic months, six debts, recurring expected income, recorded income, partial/overdue/scheduled/manual payments, a skipped occurrence, and a reversible split receipt. Foundation uses 6.12% for the installment sample because v3 cannot store 6.125% exactly; the precise migration must update the fixture. No automatic interest posting. Scenarios reset the sandbox after explicit confirmation; missing and zero APR are present in every scenario.
