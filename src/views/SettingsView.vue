<script setup lang="ts">
import { liveQuery } from 'dexie'
import { backupFreshness, needsBackupReminder, type BackupHealth } from '../data/backup-health'
import { errorMessage } from '../domain/errors'
import { computed, ref, shallowRef, onMounted, onUnmounted } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import { useFinanceStore } from '../stores/finance'
import { initiatePortableDownload, snoozeBackupReminder, restoreBackup, readBackupFile, BACKUP_MAX_BYTES, BACKUP_REVIEW_BYTES, backupSizeMessage, downloadFile, recoverySnapshot } from '../data/backup'
import { loadOctoberExample } from '../data/example'
import type { Backup } from '../domain/models'
import { isDemo, databaseName, workspaceUrl } from '../data/workspace'
import { clearWorkspace, readTrackedWorkspace } from '../data/database'
const store = useFinanceStore()
const backupHealth = shallowRef<BackupHealth>()
let healthSubscription: { unsubscribe(): void } | undefined
const reminderTime = ref(Date.now())
let reminderClock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  healthSubscription = liveQuery(readTrackedWorkspace).subscribe({ next: snapshot => { backupHealth.value = snapshot.health }, error: () => { backupHealth.value = undefined } })
  reminderClock = setInterval(() => { reminderTime.value = Date.now() }, 60_000)
})
onUnmounted(() => { clearInterval(reminderClock); healthSubscription?.unsubscribe() })
const backupState = computed(() => backupFreshness(backupHealth.value))
const reminder = computed(() => needsBackupReminder(backupHealth.value, store.hasAnyData, reminderTime.value))
async function snooze() { try { await snoozeBackupReminder() } catch (e) { handleError(e) } }
const busy = ref(false)
const error = ref('')
const persisted = ref<boolean | null>(null)
const requestingPersistence = ref(false)
const storageEstimate = ref('Not checked')
const selectedFile = ref<File | null>(null)
const backupInput = ref<HTMLInputElement | null>(null)
const readyBackup = ref<Backup | null>(null)
const restoreAgeWarning = computed(() => {
  if (!readyBackup.value) return ''
  const newest = [...store.months, ...store.obligations, ...store.transactions, ...store.debts, ...store.recurringRules, ...store.recurringOccurrences].map(r => r.updatedAt).concat(store.balanceEvents.flatMap(e => [e.recordedAt, e.reversedAt ?? e.recordedAt])).sort().at(-1)
  return newest && newest > readyBackup.value.exportedAt ? 'This backup was exported before your newest local changes. Restoring will replace those newer records.' : ''
})
const provenanceWarning = computed(() => readyBackup.value && readyBackup.value.workspace !== (isDemo ? 'demo-synthetic' : 'personal')
  ? `Cross-workspace restore: ${readyBackup.value.workspace === 'demo-synthetic' ? 'synthetic demo data' : 'personal records'} will replace this ${isDemo ? 'demo' : 'personal'} workspace.` : '')
