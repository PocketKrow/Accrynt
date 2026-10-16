import { test, expect } from '@playwright/test'
test('responsive demo workbench uses the viewport at 320 through 3840 and captures all routes in both themes', async ({ page }, info) => {
  test.setTimeout(120000)
  await page.clock.install({ time: new Date('2026-10-16T16:00:00Z') })
  await page.goto('/?demo=1#/')
  await expect(page.locator('h1')).toBeVisible()
  for (const theme of ['light','dark']) {
    await page.goto('/?demo=1#/settings'); await page.getByLabel('Theme', { exact: true }).selectOption(theme)
    for (const width of [320,768,1280,1440,1920,2560,3840]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const route of ['/', '/plan', '/ledger', '/debts', '/reports', '/settings']) {
        await page.goto(`/?demo=1#${route}`); await expect(page.locator('h1')).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${theme} ${width} ${route}`).toBe(true)
        if (width === 320 || width === 1440) {
          const path = info.outputPath(`${theme}-${width}-${route === '/' ? 'overview' : route.slice(1)}.png`)
          await page.screenshot({ path, fullPage: true }); await info.attach(`${theme} ${width} ${route}`, { path, contentType:'image/png' })
        }
      }
      if (width >= 1440) {
        const rail = await page.locator('.right-rail').boundingBox(), main = await page.locator('main').boundingBox()
        expect(rail!.x).toBeGreaterThan(main!.x + main!.width - 1)
      }
      if (width >= 1920) {
        await page.goto('/?demo=1#/debts'); const cards = page.locator('.debt-card')
        await expect(cards).toHaveCount(6)
        expect((await cards.nth(0).boundingBox())!.y).toBe((await cards.nth(2).boundingBox())!.y)
      }
    }
  }
})
test('ledger inspector, all-time search, safe CSV and unknown history are functional', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-16T16:00:00Z') })
  await page.goto('/?demo=1#/ledger')
  await page.getByLabel('Ledger period').selectOption('all')
  await page.getByLabel('Search transactions').fill('Synthetic partial card payment')
  await page.getByRole('button', { name:'Inspect Synthetic partial card payment', exact:true }).click()
  const inspector = page.getByRole('complementary', { name:'Transaction inspector' })
  await expect(inspector).toContainText('Confirmed payment split'); await expect(inspector).toContainText('$25.00')
  await inspector.focus(); await page.keyboard.press('Escape')
  await expect(inspector).toContainText('Select a transaction')
  const download = page.waitForEvent('download'); await page.getByRole('button', {name:'Export CSV'}).click()
  expect((await download).suggestedFilename()).toContain('DEMO-SYNTHETIC-Accrynt-ledger-all-time.csv')
  await page.goto('/?demo=1#/reports'); await page.getByLabel('History', { exact:true }).selectOption('12')
  await expect(page.getByRole('row').filter({hasText:'2025-11'})).toContainText('No records')
  await expect(page.getByRole('row').filter({hasText:'2026-10'})).toContainText('$1,650.00')
})
