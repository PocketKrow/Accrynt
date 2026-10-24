import { test, expect } from '@playwright/test'
import { downloadBackup } from './support/backup'

test('failed save retains a dirty draft; navigation stays blocked and retry commits exactly once', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T16:00:00Z'))
  await page.goto('/#/ledger')
  await page.getByRole('button', { name: '+ Record transaction', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'Transaction', exact: true })
  await expect(form.getByLabel('Description', { exact: true })).toBeFocused()
  await form.getByLabel('Description', { exact: true }).fill('Synthetic retry deposit')
  await form.getByRole('combobox', { name: 'Type', exact: true }).selectOption('income')
  await form.getByLabel('Amount (USD)', { exact: true }).fill('12.34')
  await form.getByRole('button', { name: 'Cancel', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Unsaved changes', exact: true })
  await expect(review).toBeVisible()
  await review.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(form.getByLabel('Description', { exact: true })).toHaveValue('Synthetic retry deposit')
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    let failed = false
    IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore['put']>) {
      if (!failed && this.name === 'transactions') { failed = true; this.transaction.abort(); throw new Error('Synthetic one-time storage failure') }
      return put.apply(this, args)
    }
  })
  await form.getByRole('button', { name: 'Cancel', exact: true }).click()
  await review.getByRole('button', { name: 'Save and continue', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('Synthetic one-time storage failure')
  await expect(form.getByLabel('Amount (USD)', { exact: true })).toHaveValue('12.34')
  await expect(page).toHaveURL(/#\/ledger$/)
  await form.getByRole('button', { name: 'Save transaction', exact: true }).click()
  await expect(form).not.toBeVisible()
  const records = JSON.parse((await downloadBackup(page)).buffer.toString('utf8'))
  expect(records.transactions).toHaveLength(1)
  expect(records.transactions[0]).toMatchObject({ name: 'Synthetic retry deposit', amountCents: 1234, kind: 'income' })
})
