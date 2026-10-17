import { afterEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import { draftPrompt, hasPendingDraft, protectUnload, reviewDrafts, useEditorDraft } from '../composables/editorDraft'
const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => { for (const scope of scopes.splice(0)) scope.stop() })
async function editor(initialDirty = false) {
  const scope = effectScope(); scopes.push(scope)
  const open = ref(true), busy = ref(false), form = reactive({ name: 'initial' })
  const save = vi.fn(async () => { open.value = false })
  let guard!: ReturnType<typeof useEditorDraft>
  scope.run(() => { guard = useEditorDraft({ label: 'synthetic editor', open: () => open.value, busy,
    draft: () => form, save, initialDirty: () => initialDirty, close: () => { open.value = false } }) })
  await nextTick(); await nextTick()
  return { open, busy, form, save, guard }
}
it('closes clean forms without prompting and only arms beforeunload for actual drafts', async () => {
  const e = await editor(), event = { preventDefault: vi.fn(), returnValue: undefined } as unknown as BeforeUnloadEvent
  protectUnload(event); expect(event.preventDefault).not.toHaveBeenCalled()
  e.form.name = 'draft'
  protectUnload(event); expect(event.preventDefault).toHaveBeenCalledOnce()
  e.form.name = 'initial'
  expect(await reviewDrafts()).toBe(true)
  expect(e.open.value).toBe(false); expect(draftPrompt.value).toBeNull()
})
it('cancel preserves a draft; intentional discard resets state', async () => {
  const e = await editor(); e.form.name = 'draft'
  const cancel = e.guard.close(); draftPrompt.value!.resolve('cancel'); await cancel
  expect(e.open.value).toBe(true); expect(hasPendingDraft()).toBe(true)
  const discard = reviewDrafts(); draftPrompt.value!.resolve('discard'); expect(await discard).toBe(true)
  expect(e.save).not.toHaveBeenCalled(); expect(hasPendingDraft()).toBe(false)
})
it('save-and-continue runs once and success clears protection', async () => {
  const e = await editor(); e.form.name = 'draft'
  const pending = reviewDrafts()
  expect(await reviewDrafts()).toBe(false)
  draftPrompt.value!.resolve('save'); expect(await pending).toBe(true)
  expect(e.save).toHaveBeenCalledOnce(); expect(hasPendingDraft()).toBe(false)
})
it('failed saves retain the draft and stop leaving; in-flight work cannot be discarded or resubmitted', async () => {
  const e = await editor(); e.form.name = 'draft'; e.save.mockImplementation(async () => {})
  const failed = reviewDrafts(); draftPrompt.value!.resolve('save'); expect(await failed).toBe(false)
  expect(e.form.name).toBe('draft'); expect(e.guard.dirty.value).toBe(true)
  e.busy.value = true
  const blocked = reviewDrafts(); expect(draftPrompt.value?.inFlight).toBe(true)
  draftPrompt.value!.resolve('discard'); expect(await blocked).toBe(false)
  expect(e.open.value).toBe(true); expect(e.save).toHaveBeenCalledOnce()
})

it('protects an unsaved draft transferred from another editor and resets after intentional discard', async () => {
  const e = await editor(true)
  expect(e.guard.dirty.value).toBe(true)
  const leaving = e.guard.close(); draftPrompt.value!.resolve('cancel'); await leaving
  expect(e.open.value).toBe(true)
  const discard = e.guard.close(); draftPrompt.value!.resolve('discard'); await discard
  expect(hasPendingDraft()).toBe(false)
})
