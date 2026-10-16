# Connected finance workflow · v0.4

## Scope

This release connects confirmed payments, monthly commitments, cashflow, and recurring plans while preserving the local-first Vue/Dexie stack, six views, Carbon × Glacier themes, full viewport, and right desktop rail.

Implemented features:

1. Record a payment once from Debts, Monthly Plan, or Overview; review the interest/principal split before confirmation.
2. See recorded available money and money remaining after outstanding commitments, using a user-entered monthly opening balance.
3. Generate monthly recurring bills and expected income once per eligible visited month, with individual-month edits and skip behavior.
4. Compare extra monthly payments with payoff and interest savings.
5. Keep detailed schedules, budget allocation, recurring settings, and receipt splits behind expandable sections.

## Confirmed payment contract

A payment has one stable request UUID per open form. Recording the same request again returns the same saved entry; reusing the ID for different contents is rejected. The repository checks the reviewed debt and obligation timestamps inside the write transaction. Another tab's payment invalidates a stale form.

For debt payments, `principal = payment − confirmed interest`, and `new balance = saved balance − principal`. Amounts are integer cents, positive, within supported bounds, and cannot produce negative principal or balance. The interest field can start with a monthly estimate, but is editable. The UI explicitly asks users to check their statement and enter 0 if the balance already includes the interest being paid. No charges or unpaid interest are automatically accrued.

The Ledger entry, saved debt principal, and obligation timestamp commit atomically. Bill status is derived from total linked expense/debt-payment amounts plus any manual paid confirmation: unpaid, partially paid, or paid. Outflow is counted once, and only the remaining planned amount is reserved in cashflow. Cross-month links reduce the target bill's remainder while cash movement belongs to the transaction date's month.

Connected entries retain an immutable receipt, including recorded timestamp, debt name, split, and opening/closing debt balances. Generic edit/delete cannot bypass principal effects. Undo removes the entry and restores principal if the debt exists, only when the saved balance matches its closing receipt and no newer payment on that debt remains. Undo newer payments first. A statement adjustment requires reconciliation. Deleted debts retain receipt history; undo then removes only the Ledger entry. Deleting a bill unlinks its transactions without changing receipt order.

## Available-money contract

- Expected income = additional monthly expected income + non-skipped recurring income snapshots.
- Tracked available = monthly opening cash + recorded monthly income − recorded monthly outflow, including only transactions dated through today.
- After outstanding bills = tracked available − unpaid remainders of this month's bills.
- Missing opening cash means unknown. Zero and negative opening balances are valid. Opening cash is not copied automatically into another month.
- Future-dated generic Ledger entries remain visible in recorded monthly reports but do not affect available money before their date. Confirmed payment actions reject future dates.
- A manual paid checkbox does not create money movement. Its effect on reservations and the need to record missing outflow are explained beside the totals.
- Saving expected income preserves opening cash and vice versa. A minute-based local date refresh handles an app left open across midnight; timers are disposed with the store.

These totals reflect entered records and do not claim bank verification or structured account reconciliation.

## Recurrence contract

Rules are monthly, with an amount, kind, optional day, category/debt link, start month, optional end month, and enabled state. A deterministic `rule UUID:month` occurrence key prevents repeated generation across callers/tabs. Generation is one IndexedDB transaction and never inserts actual income or payment transactions.

Existing monthly entries are snapshots. Rule changes and pauses affect months not generated yet. Bill edits affect only the selected bill. Deleting a generated bill leaves a skipped occurrence, so reloads cannot resurrect it. A month's expected income can be edited, skipped, and restored independently. Due days beyond the month length use its final day, including leap/century years.

Existing bills use **Repeat monthly**, which adopts the current entry, preserving its ID, amount, status, and payment history. Adding a new rule with a same-name bill already in the start month is rejected with a pointer to this action. Copying the previous month copies only additional expected income and non-recurring bills alongside already generated entries, without duplicate recurrence or copied opening cash.

## Recovery and migration

The database name remains `accrynt-local-v1`. Dexie versions 1 and 2 remain declared. Version 3 adds null opening balances, null receipts on old transactions, and two new tables: recurring rules and recurring occurrences. Existing debt balances, rates, saved payment plans, IDs, links, and timestamps survive upgrade.

Portable exports use schema 3 and include all six tables. Strict v1/v2 archives migrate with neutral defaults. Restore validates IDs, references, receipt arithmetic, rule/occurrence kinds, deterministic keys, skip state, and month links before atomic replacement. Receipt references to deleted historical debts are intentionally retained; active bill/rule links must resolve. Old releases cannot read v3 exports.

## Verification

Local environment: Node 24.19.0, npm 11.9.0, Chromium 153.0.8010.0. All browser fixtures are synthetic and profiles are disposable.

- `npm run typecheck`: passed. `npm run build`: passed, including service-worker generation.
- `npm test`: all 91 tests passed. Local Chromium: all 18 browser tests passed.
- Unit/storage suite: payment idempotency, partial/full payments, ordered undo, changed-balance protection, stale/mismatched/future/overpaid input rejection, failed-write rollback, deletion/history safety, recurrence deduplication, monthly edits/skips, existing-bill adoption, previous-month copy, live-store generation, cashflow arithmetic, leap-year due dates, extra-payment comparisons, strict v1/v2 imports, v1/v2 IndexedDB upgrades, and six-table restore rollback.
- Chromium workflows: opening cash and income receipt → partial payment → full payment → undo → backup/reload; recurring generation/edit/pause/skip/restore and full backup replacement; existing-bill adoption; extra-payment comparisons; 320px forms and both themes; two-tab stale payment protection.
- Existing regressions retained for offline reloads, theme/storage controls, invalid backups, ledger links, calendar boundaries, native dialogs, cross-tab deletion, and storage retry.
- Visual inspection with populated synthetic data: Overview light/dark at 1440px, Overview at 320px, Monthly Plan with recurring settings expanded, debt comparison, and mobile payment review. The page uses the full viewport; narrow tables scroll inside their panels and native dialogs scroll vertically.
- GitHub Actions runs the full unit suite and all browser cases on Chromium and Firefox. The feature PR records the actual run result.

The monthly interest assumptions and primary-source references remain documented in [QA-debt-interest.md](QA-debt-interest.md). This release adds no backend, banking connection, background payment automation, daily accrual, or promotional-rate model.
