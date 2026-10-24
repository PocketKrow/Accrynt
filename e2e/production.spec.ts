import { test, expect, type Page } from '@playwright/test'
import { downloadBackup } from './support/backup'
import { Buffer } from 'node:buffer'
import { syntheticFixture } from '../src/tests/fixtures/synthetic-workspace'
async function snapshot(page: Page, name: string) {
  return page.evaluate(async dbName => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(dbName); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const tx = database.transaction([...database.objectStoreNames], 'readonly')
    const result: Record<string, unknown[]> = {}
    await Promise.all([...database.objectStoreNames].map(table => new Promise<void>((resolve, reject) => {
      const request = tx.objectStore(table).getAll(); request.onsuccess = () => { result[table] = request.result; resolve() }; request.onerror = () => reject(request.error)
    })))
    database.close(); return result
  }, name)
}
test('production has no demo/sample entry points and legacy query parameters never seed records', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T16:00:00Z'))
  await page.goto('/?demo=1#/settings')
  await expect(page.locator('.data-counts')).toContainText('0 transactions')
  await expect(page.locator('.data-counts')).toContainText('0 obligations')
  for (const name of ['Try demo', 'Reset demo', 'Load selected-month example']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0)
  }
  const file = await downloadBackup(page), data = JSON.parse(file.buffer.toString('utf8'))
  expect(file.filename).toMatch(/^Accrynt-backup-/)
  expect(data.workspace).toBe('personal')
  expect(data.transactions).toEqual([]); expect(data.obligations).toEqual([])
  expect(await page.evaluate(async () => (await indexedDB.databases()).map(db => db.name))).not.toContain('accrynt-demo-v1')
})

test('legacy demo storage is left untouched while production retains personal records and keyboard navigation', async ({ page }) => {
  await page.goto('/#/plan')
  await page.getByRole('button', { name: '+ Add obligation', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'Add obligation', exact: true })
  await form.getByLabel('Obligation name').fill('Synthetic personal sentinel')
  await form.getByLabel('Planned amount (USD)').fill('12.34')
  await form.getByRole('button', { name: 'Save obligation', exact: true }).click()
  await expect(form).not.toBeVisible()
  await page.evaluate(async () => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('accrynt-demo-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('legacy')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result, tx = database.transaction('legacy', 'readwrite')
      tx.objectStore('legacy').put({ name: 'Synthetic legacy sentinel', cents: 123 }, 'sentinel')
      tx.oncomplete = () => { database.close(); resolve() }; tx.onabort = () => reject(tx.error)
    }
  }))
  const before = await snapshot(page, 'accrynt-demo-v1')
  await page.goto('/?demo=1#/plan')
  await expect(page.getByRole('row').filter({ hasText: 'Synthetic personal sentinel' })).toContainText('$12.34')
  expect(await snapshot(page, 'accrynt-demo-v1')).toEqual(before)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused()
  await page.keyboard.press('Enter'); await expect(page.locator('#main-content')).toBeFocused()
  await page.getByRole('link', { name: 'Skip to navigation', exact: true }).focus()
  await page.keyboard.press('Enter'); await expect(page.locator('#main-navigation')).toBeFocused()
  await page.setViewportSize({ width: 320, height: 800 })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Menu', exact: true }).click(); await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused()
})

test('legacy synthetic-labelled backups retain a warning without inserting records on selection', async ({ page }) => {
  await page.goto('/#/settings')
  await page.getByLabel('Select an Accrynt backup file').setInputFiles({ name: 'legacy-synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(syntheticFixture('2026-10-16'))) })
  await expect(page.getByRole('alert').filter({ hasText: 'synthetic example data' })).toBeVisible()
  await expect(page.getByText('Validated backup:', { exact: false })).toBeVisible()
  await expect(page.locator('.data-counts')).toContainText('0 transactions')
  const current = JSON.parse((await downloadBackup(page)).buffer.toString('utf8'))
  expect(current.workspace).toBe('personal')
  expect(current.transactions).toEqual([])
})
