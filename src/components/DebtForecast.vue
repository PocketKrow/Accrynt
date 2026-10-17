<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { compareExtraPayment, payoffLabel, projectDebt, type DebtCalculationInput } from '../domain/debt'
import { formatMoney, parseMoney } from '../domain/finance'

const props = defineProps<{ debt: DebtCalculationInput; compact?: boolean }>()
const expanded = ref(false), page = ref(0)
const extra = ref('25.00')
const comparison = computed(() => {
  const cents = parseMoney(extra.value)
  if (cents === null) return null
  try { return compareExtraPayment(props.debt, cents) } catch { return null }
})
const projection = computed(() => projectDebt(props.debt, expanded.value))
const rows = computed(() => projection.value.schedule.slice(page.value * 12, (page.value + 1) * 12))
const pageCount = computed(() => Math.ceil(projection.value.schedule.length / 12))
watch(() => [props.debt.balanceCents, props.debt.aprMilliPercent, props.debt.minimumCents, props.debt.monthlyPaymentCents], () => { page.value = 0 })
const amount = (value: number | null) => value === null ? '—' : formatMoney(value)
</script>
<template>
  <section class="debt-forecast" aria-label="Repayment estimate">
    <span class="eyebrow">{{ compact ? 'LIVE ESTIMATE' : 'REPAYMENT ESTIMATE' }}</span>
    <dl class="forecast-stats">
      <div><dt>First month interest</dt><dd class="mono">{{ amount(projection.monthlyInterestCents) }}</dd></div>
      <div v-if="compact"><dt>First month principal</dt><dd class="mono">{{ amount(projection.firstPrincipalCents) }}</dd></div>
      <div class="forecast-payoff"><dt>Estimated payoff</dt><dd>{{ payoffLabel(projection) }}</dd></div>
    </dl>
    <p v-if="projection.status === 'missing-rate'" class="form-hint">Enter a rate to calculate interest. Enter 0 for an interest-free debt.</p>
    <p v-if="projection.status === 'not-reducing'" class="small-text negative-text" role="status">The payment must exceed {{ amount(projection.monthlyInterestCents) }} in monthly interest to reduce this balance.</p>
    <p v-if="projection.status === 'no-payment'" class="form-hint">Interest is estimated, but a payment is needed to calculate payoff.</p>
    <p v-if="debt.balanceCents > 0 && projection.plannedPaymentCents < debt.minimumCents" class="small-text negative-text">Your planned payment is below the saved minimum of {{ formatMoney(debt.minimumCents) }}.</p>
    <p v-if="compact" class="form-hint">Assumes the same payment every month, annual rate ÷ 12, and no new charges or fees.</p>
    <details v-else @toggle="expanded = ($event.target as HTMLDetailsElement).open">
      <summary>Calculation details &amp; schedule</summary>
      <div class="forecast-details">
        <dl class="debt-facts">
          <div><dt>First month principal</dt><dd class="mono">{{ amount(projection.firstPrincipalCents) }}</dd></div>
          <div><dt>First payment (capped at amount owed)</dt><dd class="mono">{{ amount(projection.firstPaymentCents) }}</dd></div>
          <div><dt>Balance after first payment</dt><dd class="mono">{{ amount(projection.nextBalanceCents) }}</dd></div>
          <div><dt>Future interest through payoff</dt><dd class="mono">{{ amount(projection.totalInterestCents) }}</dd></div>
          <div><dt>Total future payments</dt><dd class="mono">{{ amount(projection.totalPaidCents) }}</dd></div>
          <div><dt>Final payment</dt><dd class="mono">{{ amount(projection.finalPaymentCents) }}</dd></div>
        </dl>
        <p class="form-hint">Estimate: annual rate ÷ 12, interest rounded to the nearest cent before each monthly payment, a fixed rate and payment, and no new charges or fees. Card issuers and lenders may use daily interest or other billing rules. No payment date is assumed.</p>
        <p v-if="projection.status === 'beyond-horizon'" class="form-hint">This payment would not pay off the debt within the 1,200-month calculation limit. Lifetime totals are unavailable.</p>
        <template v-if="projection.schedule.length">
          <div class="table-scroll forecast-table"><table class="data-table">
            <caption class="small-text">Estimated monthly schedule · {{ page * 12 + 1 }}–{{ Math.min((page + 1) * 12, projection.schedule.length) }} of {{ projection.schedule.length }}{{ projection.status === 'beyond-horizon' ? ' projected months' : ' payments' }}</caption>
            <thead><tr><th scope="col">Month</th><th scope="col">Payment</th><th scope="col">Interest</th><th scope="col">Principal</th><th scope="col">Balance</th></tr></thead>
            <tbody><tr v-for="row in rows" :key="row.month"><th scope="row">{{ row.month }}</th><td>{{ formatMoney(row.paymentCents) }}</td><td>{{ formatMoney(row.interestCents) }}</td><td>{{ formatMoney(row.principalCents) }}</td><td>{{ formatMoney(row.closingCents) }}</td></tr></tbody>
          </table></div>
          <div v-if="pageCount > 1" class="forecast-pagination"><button class="button" :disabled="page === 0" @click="page--">Previous 12</button><span class="small-text">Page {{ page + 1 }} of {{ pageCount }}</span><button class="button" :disabled="page === pageCount - 1" @click="page++">Next 12</button></div>
        </template>
      </div>
    </details>
    <details v-if="!compact" class="extra-payment-details">
      <summary>Compare an extra payment</summary>
      <div class="recurring-content">
        <label class="comparison-label">Extra monthly payment (USD)<input v-model="extra" inputmode="decimal" /></label>
        <div class="comparison-presets"><button v-for="value in [25, 50, 100]" :key="value" class="button small" @click="extra = value.toFixed(2)">+{{ formatMoney(value * 100) }}</button></div>
        <template v-if="comparison">
          <dl class="debt-facts"><div><dt>New monthly payment</dt><dd class="mono">{{ formatMoney(comparison.paymentCents) }}</dd></div><div><dt>Estimated payoff</dt><dd>{{ payoffLabel(comparison.improved) }}</dd></div><template v-if="comparison.monthsSaved !== null"><div><dt>Time saved</dt><dd>{{ comparison.monthsSaved }} months</dd></div><div><dt>Interest saved</dt><dd class="mono good-text">{{ formatMoney(comparison.interestSavedCents!) }}</dd></div></template></dl>
          <p v-if="comparison.improved.status === 'payoff' && comparison.monthsSaved === null" class="form-hint">This payment reaches payoff; the saved plan has no comparable payoff estimate.</p>
        </template>
        <p v-else class="form-hint">Enter a valid extra amount within the supported payment limit.</p>
        <p class="form-hint">Uses the same monthly assumptions as the repayment estimate. Compare here, then edit your debt’s planned payment to save a change.</p>
      </div>
    </details>
  </section>
</template>
