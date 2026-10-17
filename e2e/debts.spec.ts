import { Buffer } from 'node:buffer'
import { test, expect, type Page } from '@playwright/test'

async function openDebts(page: Page) {
  await page.goto('/#/debts')
  await expect(page.getByRole('heading', { name: 'Debts', exact: true })).toBeVisible()
}
async function fillDebt(page: Page) {
  await page.getByRole('button', { name: '+ Add debt' }).click()
  const dialog = page.getByRole('dialog', { name: 'Debt', exact: true })
  await dialog.getByLabel('Name', { exact: true }).fill('Test interest card')
  await dialog.getByLabel('Current balance (USD)').fill('1000.00')
  await dialog.getByLabel('Minimum payment (USD)').fill('50.00')
  await dialog.getByLabel('Annual interest rate % (optional)').fill('12')
  await dialog.getByLabel('Planned monthly payment (USD, optional)').fill('100.00')
  return dialog
}
async function exportData(page: Page) {
  await page.goto('/#/settings')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download JSON backup' }).click()
  const stream = await (await pending).createReadStream()
  if (!stream) throw new Error('No backup stream')
  const parts: Buffer[] = []
  for await (const part of stream) parts.push(Buffer.from(part))
  return JSON.parse(Buffer.concat(parts).toString('utf8'))
}

