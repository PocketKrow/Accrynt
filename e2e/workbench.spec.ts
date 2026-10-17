import { test, expect } from '@playwright/test'
test('responsive demo workbench uses the viewport at 320 through 3840 and captures all routes in both themes', async ({ page }, info) => {
  test.setTimeout(120000)
  await page.clock.setFixedTime(new Date('2026-10-16T16:00:00Z'))
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
  await page.clock.setFixedTime(new Date('2026-10-16T16:00:00Z'))
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
  const report=page.waitForEvent('download');await page.getByRole('button',{name:'Export report CSV',exact:true}).click();expect((await report).suggestedFilename()).toContain('DEMO-SYNTHETIC-Accrynt-report-2026-10.csv')
})
test('populated layout supports 200% CSS zoom and the February scenario opens February with month-end dates', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T16:00:00Z'))
  await page.setViewportSize({ width:1280,height:1000 }); await page.goto('/?demo=1#/plan')
  await expect(page.locator('h1')).toBeVisible()
  await page.evaluate(()=>{document.body.style.zoom='2'})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.evaluate(()=>{document.body.style.zoom='1'})
  await page.getByRole('combobox',{name:'Scenario'}).selectOption('february')
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Reset demo',exact:true}).click()
  await expect(page.locator('.top-month')).toHaveText('February 2026')
  await expect(page.getByRole('row').filter({hasText:'Fictional transit'})).toContainText('2026-02-28')
})
