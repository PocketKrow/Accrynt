import { populateWorkspace } from './synthetic-workspace.mjs'
import { chromium, expect } from '@playwright/test'
import { preview } from 'vite'
import { mkdir } from 'node:fs/promises'
const out = 'docs/reliability-v08'
await mkdir(out, { recursive: true })
const server = await preview({ preview: { host: '127.0.0.1', port: 4188, strictPort: true } })
const browser = await chromium.launch(process.env.ACCRYNT_CHROMIUM_PATH ? { executablePath: process.env.ACCRYNT_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {})
const errors = []
try {
  for (const theme of ['light', 'dark']) for (const width of [320, 1920]) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 850 : 1080 }, timezoneId: 'UTC', reducedMotion: 'reduce' })
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message))
    await page.clock.setFixedTime(new Date('2026-10-16T16:00:00Z'))
    await populateWorkspace(page, 'http://127.0.0.1:4188', '2026-10-16')
    await page.goto('http://127.0.0.1:4188/#/settings')
    await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption(theme)
    const shot = async name => { await page.screenshot({ path: `${out}/${theme}-${width}-${name}.png`, fullPage: name === 'settings' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }
    await shot('settings')
    await page.goto('http://127.0.0.1:4188/#/plan')
    const bill = page.getByRole('row').filter({ hasText: 'Fictional utilities' })
    page.once('dialog', d => d.accept()); await bill.getByRole('button', { name: 'Delete Fictional utilities', exact: true }).click()
    await page.getByRole('button', { name: 'Restore Fictional utilities', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Restore skipped bill', exact: true })).toBeVisible()
    await shot('restore-bill')
    await page.getByRole('dialog', { name: 'Restore skipped bill', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Edit additional income ↗' }).click(); await page.locator('.inline-editor input').fill('125')
    await page.getByRole('button', { name: 'Next month', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Unsaved changes', exact: true })).toBeVisible()
    await shot('dirty-review')
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await context.close()
  }
  // Empty personal first-run, both themes, in a separate disposable profile.
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:4188/#/settings'); await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption(theme)
    await page.goto('http://127.0.0.1:4188/#/'); await expect(page.getByRole('region', { name: 'Get started' })).toBeVisible()
    await page.screenshot({ path: `${out}/${theme}-1920-first-run.png`, fullPage: true }); await context.close()
  }
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('14 screenshots captured; no page errors or page overflow in affected views.')
} finally { await browser.close(); await server.httpServer.close() }
