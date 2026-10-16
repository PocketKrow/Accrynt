# Debt interest calculations · v0.3

## Calculation contract

Forecasts use the saved current balance, annual rate in basis points, and a fixed monthly payment. A blank planned payment uses the saved minimum; an explicit zero is preserved. A missing rate produces unknown interest, not zero interest. A zero balance is already paid off regardless of rate.

Interest cents are `round_half_up(balanceCents × annualRateBasisPoints / 120000)`. The multiplication and rounding use BigInt; stored amounts and outputs remain integer cents. Monthly interest is added before the payment, the payment is capped at the amount owed, and the remaining balance becomes the next month's opening balance. There is no floating-point dollar arithmetic in the projection.

The first month's interest, principal reduction, payment, and closing balance are available immediately. Successful projections report payment count, future interest, total future payments, and the final partial payment. Payments at or below rounded monthly interest do not reduce the balance; a zero payment has a separate state. Projections stop after 1,200 monthly payments and do not report incomplete lifetime totals as payoff totals.

No date, new spending, fees, rate change, or recalculated lender minimum is assumed. No forecast writes to the database, Ledger, or Monthly Plan. Saved balances stay statement-based.

## Independent reference fixtures

Calculated separately with Python Decimal and monthly ROUND_HALF_UP, then asserted as fixed expectations in Vitest:

| Opening balance | Annual rate | Monthly payment | Payments | Future interest | Total paid | Final payment |
| --- | --- | --- | --- | --- | --- | --- |
| $1,000.00 | 12% | $100.00 | 11 | $58.98 | $1,058.98 | $58.98 |
| $1,000.00 | 24% | $50.00 | 26 | $289.88 | $1,289.88 | $39.88 |
| $1,500.00 | 17% | $45.00 | 46 | $544.44 | $2,044.44 | $19.44 |

Additional cases cover 0%, missing rate, zero payment, interest-only and insufficient payments, one-cent balances, maximum supported values, exact half-cent rounding, payment capping, schedule conservation, and the 100-year horizon.

## Compatibility

- Dexie version 1 remains declared; version 2 adds `monthlyPaymentCents: null` to existing debt rows in place. The database name and table indexes are unchanged.
- A dedicated upgrade test creates an actual old Dexie database and verifies all four tables, linked records, balances, rates, and timestamps after upgrade and reopen.
- Portable v2 backups retain saved payment plans; strict v1 backups migrate to null payment plans. Duplicate IDs, missing references, invalid payments, and unsupported versions are rejected before writes. Atomic-restore rollback tests remain in the suite.
- Public-release consideration: v2 exports require the updated app; older releases cannot restore them. No downgrade writer is included.

## Verification

Environment: Node 24.19.0, npm 11.9.0, Chromium 153.0.8010.0, isolated browser profiles with synthetic data only.

- `npm run typecheck`: passed.
- `npm test`: 70 tests passed across finance, debt calculations, and storage.
- `npm run build`: passed, including service-worker generation.
- Chromium browser tests cover live previews, edits, reload persistence, v2 backup restore, strict v1 restore, distinct unknown/0%/zero-payment/nonreducing states, schedule pagination, and 320px light/dark layouts. A real browser v1 IndexedDB upgrade test checks linked history in all four tables.
- Existing browser regressions cover offline reloads, storage retry/permissions, theme persistence, cross-tab stale edits, backup safety, monthly planning, and transaction links.
- Visual review: populated desktop light/dark debt cards, expanded schedule, 320px dark debt view, and mobile debt editor. The table scrolls within its panel; the page and editor do not overflow horizontally. Desktop keeps the full viewport and right rail.
- GitHub Actions runs the same unit checks and browser suite on Chromium and Firefox. Its result is reported on the feature pull request.

## Sources and limits

The monthly model is an explicit planning assumption. It does not claim to reproduce a lender statement. CFPB explains that credit-card issuers may use a daily periodic rate and divide APR by 360 or 365, and that contracts may use daily-balance and compounding rules:

- [CFPB: daily periodic rates](https://www.consumerfinance.gov/ask-cfpb/what-is-a-daily-periodic-rate-on-a-credit-card-en-46/)
- [CFPB: credit-card contract definitions](https://www.consumerfinance.gov/data-research/credit-card-data/know-you-owe-credit-cards/credit-card-contract-definitions/)
- [CFPB: loan interest rate versus APR](https://www.consumerfinance.gov/ask-cfpb/what-is-the-difference-between-a-loan-interest-rate-and-the-apr-en-733/)
- [CFPB: simple versus precomputed auto-loan interest](https://www.consumerfinance.gov/ask-cfpb/whats-the-difference-between-a-simple-interest-rate-and-precomputed-interest-on-an-auto-loan-en-841/)
- [Dexie: version upgrade transactions](https://dexie.org/docs/Version/Version.upgrade())

Daily accrual, promotional balances, fee allocation, statement-cycle reconciliation, variable minimums, and automatic balance posting remain outside this feature. It does not add a backend or bank connection.
