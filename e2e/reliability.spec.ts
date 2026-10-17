import { test, expect, type Page, type Download } from '@playwright/test'
import { Buffer } from 'node:buffer'
const stamp = '2026-10-16T16:00:00.000Z'
const empty = { format: 'accrynt-portable', schemaVersion: 5, workspace: 'personal', exportedAt: stamp,
  months: [], obligations: [], transactions: [], debts: [], recurringRules: [], recurringOccurrences: [], balanceEvents: [] }
async function fixed(page: Page) { await page.clock.setFixedTime(new Date(stamp)) }
async function readDownload(download: Download) {
  const stream = await download.createReadStream(); if (!stream) throw new Error('Missing download stream')
  const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}
async function download(page: Page) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download JSON backup', exact: true }).click()
  return readDownload(await pending)
}
async function restore(page: Page, payload: unknown) {
  await page.goto('/#/settings')
  await page.getByLabel('Select an Accrynt backup file').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) })
  await expect(page.getByText('Validated backup:', { exact: false })).toBeVisible()
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Replace local records with backup' }).click()
  await expect(page.getByText('Validated backup:', { exact: false })).not.toBeVisible()
}
async function addBill(page: Page, name = 'Draft utility') {
  await page.getByRole('button', { name: '+ Add obligation' }).click()
  const form = page.getByRole('dialog', { name: 'Add obligation', exact: true })
  await form.getByLabel('Obligation name').fill(name)
  await form.getByLabel('Planned amount (USD)').fill('25')
  return form
}

test('dirty modal Close, Cancel and Escape preserve drafts; clean forms close without a question', async ({ page }) => {
  await fixed(page); await page.goto('/#/plan')
  await page.getByRole('button', { name: '+ Add obligation' }).click()
  await page.getByRole('dialog', { name: 'Add obligation', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).not.toBeVisible()
  const form = await addBill(page)
  for (const action of ['Close', 'Cancel', 'Escape']) {
    if (action === 'Escape') await form.press('Escape')
    else await form.getByRole('button', { name: action, exact: true }).click()
    const review = page.getByRole('dialog', { name: 'Unsaved changes' })
    await expect(review).toBeVisible()
    await review.getByRole('button', { name: 'Keep editing' }).click()
    await expect(form.getByLabel('Obligation name')).toHaveValue('Draft utility')
  }
  await form.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(form).not.toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Draft utility' })).toHaveCount(0)
})

test('inline navigation and month changes support cancel, save, discard, and dirty reload protection', async ({ page }) => {
  await fixed(page); await page.goto('/#/plan')
  await page.getByRole('button', { name: 'Edit additional income ↗' }).click()
  const input = page.locator('.inline-editor input')
  await input.fill('500')
  await page.getByRole('link', { name: /Ledger/ }).click()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page).toHaveURL(/#\/plan$/); await expect(input).toHaveValue('500')
  await page.getByRole('button', { name: 'Next month', exact: true }).click()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.locator('.month-nav')).toContainText('October')
  // Browser reload uses its own supported beforeunload mechanism, not a custom draft dialog.
  const unload = page.waitForEvent('dialog'); const reload = page.reload({ timeout: 2000 }).catch(() => null)
  const native = await unload; expect(native.type()).toBe('beforeunload'); await native.dismiss(); await reload
  await expect(input).toHaveValue('500')
  await page.getByRole('button', { name: 'Next month', exact: true }).click()
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.locator('.month-nav')).toContainText('November')
  await page.getByRole('button', { name: 'Previous month', exact: true }).click()
  await expect(page.locator('.metric-card').filter({ hasText: 'Expected income' })).toContainText('$500.00')
  await page.getByRole('button', { name: 'Edit additional income ↗' }).click(); await input.fill('600')
  await page.getByRole('link', { name: /Ledger/ }).click()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(page).toHaveURL(/#\/ledger$/)
})