test('interest preview responds to inputs; saved forecasts survive reload without posting actual money', async ({ page }) => {
  await openDebts(page)
  const dialog = await fillDebt(page)
  const preview = dialog.getByRole('region', { name: 'Repayment estimate' })
  await expect(preview).toContainText('$10.00')
  await expect(preview).toContainText('$90.00')
  await expect(preview).toContainText('11 monthly payments')
  await dialog.getByLabel('Annual interest rate % (optional)').fill('24')
  await expect(preview).toContainText('$20.00')
  await expect(preview).toContainText('$80.00')
  await dialog.getByLabel('Annual interest rate % (optional)').fill('12')
  await dialog.getByRole('button', { name: 'Save debt' }).click()
  await expect(dialog).not.toBeVisible()
  await page.reload()
  const card = page.locator('.debt-card').filter({ hasText: 'Test interest card' })
  await expect(card.locator('.debt-balance')).toHaveText('$1,000.00')
  await expect(card).toContainText('11 monthly payments')
  await card.getByText('Calculation details & schedule', { exact: true }).click()
  await expect(card).toContainText('$58.98')
  await expect(card).toContainText('$1,058.98')
  await expect(card.getByRole('row').last()).toContainText('$0.00')
  await card.getByRole('button', { name: 'Edit ↗' }).click()
  await expect(dialog.getByLabel('Planned monthly payment (USD, optional)')).toHaveValue('100.00')
  await dialog.getByLabel('Planned monthly payment (USD, optional)').fill('50')
  await expect(preview).toContainText('23 monthly payments')
  await dialog.getByRole('button', { name: 'Save debt' }).click()
  const backup = await exportData(page)
  expect(backup.schemaVersion).toBe(5)
  expect(backup.debts[0]).toMatchObject({ balanceCents: 100000, aprMilliPercent: 12000, monthlyPaymentCents: 5000 })
  expect(backup.obligations).toEqual([])
  expect(backup.transactions).toEqual([])
  // The v2 file restores both saved payment plans and forecast inputs.
  await page.getByLabel('Select an Accrynt backup file').setInputFiles({ name: 'debts-v2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
  await expect(page.getByText('Validated backup:', { exact: false })).toBeVisible()
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Replace local records' }).click()
  await openDebts(page)
  await expect(card).toContainText('23 monthly payments')
})

test('missing rates, zero rates, zero payments, and interest-only payments have distinct states', async ({ page }) => {
  await openDebts(page)
  const dialog = await fillDebt(page)
  const preview = dialog.getByRole('region', { name: 'Repayment estimate' })
  const rate = dialog.getByLabel('Annual interest rate % (optional)')
  const payment = dialog.getByLabel('Planned monthly payment (USD, optional)')
  await rate.fill('')
  await expect(preview).toContainText('Add an annual rate')
  await rate.fill('0')
  await expect(preview).toContainText('10 monthly payments')
  await expect(preview).toContainText('$0.00')
  await rate.fill('12')
  await payment.fill('10')
  await expect(preview).toContainText('Payment does not reduce balance')
  await expect(preview).toContainText('below the saved minimum')
  await payment.fill('0')
  await expect(preview).toContainText('Add a monthly payment')
  await payment.fill('')
  await expect(preview).toContainText('23 monthly payments')
  await rate.fill('12.3456')
  await expect(preview).not.toBeVisible()
  await dialog.getByRole('button', { name: 'Save debt' }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await rate.fill('0')
  await dialog.getByRole('button', { name: 'Save debt' }).click()
  await expect(page.locator('.debt-card')).toContainText('20 monthly payments')
  const backup = await exportData(page)
  expect(backup.debts[0].monthlyPaymentCents).toBeNull()
  expect(backup.debts[0].aprMilliPercent).toBe(0)
})

test('legacy backup debts gain forecasts; schedules paginate and stay within the mobile viewport in both themes', async ({ page }) => {
  const legacy = { format: 'accrynt-portable', schemaVersion: 1, exportedAt: '2026-10-01T00:00:00.000Z',
    months: [], obligations: [], transactions: [], debts: [{ id: 'a21d16f2-1f1b-4dc4-a2f8-033c92766388',
      name: 'Legacy loan', balanceCents: 100000, startingBalanceCents: null, minimumCents: 5000, aprBasisPoints: 2400, updatedAt: '2026-10-01T00:00:00.000Z' }] }
  await page.goto('/#/settings')
  await page.getByLabel('Select an Accrynt backup file').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) })
  await expect(page.getByText('Validated backup:', { exact: false })).toBeVisible()
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Replace local records' }).click()
  await page.setViewportSize({ width: 320, height: 850 })
  await openDebts(page)
  const card = page.locator('.debt-card')
  await expect(card).toContainText('26 monthly payments')
  await card.getByText('Calculation details & schedule', { exact: true }).click()
  await expect(card.getByRole('table')).toBeVisible()
  await expect(card.getByRole('row')).toHaveCount(13)
  await card.getByRole('button', { name: 'Next 12' }).click()
  await expect(card.getByText('Page 2 of 3')).toBeVisible()
  await card.getByRole('button', { name: 'Next 12' }).click()
  await expect(card.getByRole('row')).toHaveCount(3)
  await expect(card.getByRole('row').last()).toContainText('$0.00')
  for (const theme of ['light', 'dark']) {
    if (await page.locator('.app-root').getAttribute('data-theme') !== theme) {
      await page.getByRole('button', { name: theme === 'dark' ? 'Switch to dark mode' : 'Switch to light mode' }).click()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await card.getByRole('button', { name: 'Edit ↗' }).click()
    const dialog = page.getByRole('dialog', { name: 'Debt', exact: true })
    await expect(dialog.getByRole('region', { name: 'Repayment estimate' })).toContainText('26 monthly payments')
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  }
})

test('an existing v1 browser database upgrades in place with linked records intact', async ({ page }) => {
  // Same-origin HTML seeds the old schema before the app opens Dexie. A manifest
  // navigation is a download in Firefox, so use an explicit HTML test fixture.
  await page.route('**/__migration-fixture', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Migration fixture</title>'
  }))
  await page.goto('/__migration-fixture')
  await page.evaluate(async () => {
    const stamp = '2026-10-01T00:00:00.000Z'
    const debtId = 'a21d16f2-1f1b-4dc4-a2f8-033c92766388'
    const obligationId = 'a21d16f2-1f1b-4dc4-a2f8-033c92766389'
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('accrynt-local-v1', 10) // Dexie v1 = native IndexedDB v10.
      request.onupgradeneeded = () => {
        const database = request.result
        database.createObjectStore('months', { keyPath: 'key' })
        database.createObjectStore('debts', { keyPath: 'id' })
        const obligations = database.createObjectStore('obligations', { keyPath: 'id' })
        for (const key of ['month', 'category', 'paidAt', 'debtId']) obligations.createIndex(key, key)
        const transactions = database.createObjectStore('transactions', { keyPath: 'id' })
        for (const key of ['date', 'kind', 'category', 'obligationId']) transactions.createIndex(key, key)
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const tx = database.transaction(['months', 'debts', 'obligations', 'transactions'], 'readwrite')
        tx.objectStore('months').put({ key: '2026-10', incomeCents: 200000, updatedAt: stamp })
        tx.objectStore('debts').put({ id: debtId, name: 'Existing browser loan', balanceCents: 100000,
          startingBalanceCents: 120000, minimumCents: 5000, aprBasisPoints: 2400, updatedAt: stamp })
        tx.objectStore('obligations').put({ id: obligationId, month: '2026-10', name: 'Existing payment',
          category: 'Debt payments', plannedCents: 5000, dueDay: 15, paidAt: null, debtId, updatedAt: stamp })
        tx.objectStore('transactions').put({ id: 'a21d16f2-1f1b-4dc4-a2f8-033c92766390', date: '2026-10-15',
          name: 'Existing ledger payment', kind: 'debt-payment', category: 'Debt payments', amountCents: 5000,
          account: 'Test checking', obligationId, updatedAt: stamp })
        tx.oncomplete = () => { database.close(); resolve() }
        tx.onerror = () => { database.close(); reject(tx.error) }
      }
    })
  })
  await openDebts(page)
  await expect(page.locator('.debt-card')).toContainText('26 monthly payments')
  const backup = await exportData(page)
  expect(backup.debts[0]).toMatchObject({ balanceCents: 100000, startingBalanceCents: 120000,
    minimumCents: 5000, aprMilliPercent: 24000, monthlyPaymentCents: null, balanceAsOf: null, interestMethod: 'monthly', updatedAt: '2026-10-01T00:00:00.000Z' })
  expect(backup.months).toHaveLength(1)
  expect(backup.obligations[0].debtId).toBe(backup.debts[0].id)
  expect(backup.transactions[0].obligationId).toBe(backup.obligations[0].id)
  expect(backup.transactions[0].amountCents).toBe(5000)
})
