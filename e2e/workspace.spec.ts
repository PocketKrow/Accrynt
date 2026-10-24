import { Buffer } from 'node:buffer'
import { test, expect, type Page } from '@playwright/test'

// Playwright creates a fresh browser profile for each test. Only synthetic fixtures are used.
async function openPlan(page: Page) {
  await page.goto('/#/plan')
  await expect(page.getByRole('heading', { name: 'Monthly plan', exact: true })).toBeVisible()
}
async function addBill(page: Page, name = 'Test electricity') {
  await page.getByRole('button', { name: '+ Add obligation' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add obligation' })
  await dialog.getByLabel('Obligation name').fill(name)
  await dialog.getByLabel('Planned amount (USD)').fill('50.25')
  await dialog.getByLabel('Day due').fill('15')
  await dialog.getByRole('button', { name: 'Save obligation' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible()
}
async function goSettings(page: Page) {
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
}
async function exportData(page: Page) {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download JSON backup' }).click()
  const stream = await (await download).createReadStream()
  if (!stream) throw new Error('No backup stream')
  const parts: Buffer[] = []
  for await (const part of stream) parts.push(Buffer.from(part))
  return JSON.parse(Buffer.concat(parts).toString('utf8'))
}

test('income drafts close on month changes; paid bills stay separate from ledger and persist after reload', async ({ page }) => {
  await openPlan(page)
  await page.getByRole('button', { name: 'Edit additional income' }).click()
  const input = page.locator('.inline-editor input')
  await input.fill('1234.56')
  await page.getByRole('button', { name: 'Next month' }).click()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(input).not.toBeVisible()
  await page.getByRole('button', { name: 'Edit additional income' }).click()
  await expect(input).toHaveValue('0.00')
  await input.fill('1000.00')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.inline-editor')).not.toBeVisible()
  await addBill(page)
  await page.getByRole('checkbox', { name: 'Mark Test electricity paid' }).check()
  await expect(page.getByRole('row').filter({ hasText: 'Test electricity' }).getByText('Paid', { exact: true })).toBeVisible()
  await page.reload()
  // The selected month starts at today's month on launch; the saved plan remains in the following month.
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(page.getByRole('checkbox', { name: 'Mark Test electricity paid' })).toBeChecked()
  await expect(page.locator('.metric-card').filter({ hasText: 'Expected income' })).toContainText('$1,000.00')
  await page.goto('/#/ledger')
  await expect(page.getByText(/^No recorded activity in \d{4}-\d{2}\.$/)).toBeVisible()
})

test('transaction date drives obligation choices and changing to income clears the link', async ({ page }) => {
  await openPlan(page); await addBill(page)
  const month = await page.locator('.top-month').textContent()
  expect(month).toBeTruthy()
  await page.goto('/#/ledger')
  await page.getByRole('button', { name: '+ Record transaction' }).click()
  const dialog = page.getByRole('dialog', { name: 'Transaction', exact: true })
  await dialog.getByLabel('Description').fill('Test payment')
  await dialog.getByLabel('Amount (USD)').fill('50.25')
  const obligation = dialog.getByLabel('Related obligation')
  const originalDate = await dialog.getByLabel('Date', { exact: true }).inputValue()
  await dialog.getByLabel('Date', { exact: true }).fill('2020-01-01')
  await expect(obligation).not.toBeVisible()
  await dialog.getByLabel('Date', { exact: true }).fill(originalDate)
  await expect(obligation).toBeVisible()
  await obligation.selectOption({ label: (await obligation.locator('option').allTextContents())[1] })
  await dialog.getByRole('combobox', { name: 'Type', exact: true }).selectOption('income')
  await expect(obligation).not.toBeVisible()
  await dialog.getByRole('button', { name: 'Save transaction' }).click()
  await expect(dialog).not.toBeVisible()
  await goSettings(page)
  const backup = await exportData(page)
  expect(backup.transactions[0].obligationId).toBeNull()
  expect(backup.transactions[0].kind).toBe('income')
})

test('backup restore roundtrips records; invalid input and cancelled deletion preserve them', async ({ page }) => {
  await openPlan(page); await addBill(page)
  await goSettings(page)
  const backup = await exportData(page)
  expect(backup.obligations).toHaveLength(1)
  const file = page.getByLabel('Select an Accrynt backup file')
  await file.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{ broken') })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Replace local records' })).not.toBeVisible()
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Delete all local records' }).click()
  expect((await exportData(page)).obligations).toHaveLength(1)
  const rejectClear = async (dialog: import('@playwright/test').Dialog) => {
    if (dialog.type() === 'prompt') await dialog.accept('delete')
    else await dialog.accept()
  }
  page.on('dialog', rejectClear)
  await page.getByRole('button', { name: 'Delete all local records' }).click()
  page.off('dialog', rejectClear)
  expect((await exportData(page)).obligations).toHaveLength(1)
  const confirmClear = async (dialog: import('@playwright/test').Dialog) => {
    if (dialog.type() === 'prompt') await dialog.accept('DELETE')
    else await dialog.accept()
  }
  page.on('dialog', confirmClear)
  const clearingSafety = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Delete all local records' }).click()
  expect((await clearingSafety).suggestedFilename()).toContain('Accrynt-before-clear')
  await expect(page.locator('.data-counts')).toContainText('0 obligations')
  await expect(file).toBeEnabled()
  page.off('dialog', confirmClear)
  await file.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await expect(page.getByText('Validated backup:', { exact: false })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  const restoringSafety = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Replace local records' }).click()
  expect((await restoringSafety).suggestedFilename()).toContain('Accrynt-before-restore')
  await expect(page.getByText('Validated backup:', { exact: false })).not.toBeVisible()
  await expect(page.locator('.data-counts')).toContainText('1 obligations')
  expect((await exportData(page)).obligations).toEqual(backup.obligations)
})

test('storage controls handle browser decisions and theme survives a reload', async ({ page }) => {
  await goSettings(page)
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await expect(page.getByText(/MB used|Storage estimate unavailable/)).toBeVisible()
  await page.getByRole('button', { name: 'Request', exact: true }).click()
  await expect(page.getByText(/persistent storage\.|Persistent storage requests are not supported/)).toBeVisible()
  await page.getByLabel('Theme', { exact: true }).selectOption('dark')
  await page.reload()
  await expect(page.locator('.app-root')).toHaveAttribute('data-theme', 'dark')
})

test('production app reloads offline with its IndexedDB records', async ({ page, context }) => {
  await openPlan(page); await addBill(page)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  // Prompt-based workers control subsequent navigations; first installation does not force a reload.
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: 'Test electricity' })).toBeVisible()
  await page.goto('/#/reports')
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()
})

