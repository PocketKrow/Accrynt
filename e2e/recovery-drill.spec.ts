import { Buffer } from 'node:buffer'
import { test, expect, type Page } from '@playwright/test'
import { demoFixture } from '../src/data/demo'
import { financialTables } from '../src/data/backup-health'
import { downloadBackup, restoreFile } from './support/backup'

async function cash(page: Page) {
  await page.goto('/#/')
  return Promise.all(['Tracked available', 'After outstanding bills', 'Still committed'].map(async name => {
    const card = page.locator('.metric-card').filter({ has: page.locator('.metric-label').getByText(name, { exact: true }) })
    await expect(card).toBeVisible()
    return card.locator('.metric-value').innerText()
  }))
}
test('downloaded seven-table recovery drill restores identities, receipts and cash into a fresh profile', async ({ page, browser, playwright }, info) => {
  const fixture = { ...demoFixture('2026-10-16'), workspace: 'personal' }
  await page.clock.setFixedTime(new Date('2026-10-16T16:00:00Z'))
  await restoreFile(page, Buffer.from(JSON.stringify(fixture)))
  // Exercise a new real connected operation as well as existing partial receipts,
  // recurring snapshots, skipped history, statement events and future entries.
  await page.goto('/#/debts')
  await page.locator('.debt-card').first().getByRole('button', { name: 'Record payment', exact: true }).click()
  const payment = page.getByRole('dialog', { name: 'Record payment', exact: true })
  await payment.getByLabel('Payment amount (USD)').fill('30')
  await payment.getByLabel('Interest included in payment (USD)').fill('5')
  await payment.getByRole('button', { name: 'Confirm payment', exact: true }).click()
  await expect(payment).not.toBeVisible()
  const beforeCash = await cash(page), artifact = await downloadBackup(page)
  const original = JSON.parse(artifact.buffer.toString('utf8'))
  for (const name of financialTables) expect(original[name].length, name).toBeGreaterThan(0)
  expect(original.transactions.some((row: { payment: unknown }) => row.payment)).toBe(true)
  expect(original.transactions.some((row: { date: string }) => row.date > '2026-10-16')).toBe(true)

  // Chromium -> Firefox is an additional cross-engine case; other projects use
  // their own engine in a fresh context. No test depends on a user's profile.
  const crossEngine = info.project.name === 'chromium'
  // Override a local Chromium executable override inherited by the Playwright
  // fixture; this launch must always be the installed Firefox engine.
  const targetBrowser = crossEngine ? await playwright.firefox.launch({ executablePath: playwright.firefox.executablePath(), args: [], firefoxUserPrefs: { 'permissions.default.persistent-storage': 1 } }) : browser
  const target = await targetBrowser.newContext({ baseURL: info.project.use.baseURL, timezoneId: 'UTC', locale: 'en-US' })
  try {
    const fresh = await target.newPage()
    await fresh.clock.setFixedTime(new Date('2026-10-16T16:00:00Z'))
    await fresh.goto('/#/settings')
    await expect(fresh.locator('.data-counts')).toContainText('0 transactions')
    await restoreFile(fresh, artifact.buffer) // the exact downloaded bytes
    const restoredCash = await cash(fresh)
    expect(restoredCash).toEqual(beforeCash)
    const restored = JSON.parse((await downloadBackup(fresh)).buffer.toString('utf8'))
    // Only exportedAt is export metadata. Compare every financial field, including
    // stable IDs, historical links, receipt splits and recorded timestamps.
    for (const name of financialTables) expect(restored[name], name).toEqual(original[name])
    await info.attach(crossEngine ? 'chromium-to-firefox-recovery' : 'fresh-profile-recovery', {
      body: JSON.stringify({ source: info.project.name, target: targetBrowser.browserType().name(), counts: Object.fromEntries(financialTables.map(name => [name, original[name].length])), cash: restoredCash }), contentType: 'application/json'
    })
  } finally { await target.close(); if (crossEngine) await targetBrowser.close() }
})
