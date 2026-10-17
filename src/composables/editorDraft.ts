import { computed, nextTick, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'

type Choice = 'save' | 'discard' | 'cancel'
interface Editor {
  label: string
  active: () => boolean
  dirty: () => boolean
  busy: () => boolean
  save: () => Promise<void>
  discard: () => void
  valid: () => boolean
}
const editors = new Set<Editor>()
export const draftPrompt = shallowRef<{ label: string; inFlight: boolean; resolve: (choice: Choice) => void } | null>(null)
let deciding = false
export const hasPendingDraft = () => [...editors].some(editor => editor.active() && (editor.dirty() || editor.busy()))
export function protectUnload(event: BeforeUnloadEvent) {
  if (!hasPendingDraft()) return
  event.preventDefault()
  event.returnValue = '' // Browsers control the wording and may require prior user interaction.
}
async function resolveEditors(candidates: Editor[]) {
  if (deciding) return false
  deciding = true
  try {
    for (const editor of candidates) {
      if (!editor.active() || (!editor.dirty() && !editor.busy())) continue
      const inFlight = editor.busy()
      const choice = await new Promise<Choice>(resolve => { draftPrompt.value = { label: editor.label, inFlight, resolve } })
      draftPrompt.value = null
      if (inFlight || editor.busy() || choice === 'cancel') return false
      if (choice === 'discard') editor.discard()
      else {
        if (!editor.valid()) return false
        await editor.save()
        await nextTick()
        if (editor.active() && (editor.dirty() || editor.busy())) return false
      }
    }
    for (const editor of candidates) if (editor.active() && !editor.busy()) editor.discard()
    return true
  } finally { deciding = false }
}
export function reviewDrafts() { return resolveEditors([...editors]) }

/** One in-memory baseline per editor opening. Never follows live store updates. */
export function useEditorDraft(options: {
  label: string; open: () => boolean; draft: () => unknown; busy: Ref<boolean>
  save: () => Promise<void>; close: () => void; element?: Ref<HTMLElement | null>
}) {
  const baseline = ref('')
  const value = () => JSON.stringify(options.draft())
  const dirty = computed(() => options.open() && baseline.value !== value())
  const reset = () => { baseline.value = value() }
  watch(options.open, async open => { if (open) { await nextTick(); reset() } }, { immediate: true, flush: 'post' })
  const editor: Editor = {
    label: options.label, active: options.open, dirty: () => dirty.value, busy: () => options.busy.value,
    save: options.save, discard: () => { reset(); options.close() },
    valid: () => options.element?.value?.querySelector('form')?.reportValidity() ?? true
  }
  editors.add(editor)
  onScopeDispose(() => { editors.delete(editor) })
  async function close() {
    if (await resolveEditors([editor])) { reset(); options.close() }
  }
  return { dirty, reset, close }
}
