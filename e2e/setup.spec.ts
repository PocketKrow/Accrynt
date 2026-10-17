import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'
test('first-run actions directly open the requested editors without loading demo data', async ({ page }) => {
  await page.goto('/#/')
  const setup = page.getByRole('region', { name: 'Get started', exact: true })
  await expect(setup).toBeVisible()
  await setup.getByRole('button', { name: 'Set opening cash' }).click()
  await expect(page.getByLabel('Opening balance (USD)')).toBeVisible()
  await page.locator('.inline-editor').getByRole('button', { name: 'Cancel', exact: true }).click()
  await setup.getByRole('link', { name: 'Set expected income' }).click()
  await expect(page.locator('.inline-editor input')).toHaveValue('0.00')
  await page.locator('.inline-editor').getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('link', { name: /Overview/ }).click()
  await setup.getByRole('link', { name: 'Add first bill' }).click()
  await expect(page.getByRole('dialog', { name: 'Add obligation', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Demo workspace' })).not.toBeVisible()
})
test('prior completed-month closing is a reviewed draft suggestion and never an automatic rollover', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T16:00:00Z')); await page.goto('/#/settings')
  const stamp = '2026-10-16T16:00:00.000Z'
  const payload = { format: 'accrynt-portable', schemaVersion: 5, workspace: 'personal', exportedAt: stamp,
    months: [{ key: '2026-09', openingCents: -2500, incomeCents: 99999, updatedAt: stamp }],
    transactions: [{ id: 'aa000000-0000-4000-8000-000000000001', date: '2026-09-30', name: 'Synthetic prior deposit', kind: 'income', amountCents: 1000, category: 'Other', account: '', payment: null, obligationId: null, updatedAt: stamp }],
    obligations: [], debts: [], recurringRules: [], recurringOccurrences: [], balanceEvents: [] }
  await page.getByLabel('Select an Accrynt backup file').setInputFiles({ name: 'opening.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) })
  await expect(page.getByText('Validated backup:', { exact: false })).toBeVisible()
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Replace local records with backup' }).click()
  await expect(page.getByText('Validated backup:', { exact: false })).not.toBeVisible()
  await page.getByRole('link', { name: /Overview/ }).click()
  await expect(page.locator('.metric-card').filter({ hasText: 'Tracked available' })).toContainText('—')
  await page.getByRole('button', { name: 'Set opening balance' }).click()
  await expect(page.locator('.opening-suggestion')).toContainText('2026-09')
  await expect(page.locator('.opening-suggestion')).toContainText('Records may be incomplete')
  await page.getByRole('button', { name: 'Use prior recorded closing' }).click()
  await expect(page.getByLabel('Opening balance (USD)')).toHaveValue('-15.00')
  await expect(page.locator('.metric-card').filter({ hasText: 'Tracked available' })).toContainText('—')
  await page.getByRole('button', { name: 'Save opening balance', exact: true }).click()
  await expect(page.locator('.inline-editor')).not.toBeVisible()
  await expect(page.locator('.metric-card').filter({ hasText: 'Tracked available' })).toContainText('-$15.00')
  await page.getByRole('button', { name: 'Edit opening balance' }).click()
  await expect(page.getByRole('button', { name: 'Use prior recorded closing' })).not.toBeVisible()
  await page.locator('.inline-editor').getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Next month', exact: true }).click()
  await page.getByRole('button', { name: 'Set opening balance' }).click()
  await expect(page.getByRole('button', { name: 'Use prior recorded closing' })).not.toBeVisible() // October is still in progress.
})
