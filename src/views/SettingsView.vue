<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import { useFinanceStore } from '../stores/finance'
import { exportBackup, restoreBackup, validateBackup, downloadFile } from '../data/backup'
import { loadOctoberExample } from '../data/example'
import type { Backup } from '../domain/models'
import { clearWorkspace } from '../data/database'
const store = useFinanceStore()
const busy = ref(false)
const error = ref('')
const persisted = ref<boolean | null>(null)
const requestingPersistence = ref(false)
const storageEstimate = ref('Not checked')
const selectedFile = ref<File | null>(null)
const backupInput = ref<HTMLInputElement | null>(null)
const readyBackup = ref<Backup | null>(null)
const importError = ref('')
let selectionVersion = 0
const rowCounts = computed(() => ({
  months: store.months.length,
  obligations: store.obligations.length,
  transactions: store.transactions.length,
  debts: store.debts.length
}))
function handleError(e: unknown) { error.value = e instanceof Error ? e.message : 'An unexpected storage error occurred.' }
async function exportData() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    const backup = await exportBackup()
    downloadFile(`Accrynt-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2))
    store.notify('Portable JSON backup prepared. Keep another copy outside this browser.')
  } catch (e) { handleError(e) } finally { busy.value = false }
}
async function chooseBackup(event: Event) {
  const version = ++selectionVersion
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
  readyBackup.value = null
  importError.value = ''
  const file = selectedFile.value
  if (!file) return
  if (file.size > 15_000_000) { importError.value = 'Backup exceeds the 15 MB import limit.'; return }
  try {
    const content: unknown = JSON.parse(await file.text())
    if (version !== selectionVersion) return
    readyBackup.value = validateBackup(content)
  } catch (e) { if (version !== selectionVersion) return; importError.value = e instanceof Error ? e.message : 'The selected file is not a valid Accrynt backup.' }
}
async function restore() {
  if (busy.value || !readyBackup.value) return
  const counts = `${readyBackup.value.months.length} months, ${readyBackup.value.obligations.length} obligations, ${readyBackup.value.transactions.length} transactions, and ${readyBackup.value.debts.length} debts`
  if (!confirm(`Replace ALL local Accrynt data with this backup (${counts})? This overwrites existing records. Export your current data first.`)) return
  busy.value = true; error.value = ''
  try {
    await restoreBackup(readyBackup.value)
    readyBackup.value = null; selectedFile.value = null
    if (backupInput.value) backupInput.value.value = ''
    store.notify('Backup restored. All tables replaced atomically.')
  } catch (e) { handleError(e) } finally { busy.value = false }
}
async function storageInfo() {
  error.value = ''
  try {
    if (!navigator.storage?.estimate) { storageEstimate.value = 'Storage estimate unavailable in this browser.'; return }
    const estimate = await navigator.storage.estimate()
    const usage = estimate.usage ?? 0, quota = estimate.quota ?? 0
    storageEstimate.value = `${(usage / 1024 / 1024).toFixed(1)} MB used of approximately ${(quota / 1024 / 1024).toFixed(0)} MB available for this origin (includes other site storage).`
    persisted.value = navigator.storage.persisted ? await navigator.storage.persisted() : null
  } catch (e) { handleError(e) }
}
async function requestPersistence() {
  if (requestingPersistence.value) return
  error.value = ''
  if (!navigator.storage?.persist) { error.value = 'Persistent storage requests are not supported by this browser.'; return }
  requestingPersistence.value = true
  try {
    persisted.value = await navigator.storage.persist()
    store.notify(persisted.value ? 'The browser granted persistent storage.' : 'The browser did not grant persistent storage. Back up your data regularly.')
  } catch (e) { handleError(e) } finally { requestingPersistence.value = false }
}
async function loadSample() {
  if (busy.value) return
  if (!confirm('Load the October example from the approved design concept? The example is only allowed in an empty database.')) return
  busy.value = true; error.value = ''
  try { await loadOctoberExample(store.month); store.notify('October example loaded. No transactions or debt balances were invented.') }
  catch (e) { handleError(e) } finally { busy.value = false }
}
async function clearAll() {
  if (busy.value) return
  if (!confirm('Delete ALL Accrynt records stored in this browser? Export a backup first. This cannot be undone.')) return
  if (prompt('Type DELETE to permanently clear this local database:') !== 'DELETE') return
  busy.value = true; error.value = ''
  try {
    await clearWorkspace()
    store.notify('All local financial records cleared.')
  } catch (e) { handleError(e) } finally { busy.value = false }
}
</script>
<template>
  <PageHeader label="06 / PREFERENCES" title="Settings" subtitle="Your data stays in this browser profile until you export it or move it yourself." />
  <div class="settings-grid">
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">APPEARANCE</span><h2>Interface</h2></div></div>
      <div class="setting-row"><div><strong>Color theme</strong><p>Carbon × Glacier, with an off-gray light mode and graphite dark mode.</p></div><select :value="store.theme" aria-label="Theme" @change="store.setTheme(($event.target as HTMLSelectElement).value as 'light' | 'dark')"><option value="light">Light</option><option value="dark">Dark</option></select></div>
      <div class="setting-row"><div><strong>Storage engine</strong><p>IndexedDB via Dexie. No account, server, banking connection, or cloud sync.</p></div><span class="status-pill">LOCAL</span></div>
    </section>
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">YOUR RECORDS</span><h2>Backup & restore</h2></div></div>
      <p class="body-copy">Export a versioned portable JSON archive. Save it somewhere outside this browser. Restore replaces all records only after validation and explicit confirmation.</p>
      <div class="data-counts"><span>{{ rowCounts.months }} months</span><span>{{ rowCounts.obligations }} obligations</span><span>{{ rowCounts.transactions }} transactions</span><span>{{ rowCounts.debts }} debts</span></div>
      <button class="button primary" :disabled="busy" @click="exportData">Download JSON backup</button>
      <hr class="section-divider"/>
      <label class="file-label">Select an Accrynt backup file<input ref="backupInput" type="file" :disabled="busy" accept="application/json,.json" @change="chooseBackup" /></label>
      <p v-if="readyBackup" class="success-message">Validated backup: {{ readyBackup.months.length }} month(s), {{ readyBackup.obligations.length }} obligation(s), {{ readyBackup.transactions.length }} transaction(s), {{ readyBackup.debts.length }} debt(s).</p>
      <p v-if="importError" class="error-message" role="alert">{{ importError }}</p>
      <button v-if="readyBackup" class="button danger-button" :disabled="busy" @click="restore">Replace local records with backup</button>
    </section>
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">BROWSER STORAGE</span><h2>Data location</h2></div></div>
      <p class="body-copy">Records are stored in your browser's IndexedDB database <code>accrynt-local-v1</code>, tied to this website's origin and browser profile. Clearing site data or changing devices will not preserve them automatically.</p>
      <div class="setting-row"><div><strong>Storage estimate</strong><p>{{ storageEstimate }}</p></div><button class="button small" @click="storageInfo">Check</button></div>
      <div class="setting-row"><div><strong>Persistent storage</strong><p>{{ requestingPersistence ? 'Waiting for your browser’s permission decision' : persisted === true ? 'Granted' : persisted === false ? 'Not granted' : 'Not checked' }}. A request may be declined by the browser.</p></div><button class="button small" :disabled="requestingPersistence" @click="requestPersistence">{{ requestingPersistence ? 'Waiting…' : 'Request' }}</button></div>
    </section>
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">WORKSPACE TOOLS</span><h2>Local controls</h2></div></div>
      <p class="body-copy">Start with the approved October design data if you want a populated sandbox. It can only be added to an entirely empty workspace and never loads automatically.</p>
      <button v-if="!store.hasAnyData" class="button" :disabled="busy" @click="loadSample">Load optional October example</button>
      <p v-else class="muted small-text">Example import is disabled because this workspace already has data.</p>
      <hr class="section-divider"/>
      <p class="body-copy">Permanent deletion affects only the current browser's Accrynt database; existing downloaded backups are unaffected.</p>
      <button class="button danger-button" :disabled="busy || !store.hasAnyData" @click="clearAll">Delete all local records</button>
    </section>
  </div>
  <p v-if="error" class="error-message" role="alert">{{ error }}</p>
</template>