test('mobile navigation, both themes, keyboard dialog controls, and 320px layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /at a glance/ })).toBeVisible()
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Monthly Plan' }).click()
  await page.getByRole('button', { name: '+ Add obligation' }).click()
  await expect(page.getByLabel('Obligation name')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('button', { name: '+ Add obligation' })).toBeFocused()
  for (const theme of ['light', 'dark']) {
    await page.goto('/#/settings')
    await page.getByLabel('Theme', { exact: true }).selectOption(theme)
    for (const route of ['/', '/plan', '/ledger', '/debts', '/reports', '/settings']) {
      await page.goto(`/#${route}`)
      await expect(page.locator('h1')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
    await page.goto('/')
    await page.screenshot({ path: test.info().outputPath(`overview-${theme}-320.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const main = await page.getByRole('main').boundingBox()
  const rail = await page.getByRole('complementary').boundingBox()
  expect(main && rail && rail.x >= main.x + main.width).toBe(true)
  await page.screenshot({ path: test.info().outputPath('overview-dark-desktop.png'), fullPage: true })
})


test('cross-tab edits refresh live views and cannot resurrect a deleted obligation', async ({ page, context }) => {
  await openPlan(page); await addBill(page)
  const other = await context.newPage(); await openPlan(other)
  await page.getByRole('checkbox', { name: 'Mark Test electricity paid' }).check()
  await expect(other.getByRole('row').filter({ hasText: 'Test electricity' }).getByText('Paid', { exact: true })).toBeVisible()
  await page.getByRole('row').filter({ hasText: 'Test electricity' }).getByRole('button', { name: /^Edit /, exact: false }).click()
  const editor = page.getByRole('dialog', { name: 'Edit obligation' })
  await editor.getByLabel('Planned amount (USD)').fill('99.00')
  other.once('dialog', dialog => dialog.accept())
  await other.getByRole('row').filter({ hasText: 'Test electricity' }).getByRole('button', { name: /^Delete /, exact: false }).click()
  await expect(other.getByRole('row').filter({ hasText: 'Test electricity' })).not.toBeVisible()
  await editor.getByRole('button', { name: 'Save obligation' }).click()
  await expect(editor.getByRole('alert')).toContainText('no longer exists')
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Test electricity' })).not.toBeVisible()
})

test('temporary IndexedDB open failure offers a working Retry without clearing records', async ({ page }) => {
  await openPlan(page); await addBill(page)
  await page.addInitScript(() => {
    const original = IDBFactory.prototype.open
    const state = window as typeof window & { accryntTestStorageAvailable: boolean }
    state.accryntTestStorageAvailable = false
    IDBFactory.prototype.open = function(name, version) {
      if (!state.accryntTestStorageAvailable) throw new DOMException('Test temporary IndexedDB failure', 'UnknownError')
      return version === undefined ? original.call(this, name) : original.call(this, name, version)
    }
  })
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Local storage unavailable')
  await page.evaluate(() => { (window as typeof window & { accryntTestStorageAvailable: boolean }).accryntTestStorageAvailable = true })
  await page.getByRole('button', { name: 'Retry local storage' }).click()
  await expect(page.getByRole('heading', { name: 'Monthly plan', exact: true })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Test electricity' })).toBeVisible()
  await expect(page.getByRole('alert')).not.toBeVisible()
})


test('persistent storage shows its pending decision and handles a refusal without losing records', async ({ page }) => {
  await openPlan(page); await addBill(page)
  await page.evaluate(() => {
    Object.defineProperty(navigator.storage, 'persist', { configurable: true, value: () => new Promise<boolean>(resolve => {
      (window as typeof window & { accryntTestResolvePersistence: (value: boolean) => void }).accryntTestResolvePersistence = resolve
    }) })
  })
  await goSettings(page)
  await page.getByRole('button', { name: 'Request', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Waiting…', exact: true })).toBeDisabled()
  await expect(page.getByText(/Waiting for your browser’s permission decision/)).toBeVisible()
  await page.evaluate(() => { (window as typeof window & { accryntTestResolvePersistence: (value: boolean) => void }).accryntTestResolvePersistence(false) })
  await expect(page.getByRole('button', { name: 'Request', exact: true })).toBeEnabled()
  await expect(page.getByText('The browser did not grant persistent storage.', { exact: false })).toBeVisible()
  expect((await exportData(page)).obligations).toHaveLength(1)
})
