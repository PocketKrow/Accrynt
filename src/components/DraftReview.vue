<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { draftPrompt } from '../composables/editorDraft'
const dialog = ref<HTMLDialogElement | null>(null)
watch(draftPrompt, async prompt => {
  await nextTick()
  if (prompt && !dialog.value?.open) dialog.value?.showModal()
  if (!prompt && dialog.value?.open) dialog.value.close()
})
</script>
<template>
  <dialog ref="dialog" class="modal-panel native-dialog draft-review" aria-label="Unsaved changes" @cancel.prevent="draftPrompt?.resolve('cancel')">
    <div class="modal-heading"><h2>{{ draftPrompt?.inFlight ? 'Save in progress' : 'Unsaved changes' }}</h2></div>
    <p class="body-copy">{{ draftPrompt?.inFlight ? 'Wait for the current operation to finish before leaving. Your draft stays open.' : `You have changes in ${draftPrompt?.label}. Save them before continuing?` }}</p>
    <div class="modal-actions">
      <button class="button" autofocus @click="draftPrompt?.resolve('cancel')">Keep editing</button>
      <template v-if="!draftPrompt?.inFlight"><button class="button" @click="draftPrompt?.resolve('discard')">Discard changes</button><button class="button primary" @click="draftPrompt?.resolve('save')">Save and continue</button></template>
    </div>
  </dialog>
</template>
