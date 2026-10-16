<script setup lang="ts">
import { computed } from 'vue'
import { accruedEstimate } from '../domain/debt'
import { formatMoney } from '../domain/finance'
import { localDate, type Debt } from '../domain/models'
const props = defineProps<{ debt:Debt; today?:string }>()
const estimate = computed(() => {
  try { return accruedEstimate(props.debt, props.today ?? localDate()) } catch { return null }
})
</script>
<template>
  <section class="accrual-estimate" aria-label="Date-aware debt estimate">
    <dl class="debt-facts"><div><dt>Saved balance as of</dt><dd>{{ debt.balanceAsOf || 'Date unknown' }}</dd></div><div><dt>Accrual model</dt><dd>{{ debt.interestMethod === 'monthly' ? 'Nominal monthly · completed periods' : debt.interestMethod === 'daily-365' ? 'Simple daily · 365' : 'Simple daily · 360' }}</dd></div><div><dt>Estimated unposted interest</dt><dd>{{ estimate===null ? '—' : formatMoney(estimate.interestCents) }}</dd></div><div><dt>Estimated present balance</dt><dd>{{ estimate===null ? '—' : formatMoney(estimate.estimatedBalanceCents) }}</dd></div></dl>
    <p class="form-hint">{{ estimate ? `Through ${today ?? localDate()} · ${estimate.days} elapsed days. Simple planning estimate; saved balance unchanged.` : 'Add a balance reference date and rate to calculate a dated estimate.' }} No grace periods, fees, compounding or lender-specific daily balances are assumed.</p>
  </section>
</template>
