<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import DemoControls from './components/DemoControls.vue'
import { isDemo, workspaceUrl } from './data/workspace'
import BrandMark from './components/BrandMark.vue'
import { useFinanceStore } from './stores/finance'
import { formatMoney, longMonth } from './domain/finance'

const store = useFinanceStore()
const router = useRouter()
store.start()
const modeLabel = computed(() => store.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')
const monthLabel = computed(() => longMonth(store.month))
const { needRefresh, updateServiceWorker } = useRegisterSW()
const nav = [
  { path: '/', title: 'Overview', icon: '▦' },
  { path: '/plan', title: 'Monthly Plan', icon: '☷' },
  { path: '/ledger', title: 'Ledger', icon: '≡' },
  { path: '/debts', title: 'Debts', icon: '▤' },
  { path: '/reports', title: 'Reports', icon: '▥' },
  { path: '/settings', title: 'Settings', icon: '⚙' }
]
const active = computed(() => nav.find(n => n.path === router.currentRoute.value.path)?.title ?? 'Overview')
const sidebarOpen = ref(false), menuButton = ref<HTMLButtonElement | null>(null)
function skipTo(id: string) {
  if (id === 'main-navigation') sidebarOpen.value = true
  requestAnimationFrame(() => { document.getElementById(id)?.focus() })
}
function escapeMenu(event: KeyboardEvent) {
  if (event.key === 'Escape' && sidebarOpen.value) { sidebarOpen.value = false; menuButton.value?.focus() }
}
watch(() => router.currentRoute.value.fullPath, () => { sidebarOpen.value = false })
let noticeTimer: ReturnType<typeof setTimeout> | undefined
watch(() => store.notice, message => {
  if (noticeTimer) clearTimeout(noticeTimer)
  if (message) noticeTimer = setTimeout(store.clearNotice, 4500)
})
onUnmounted(() => { if (noticeTimer) clearTimeout(noticeTimer) })
</script>
<template>
  <div class="app-root" :data-theme="store.theme" @keydown="escapeMenu">
    <a class="skip-link" :href="`#${router.currentRoute.value.fullPath}`" @click.prevent="skipTo('main-content')">Skip to content</a>
    <a class="skip-link" :href="`#${router.currentRoute.value.fullPath}`" @click.prevent="skipTo('main-navigation')">Skip to navigation</a>
    <div class="application-frame">
      <div class="mobile-bar">
        <BrandMark />
        <button ref="menuButton" class="button" type="button" :aria-expanded="sidebarOpen" aria-controls="main-navigation" @click="sidebarOpen = !sidebarOpen">{{ sidebarOpen ? 'Close' : 'Menu' }}</button>
      </div>
      <div class="workspace">
        <main id="main-content" class="main-content" tabindex="-1">
          <DemoControls v-if="isDemo" />
          <div class="topbar">
            <span class="crumb">ACCRYNT / <strong>{{ active.toUpperCase() }}</strong></span>
            <div class="topbar-actions">
              <a v-if="!isDemo" class="text-link" :href="workspaceUrl(true)">Try demo</a>
              <span class="local-indicator"><span class="dot" /> ON THIS DEVICE</span>
              <span class="top-month mono">{{ monthLabel }}</span>
              <button class="button small" type="button" :aria-label="modeLabel" @click="store.setTheme(store.theme === 'dark' ? 'light' : 'dark')">{{ store.theme === 'dark' ? '☀ Light' : '◐ Dark' }}</button>
            </div>
          </div>
          <div v-if="!store.loaded" class="loading-state" role="status">Opening local workspace…</div>
          <section v-else-if="store.error" class="error-panel" role="alert"><strong>Local storage unavailable</strong><p>{{ store.error }}</p><p>Use a supported browser with IndexedDB enabled. No data has been sent anywhere.</p><button class="button" @click="store.start()">Retry local storage</button></section>
          <template v-else><section v-if="store.operationError" class="error-panel" role="alert"><strong>Action could not complete</strong><p>{{ store.operationError }}</p><button class="button small" @click="store.dismissError()">Dismiss error</button></section><section v-if="store.planIncomplete" class="error-panel" role="alert"><strong>Monthly plan may be incomplete</strong><p>Recurring items for this month have not finished generating. Planned totals and available-after-bills estimates may omit items. Recorded Ledger entries remain live.</p><p v-if="store.recurrenceWarning">{{ store.recurrenceWarning }}</p><button v-if="store.recurrenceWarning" class="button small" @click="store.retryRecurrence()">Retry recurring items</button></section><RouterView /></template>
        </main>
        <aside id="main-navigation" class="right-rail" tabindex="-1" :class="{ open: sidebarOpen }">
          <BrandMark />
          <div class="rail-section-label">Workspace</div>
          <nav aria-label="Primary navigation" class="navigation">
            <RouterLink v-for="(item, i) in nav" :key="item.path" :to="item.path" active-class="selected">
              <span class="nav-glyph" aria-hidden="true">{{ item.icon }}</span><span>{{ item.title }}</span><span class="nav-index mono">{{ String(i + 1).padStart(2, '0') }}</span>
            </RouterLink>
          </nav>
          <div class="rail-spacer" />
          <div class="rail-summary">
            <p v-if="store.planIncomplete" class="error-message">Plan incomplete · retry recurring items</p><div class="rail-heading">{{ monthLabel }} / PLAN</div>
            <div class="rail-metric mono" :class="{ 'rail-negative': store.summary.remainingCents < 0 }">{{ formatMoney(store.summary.remainingCents) }}</div>
            <p>Unallocated after planned outflow. Not a verified bank balance.</p>
            <div class="rail-rule" />
            <div class="rail-row"><span>Planned outflow</span><strong class="mono">{{ formatMoney(store.summary.plannedCents) }}</strong></div>
            <div class="rail-row"><span>Unpaid items</span><strong class="mono">{{ store.summary.unpaidCount }}</strong></div>
          </div>
          <div class="rail-footer"><span class="dot" /> PRIVATE BY DESIGN <span class="mono">v0.6</span></div>
        </aside>
      </div>
    </div>
    <div v-if="store.notice" class="toast" role="status" aria-live="polite">{{ store.notice }}</div>
    <div v-if="needRefresh" class="update-banner" role="status">An offline app update is available. <button class="button primary" @click="updateServiceWorker()">Update and reload</button></div>
  </div>
</template>