async function safetySnapshot(action: string) {
  const snapshot = await recoverySnapshot()
  if (snapshot.raw && !confirm('Current records fail backup validation. An UNVALIDATED raw recovery download will be initiated for manual repair; it cannot be restored directly. Continue with the confirmed replacement/deletion?')) return false
  downloadFile(`Accrynt-${snapshot.raw ? 'RAW-RECOVERY' : 'before'}-${action}-${Date.now()}.json`, JSON.stringify(snapshot.data, null, 2))
  return true
}
async function exportRecovery() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    const snapshot = await recoverySnapshot()
    downloadFile(`Accrynt-${snapshot.raw ? 'RAW-RECOVERY' : 'recovery'}-${Date.now()}.json`, JSON.stringify(snapshot.data, null, 2))
    store.notify(snapshot.raw ? 'Raw recovery download initiated. Unvalidated data requires manual repair before restore.' : 'Validated recovery backup download initiated.')
  } catch (e) { handleError(e) } finally { busy.value = false }
}
const importError = ref('')
let selectionVersion = 0
const rowCounts = computed(() => ({
  months: store.months.length,
  obligations: store.obligations.length,
  transactions: store.transactions.length,
  debts: store.debts.length, recurringRules: store.recurringRules.length, recurringOccurrences: store.recurringOccurrences.length
}))
function handleError(e: unknown) { error.value = errorMessage(e, 'An unexpected storage error occurred.') }
async function exportData() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    await initiatePortableDownload(`Accrynt-backup-${new Date().toISOString().slice(0, 10)}.json`)
    store.notify('Backup download initiated. Keep a copy outside this browser.')
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
  if (file.size > BACKUP_MAX_BYTES) { importError.value = backupSizeMessage; return }
  if (file.size > BACKUP_REVIEW_BYTES && !confirm('This is a large backup (over 15 MB). Validation may take time and additional browser memory. The supported limit is 64 MB. Validate this file? No records will change until you confirm replacement.')) return
  try {
    const data = await readBackupFile(file)
    if (version !== selectionVersion) return
    readyBackup.value = data
  } catch (e) { if (version !== selectionVersion) return; importError.value = errorMessage(e, 'The selected file is not a valid Accrynt backup.') }
}
async function restore() {
  if (busy.value || !readyBackup.value) return
  const counts = `${readyBackup.value.months.length} months, ${readyBackup.value.obligations.length} obligations, ${readyBackup.value.transactions.length} transactions, ${readyBackup.value.debts.length} debts, ${readyBackup.value.recurringRules.length} recurring rules, and ${readyBackup.value.recurringOccurrences.length} recurring entries`
  if (!confirm(`Replace ALL local Accrynt data with this backup (${counts})? This overwrites existing records. Export your current data first.`)) return
  busy.value = true; error.value = ''
  try {
    if (!await safetySnapshot('restore')) return
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
  if (!confirm('Load fictional example bills into the selected month? The example is only allowed in an empty database.')) return
  busy.value = true; error.value = ''
  try { await loadOctoberExample(store.month); store.notify('Fictional example bills loaded in the selected month.') }
  catch (e) { handleError(e) } finally { busy.value = false }
}
async function clearAll() {
  if (busy.value) return
  if (!confirm('Delete ALL Accrynt records stored in this browser? Export a backup first. This cannot be undone.')) return
  if (prompt('Type DELETE to permanently clear this local database:') !== 'DELETE') return
  busy.value = true; error.value = ''
  try {
    if (!await safetySnapshot('clear')) return
    await clearWorkspace()
    store.notify('All local financial records cleared.')
  } catch (e) { handleError(e) } finally { busy.value = false }
}
</script>
<template>
  <PageHeader label="06 / PREFERENCES" title="Settings" subtitle="Your data stays in this browser profile until you export it or move it yourself." />
  <div class="settings-grid">
    <div class="settings-column">
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">APPEARANCE</span><h2>Interface</h2></div></div>
      <div class="setting-row"><div><strong>Color theme</strong><p>Carbon × Glacier, with an off-gray light mode and graphite dark mode.</p></div><select :value="store.theme" aria-label="Theme" @change="store.setTheme(($event.target as HTMLSelectElement).value as 'light' | 'dark')"><option value="light">Light</option><option value="dark">Dark</option></select></div>
      <p class="fine-print">No account, server, banking connection, or cloud sync.</p>
    </section>
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">BROWSER STORAGE</span><h2>Data location</h2></div></div>
      <p class="body-copy">Records stay in this browser profile on this device. Clearing site data or changing devices will not preserve them automatically.</p>
      <details class="details-panel"><summary>Technical storage details</summary><p class="body-copy">IndexedDB via Dexie · database <code>{{ databaseName }}</code> · native schema v5 · portable backup v5. Storage belongs to this website’s origin and browser profile.</p></details>
      <div class="setting-row"><div><strong>Storage estimate</strong><p>{{ storageEstimate }}</p></div><button class="button small" @click="storageInfo">Check</button></div>
      <div class="setting-row"><div><strong>Persistent storage</strong><p>{{ requestingPersistence ? 'Waiting for your browser’s permission decision' : persisted === true ? 'Granted' : persisted === false ? 'Not granted' : 'Not checked' }}. A request may be declined by the browser.</p></div><button class="button small" :disabled="requestingPersistence" @click="requestPersistence">{{ requestingPersistence ? 'Waiting…' : 'Request' }}</button></div>
    </section>
    </div>
    <div class="settings-column">
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">YOUR RECORDS</span><h2>Backup & restore</h2></div></div>
      <p class="body-copy">Download a portable JSON backup and keep a copy outside this browser. Restore validates the file before you confirm replacement of all local records.</p>
      <p class="fine-print">Up to 64 MB of UTF-8 JSON; files over 15 MB need an extra validation review. Oversized exports require manual recovery and are not usable portable backups.</p>
      <details class="details-panel"><summary>Backup compatibility</summary><p class="body-copy">Exports use portable v5 and require an updated app. Older app versions cannot read v5 exports. Imports from v1–v4 remain supported.</p></details>
      <div class="data-counts"><span>{{ rowCounts.months }} months</span><span>{{ rowCounts.obligations }} obligations</span><span>{{ rowCounts.transactions }} transactions</span><span>{{ rowCounts.debts }} debts</span><span>{{ rowCounts.recurringRules }} recurring rules</span><span>{{ rowCounts.recurringOccurrences }} recurring entries</span></div>
      <div class="backup-status" role="status"><p v-if="backupState === 'unknown'" class="body-copy">Backup freshness unknown. This browser cannot safely relate its tracking metadata to the records.</p><p v-else-if="backupState === 'never'" class="body-copy">No portable backup download initiated in this browser’s tracking history.</p><template v-else><p class="body-copy">Backup download initiated {{ backupHealth?.exported?.initiatedAt }}.</p><p class="fine-print">{{ backupState === 'current' ? 'No later tracked record changes.' : 'Records changed since that snapshot.' }}</p></template></div>
      <div v-if="reminder" class="details-panel"><p class="body-copy">Your records have unexported changes. Consider downloading a portable backup.</p><button class="text-link" @click="snooze">Remind me in seven days</button></div>
      <button class="button primary" :disabled="busy" @click="exportData">Download JSON backup</button>
      <details class="details-panel"><summary>Recovery for damaged records</summary><p class="body-copy">If portable validation fails, preserve an unvalidated raw copy for manual repair. Raw recovery files cannot be imported directly.</p><button class="button" :disabled="busy" @click="exportRecovery">Download recovery data</button></details>
      <hr class="section-divider"/>
      <label class="file-label">Select an Accrynt backup file<input ref="backupInput" type="file" :disabled="busy" accept="application/json,.json" @change="chooseBackup" /></label>
      <p v-if="readyBackup" class="success-message">Validated backup: {{ readyBackup.months.length }} month(s), {{ readyBackup.obligations.length }} obligation(s), {{ readyBackup.transactions.length }} transaction(s), {{ readyBackup.debts.length }} debt(s), {{ readyBackup.recurringRules.length }} recurring rule(s), {{ readyBackup.recurringOccurrences.length }} recurring entry/entries.</p>
      <p v-if="readyBackup" class="body-copy">Exported {{ readyBackup.exportedAt }} · {{ readyBackup.workspace==='demo-synthetic' ? 'DEMO · SYNTHETIC DATA' : 'Personal workspace' }} · {{ readyBackup.balanceEvents.length }} balance adjustments. A recovery download is initiated before replacement. Verify it is saved outside the browser.</p>
      <p v-if="provenanceWarning" class="error-message" role="alert">{{ provenanceWarning }}</p>
      <p v-if="restoreAgeWarning" class="error-message" role="alert">{{ restoreAgeWarning }}</p>
      <p v-if="importError" class="error-message" role="alert">{{ importError }}</p>
      <button v-if="readyBackup" class="button danger-button" :disabled="busy" @click="restore">Replace local records with backup</button>
    </section>
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">WORKSPACE TOOLS</span><h2>Local controls</h2></div></div>
      <p v-if="isDemo" class="body-copy">This synthetic workspace uses the same local workflows. Use Reset demo above to reload a scenario or Return to my workspace to leave the sandbox.</p><p v-else class="body-copy">Use Try demo for a fully interactive synthetic workspace. The small selected-month example adds fictional bills. It can only be added to an entirely empty workspace and never loads automatically.</p>
      <a v-if="!isDemo" class="button" :href="workspaceUrl(true)">Try demo</a>
      <button v-if="!store.hasAnyData" class="button" :disabled="busy" @click="loadSample">Load selected-month example</button>
      <p v-else-if="!isDemo" class="muted small-text">Example import is disabled because this workspace already has data.</p>
      <hr class="section-divider"/>
      <p class="body-copy">A current downloadable safety snapshot is prepared before deletion. Permanent deletion affects only the current browser's Accrynt database; existing downloaded backups are unaffected.</p>
      <button class="button danger-button" :disabled="busy || !store.hasAnyData" @click="clearAll">Delete all local records</button>
    </section>
    </div>
  </div>
  <p v-if="error" class="error-message" role="alert">{{ error }}</p>
</template>
