<script setup lang="ts">
import { computed } from 'vue'
import { accruedEstimate } from '../domain/debt'
import { formatMoney } from '../domain/finance'
import { localDate, type Debt } from '../domain/models'
const props = defineProps<{ debt:Debt; today?:string }>()
const methodLabel = computed(() => props.debt.interestMethod === 'monthly' ? 'Nominal monthly · completed periods' : props.debt.interestMethod === 'daily-365' ? 'Simple daily · 365' : 'Simple daily · 360')
const estimate = computed(() => {
  try { return accruedEstimate(props.debt, props.today ?? localDate()) } catch { return null }
})
</script>
<template>
  <section class="accrual-estimate" aria-label="Date-aware debt estimate">
    <p class="debt-assumptions">Saved as of {{ debt.balanceAsOf || 'date unknown' }}<br/>{{ methodLabel }}</p>
    <details>
      <summary>Estimated present balance <strong class="mono">{{ estimate === null ? 'Unknown' : formatMoney(estimate.estimatedBalanceCents) }}</strong></summary>
      <dl class="debt-facts"><div><dt>Estimated unposted interest</dt><dd class="mono">{{ estimate === null ? '—' : formatMoney(estimate.interestCents) }}</dd></div><div><dt>Estimate through</dt><dd>{{ today ?? localDate() }}</dd></div></dl>
      <p class="form-hint">{{ estimate ? `${estimate.days} elapsed days. Simple planning estimate; saved balance unchanged.` : 'Add a balance reference date and annual rate to calculate a dated estimate.' }}</p>
    </details>
  </section>
</template>
