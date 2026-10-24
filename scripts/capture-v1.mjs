import { populateWorkspace } from './synthetic-workspace.mjs'
// Review all six routes with synthetic/empty storage; screenshots are disposable QA artifacts.
import { chromium, expect } from '@playwright/test'
import { preview } from 'vite'
import { mkdir } from 'node:fs/promises'
const dir = 'test-results/v1-visual'
await mkdir(dir, { recursive: true })
const server = await preview({ preview: { host: '127.0.0.1', port: 4188, strictPort: true } })
const browser = await chromium.launch(process.env.ACCRYNT_CHROMIUM_PATH ? { executablePath: process.env.ACCRYNT_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {})
try {
  for (const populated of [false, true]) {
    const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.clock.setFixedTime(new Date('2026-10-16T16:00:00Z'))
    const base = 'http://127.0.0.1:4188/'
    if (populated) await populateWorkspace(page, 'http://127.0.0.1:4188')
    for (const theme of ['light', 'dark']) {
      await page.goto(`${base}#/settings`)
      await page.getByLabel('Theme', { exact: true }).selectOption(theme)
      for (const width of [320, 1920]) {
        await page.setViewportSize({ width, height: width === 320 ? 850 : 1080 })
        for (const route of ['/', '/plan', '/ledger', '/debts', '/reports', '/settings']) {
          await page.goto(`${base}#${route}`)
          await expect(page.locator('h1')).toBeVisible()
          await page.evaluate(() => document.fonts.ready)
          if (route === '/settings') for (const summary of ['Privacy & moving your records', 'Check a saved backup safely']) await page.getByText(summary, { exact: true }).click()
          if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Overflow: ${populated} ${theme} ${width} ${route}`)
          await page.screenshot({ path: `${dir}/${populated ? 'populated' : 'empty'}-${theme}-${width}-${route === '/' ? 'overview' : route.slice(1)}.png` })
        }
      }
    }
    if (errors.length) throw new Error(errors.join('\n'))
    await context.close()
  }
  console.log('Captured 48 route/theme/state/width screenshots; no page errors or document overflow.')
} finally { await browser.close(); await server.httpServer.close() }