test('two tabs reject stale monthly drafts without refreshing baselines; independent fields survive', async ({ page, context }) => {
  await fixed(page); await page.goto('/#/plan')
  const other = await context.newPage(); await fixed(other); await other.goto('/#/plan')
  for (const tab of [page, other]) { await tab.getByRole('button', { name: 'Edit additional income ↗' }).click() }
  await page.locator('.inline-editor input').fill('500'); await other.locator('.inline-editor input').fill('600')
  await page.locator('.inline-editor').getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.inline-editor')).not.toBeVisible()
  await expect(other.locator('.metric-card').filter({ hasText: 'Expected income' })).toContainText('$500.00')
  await other.locator('.inline-editor').getByRole('button', { name: 'Save', exact: true }).click()
  await expect(other.getByRole('alert')).toContainText('Your draft is kept')
  await expect(other.locator('.inline-editor input')).toHaveValue('600')
  // Saving while leaving must fail too; the draft and route survive.
  await other.getByRole('link', { name: /Reports/ }).click()
  await other.getByRole('button', { name: 'Save and continue' }).click()
  await expect(other).toHaveURL(/#\/plan$/); await expect(other.locator('.inline-editor input')).toHaveValue('600')
  await other.locator('.inline-editor').getByRole('button', { name: 'Cancel' }).click()
  await other.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await other.getByRole('link', { name: /Overview/ }).click()
  await other.getByRole('button', { name: 'Set opening balance' }).click(); await other.locator('.inline-editor input').fill('-25')
  await page.getByRole('button', { name: 'Edit additional income ↗' }).click(); await page.locator('.inline-editor input').fill('700')
  await page.locator('.inline-editor').getByRole('button', { name: 'Save', exact: true }).click()
  await other.getByRole('button', { name: 'Save opening balance', exact: true }).click()
  await expect(other.locator('.inline-editor')).not.toBeVisible()
  await other.getByRole('link', { name: /Settings/ }).click()
  const data = JSON.parse((await download(other)).toString('utf8'))
  expect(data.months[0]).toMatchObject({ incomeCents: 70000, openingCents: -2500 })
})

test('ordinary debt-payment entry connects principal once and the explicit outflow-only path keeps it unchanged', async ({ page }) => {
  await fixed(page)
  const debtId = 'aa000000-0000-4000-8000-000000000001', billId = 'aa000000-0000-4000-8000-000000000002'
  await restore(page, { ...empty,
    debts: [{ id: debtId, name: 'Synthetic loan', balanceCents: 100000, startingBalanceCents: null, minimumCents: 10000,
      monthlyPaymentCents: null, aprMilliPercent: 0, balanceAsOf: '2026-10-01', interestMethod: 'monthly', updatedAt: stamp }],
    obligations: [{ id: billId, name: 'Synthetic loan bill', month: '2026-10', category: 'Debt payments', plannedCents: 10000, dueDay: 20, debtId, paidAt: null, updatedAt: stamp }] })
  await page.goto('/#/ledger'); await page.getByRole('button', { name: '+ Record transaction' }).click()
  const form = page.getByRole('dialog', { name: 'Transaction', exact: true })
  await form.getByLabel('Description', { exact: true }).fill('Transferred payment draft')
  await form.getByLabel('Amount (USD)', { exact: true }).fill('50')
  await form.getByRole('combobox', { name: 'Type', exact: true }).selectOption({ label: 'Debt payment · update balance' })
  const payment = page.getByRole('dialog', { name: 'Record payment', exact: true })
  await payment.getByRole('combobox', { name: 'Debt', exact: true }).selectOption(debtId)
  await payment.getByRole('combobox', { name: 'Related obligation', exact: true }).selectOption(billId)
  await expect(payment.getByLabel('Payment amount (USD)')).toHaveValue('50')
  await expect(payment.getByLabel('Description', { exact: true })).toHaveValue('Transferred payment draft')
  await payment.getByRole('button', { name: 'Confirm payment', exact: true }).dblclick()
  await expect(payment).not.toBeVisible()
  await page.getByRole('button', { name: '+ Record transaction' }).click()
  await form.getByRole('combobox', { name: 'Type', exact: true }).selectOption({ label: 'Debt outflow only · balance unchanged' })
  await form.getByLabel('Description', { exact: true }).fill('Intentional external outflow')
  await form.getByLabel('Amount (USD)', { exact: true }).fill('10')
  await form.getByRole('button', { name: 'Save transaction' }).click()
  await expect(form).not.toBeVisible()
  await page.goto('/#/settings'); const data = JSON.parse((await download(page)).toString('utf8'))
  expect(data.debts[0].balanceCents).toBe(95000)
  expect(data.transactions).toHaveLength(2)
  expect(data.transactions.find((t: { name: string }) => t.name === 'Intentional external outflow').payment).toBeNull()
  await page.goto('/#/plan')
  await expect(page.getByRole('row').filter({ hasText: 'Synthetic loan bill' })).toContainText('Partial')
  await expect(page.getByRole('row').filter({ hasText: 'Synthetic loan bill' })).toContainText('$50.00 remaining')
})

test('skipped bills restore explicitly across two tabs and reload without recovering old payment links', async ({ page, context }) => {
  await fixed(page); await page.goto('/?demo=1#/plan')
  const bill = page.getByRole('row').filter({ hasText: 'Fictional utilities' })
  await expect(bill).toBeVisible()
  page.once('dialog', d => d.accept()); await bill.getByRole('button', { name: 'Delete Fictional utilities', exact: true }).click()
  const other = await context.newPage(); await fixed(other); await other.goto('/?demo=1#/plan')
  for (const tab of [page, other]) {
    await tab.getByRole('region', { name: 'Skipped bills', exact: true }).getByRole('button', { name: 'Restore Fictional utilities', exact: true }).click()
    const dialog = tab.getByRole('dialog', { name: 'Restore skipped bill', exact: true })
    await expect(dialog).toContainText('no historical category or debt metadata')
    await dialog.getByRole('combobox', { name: 'Category', exact: true }).selectOption('Utilities')
    await dialog.getByLabel('I reviewed the category and debt link').check()
  }
  await Promise.all([page, other].map(tab => tab.getByRole('button', { name: 'Restore bill', exact: true }).click()))
  for (const tab of [page, other]) await expect(tab.getByRole('dialog', { name: 'Restore skipped bill', exact: true })).not.toBeVisible()
  await page.reload(); await expect(page.getByRole('row').filter({ hasText: 'Fictional utilities' })).toHaveCount(1)
  await page.goto('/?demo=1#/settings')
  const data = JSON.parse((await download(page)).toString('utf8'))
  const restored = data.obligations.filter((b: { name: string; month: string }) => b.name === 'Fictional utilities' && b.month === '2026-10')
  expect(restored).toHaveLength(1); expect(restored[0].paidAt).toBeNull()
  expect(data.transactions.filter((t: { obligationId: string }) => t.obligationId === restored[0].id)).toHaveLength(0)
})

test('actual non-ASCII exported artifact above 15 MB restores through the file input; cancellations and malformed input keep records', async ({ page }) => {
  test.setTimeout(90_000)
  await fixed(page); await page.goto('/#/settings')
  // Disposable synthetic multi-year history using the browser's real IndexedDB API.
  await page.evaluate(async stamp => {
    const rows = Array.from({ length: 24000 }, (_, i) => ({ id: crypto.randomUUID(), date: `${2020 + i % 7}-10-01`, name: '備'.repeat(100), kind: 'expense',
      category: 'Other', amountCents: 1, account: '雪'.repeat(80), obligationId: null, payment: null, updatedAt: stamp }))
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('accrynt-local-v1')
      request.onsuccess = () => { const database = request.result, tx = database.transaction('transactions', 'readwrite')
        for (const row of rows) tx.objectStore('transactions').put(row)
        tx.oncomplete = () => { database.close(); resolve() }; tx.onabort = () => reject(tx.error)
      }; request.onerror = () => reject(request.error)
    })
  }, stamp)
  await page.reload() // Dexie cannot observe writes made directly through native IndexedDB in this document.
  await expect(page.locator('.data-counts')).toContainText('24000 transactions')
  const artifact = await download(page); expect(artifact.byteLength).toBeGreaterThan(15_000_000)
  const data = JSON.parse(artifact.toString('utf8'))
  const input = page.getByLabel('Select an Accrynt backup file')
  page.once('dialog', d => d.dismiss())
  await input.setInputFiles({ name: 'actual-export.json', mimeType: 'application/json', buffer: artifact })
  await expect(page.getByText('Validated backup:', { exact: false })).not.toBeVisible()
  await input.setInputFiles([])
  page.once('dialog', d => d.accept())
  await input.setInputFiles({ name: 'actual-export.json', mimeType: 'application/json', buffer: artifact })
  await expect(page.getByText('Validated backup:', { exact: false })).toBeVisible()
  page.once('dialog', d => d.dismiss())
  await page.getByRole('button', { name: 'Replace local records with backup' }).click()
  await expect(page.locator('.data-counts')).toContainText('24000 transactions')
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Replace local records with backup' }).click()
  // Firefox CI can take over five seconds to finish an atomic 24,000-row restore.
  // Wait for the operation to settle, then still verify successful completion/data.
  await expect(page.getByRole('button', { name: 'Download JSON backup', exact: true })).toBeEnabled({ timeout: 30_000 })
  await expect(page.getByText('Validated backup:', { exact: false })).not.toBeVisible()
  expect(JSON.parse((await download(page)).toString('utf8')).transactions).toEqual(data.transactions)
  await input.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') })
  await expect(page.locator('.error-message')).toBeVisible()
  await expect(page.locator('.data-counts')).toContainText('24000 transactions')
})

