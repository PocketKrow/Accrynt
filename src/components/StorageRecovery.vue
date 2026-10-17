<script setup lang="ts">
import { ref } from 'vue'
import { downloadFile } from '../data/backup'
import { readRawRecovery } from '../data/raw-recovery'
import { errorMessage } from '../domain/errors'

const busy = ref(false), error = ref(''), notice = ref('')
async function recover() {
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const snapshot = await readRawRecovery()
    downloadFile(`Accrynt-RAW-RECOVERY-native-${Date.now()}.json`, JSON.stringify(snapshot, null, 2))
    notice.value = 'Raw recovery download initiated. Verify that the file is saved outside this browser. It needs manual repair before portable import.'
  } catch (reason) { error.value = errorMessage(reason, 'Unable to read raw records. No data was changed.') }
  finally { busy.value = false }
}
</script>
<template>
  <div class="storage-recovery">
    <p>If an upgrade cannot open your records, preserve an unvalidated raw copy for manual repair. This reads the existing database without upgrading, clearing or replacing it. It cannot bypass browser storage restrictions.</p>
    <button type="button" class="button" :disabled="busy" @click="recover">{{ busy ? 'Reading raw records…' : 'Download raw recovery' }}</button>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" class="error-message" role="alert">{{ error }}</p>
  </div>
</template>
