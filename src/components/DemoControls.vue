<script setup lang="ts">
import { errorMessage } from '../domain/errors'
import { ref } from 'vue'
import { currentMonth } from '../domain/models'
import { resetDemo, type DemoScenario } from '../data/demo'
import { workspaceUrl } from '../data/workspace'
import { useFinanceStore } from '../stores/finance'
const store = useFinanceStore(), busy = ref(false), scenario = ref<DemoScenario>('showroom'), error = ref('')
async function reset() {
  if (busy.value || !confirm('Reset synthetic demo records? Your personal workspace is separate and will not be changed.')) return
  busy.value = true; error.value = ''
  try { await resetDemo(scenario.value); store.month = scenario.value === 'february' ? `${currentMonth().slice(0,4)}-02` : currentMonth(); store.notify('Demo reset. Synthetic records restored.'); }
  catch (reason) { error.value = errorMessage(reason, 'Unable to reset demo.') }
  finally { busy.value = false }
}
</script>
<template>
  <section class="demo-banner" aria-label="Demo workspace">
    <div class="demo-description"><strong>DEMO · SYNTHETIC DATA</strong><span>Edits stay in this demo on your device.</span></div>
    <div class="demo-actions"><label>Scenario<select v-model="scenario" :disabled="busy"><option value="showroom">Showroom</option><option value="cash-shortfall">Negative cash</option><option value="near-payoff">Near payoff</option><option value="february">February dates</option></select></label>
    <button class="button small" :disabled="busy" @click="reset">Reset demo</button>
    <a class="text-link" :href="workspaceUrl(false)">Return to my workspace</a></div>
    <p v-if="error" role="alert" class="error-message">{{ error }}</p>
  </section>
</template>