test('file input checks the 64 MB boundary in UTF-8 bytes before replacement', async ({ page }) => {
  test.setTimeout(90_000); await fixed(page); await page.goto('/#/settings')
  const prepare = async (size: number) => page.getByLabel('Select an Accrynt backup file').evaluate((input, { size, empty }) => {
    const text = JSON.stringify(empty), data = new DataTransfer()
    data.items.add(new File([text, ' '.repeat(size - new TextEncoder().encode(text).length)], 'boundary.json', { type: 'application/json' }))
    ;(input as HTMLInputElement).files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }))
  }, { size, empty })
  await prepare(64_000_001)
  await expect(page.getByRole('alert')).toContainText('64 MB')
  await expect(page.getByRole('button', { name: 'Replace local records with backup' })).not.toBeVisible()
  page.once('dialog', d => d.accept()); await prepare(64_000_000)
  await expect(page.getByText('Validated backup:', { exact: false })).toBeVisible()
})


test('switching a typed transaction to connected payment retains its unsaved-draft protection', async ({ page }) => {
  await fixed(page); await page.goto('/#/ledger')
  await page.getByRole('button', { name: '+ Record transaction' }).click()
  const transaction = page.getByRole('dialog', { name: 'Transaction', exact: true })
  await transaction.getByLabel('Description', { exact: true }).fill('Transferred unsaved draft')
  await transaction.getByLabel('Amount (USD)', { exact: true }).fill('50')
  await transaction.getByRole('combobox', { name: 'Type', exact: true }).selectOption('connected')
  const payment = page.getByRole('dialog', { name: 'Record payment', exact: true })
  await payment.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(payment.getByLabel('Description', { exact: true })).toHaveValue('Transferred unsaved draft')
  await expect(payment.getByLabel('Payment amount (USD)')).toHaveValue('50')
  await payment.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(payment).not.toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Transferred unsaved draft' })).toHaveCount(0)
})
