import { expect, test } from '@playwright/test'
// Run only in the two explicitly configured offset timezone projects.
test('actuals advance across local midnight and month boundaries without UTC date drift', async ({ page }, info) => {
  const newYork = info.project.name === 'new-york'
  const before = newYork ? '2026-11-01T03:59:00Z' : '2026-10-31T10:59:00Z'
  const after = newYork ? '2026-11-01T04:01:00Z' : '2026-10-31T11:01:00Z'
  await page.clock.install({ time: new Date(before) })
  await page.goto('/#/ledger')
  await expect(page.locator('.month-nav')).toContainText('October 2026')
  await page.getByRole('button', { name: '+ Record transaction' }).click()
  const form = page.getByRole('dialog', { name: 'Transaction', exact: true })
  await expect(form.getByLabel('Date', { exact: true })).toHaveValue('2026-10-31')
  await form.getByLabel('Date', { exact: true }).fill('2026-11-01')
  await form.getByLabel('Description', { exact: true }).fill('Synthetic boundary deposit')
  await form.getByRole('combobox', { name: 'Type', exact: true }).selectOption('income')
  await form.getByLabel('Amount (USD)', { exact: true }).fill('100')
  await form.getByRole('button', { name: 'Save transaction' }).click(); await expect(form).not.toBeVisible()
  await page.getByRole('button', { name: 'Next month', exact: true }).click()
  const income = page.locator('.metric-card').filter({ hasText: 'Recorded income' })
  await expect(income).toContainText('$0.00')
  await expect(page.getByRole('row').filter({ hasText: 'Synthetic boundary deposit' })).toContainText('Scheduled · excluded from actuals')
  await page.clock.setSystemTime(new Date(after)); await page.clock.runFor(60_001)
  await expect(income).toContainText('$100.00')
  await expect(page.getByRole('row').filter({ hasText: 'Synthetic boundary deposit' })).not.toContainText('Scheduled · excluded from actuals')
  await page.reload(); await expect(page.locator('.month-nav')).toContainText('November 2026')
})
