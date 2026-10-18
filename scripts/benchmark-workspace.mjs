import { Buffer } from 'node:buffer'
// Synthetic browser measurement, using a disposable profile and local production preview.
import { chromium, expect } from '@playwright/test'
import { preview } from 'vite'
import { performance } from 'node:perf_hooks'
const server = await preview({ preview: { host: '127.0.0.1', port: 4187, strictPort: true } })
const browser = await chromium.launch(process.env.ACCRYNT_CHROMIUM_PATH ? {
  executablePath: process.env.ACCRYNT_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage']
} : {})
const context = await browser.newContext({ timezoneId: 'UTC', locale: 'en-US', viewport: { width: 1920, height: 1080 } })
const page = await context.newPage()
try {
  await page.clock.setFixedTime(new Date('2026-10-16T16:00:00Z'))
  await page.goto('http://127.0.0.1:4187/#/settings')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  const fixture = await page.evaluate(() => {
    const stamp = '2026-10-01T00:00:00.000Z'
    const months = Array.from({ length: 72 }, (_, i) => `${2021 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`)
    const tables = {
      months: months.map(key => ({ key, openingCents: 100000, incomeCents: 100000, updatedAt: stamp })),
      obligations: Array.from({ length: 3600 }, (_, i) => ({ id: crypto.randomUUID(), month: months[i % 72], name: `Synthetic bill ${i}`, category: 'Other', plannedCents: 100, dueDay: 20, paidAt: null, debtId: null, updatedAt: stamp })),
      transactions: Array.from({ length: 24000 }, (_, i) => ({ id: crypto.randomUUID(), date: `${months[i % 72]}-01`, name: `Synthetic activity ${i}`, kind: i % 2 ? 'expense' : 'income', category: 'Other', amountCents: 100, account: '', obligationId: null, payment: null, updatedAt: stamp }))
    }
    return {format:'accrynt-portable',schemaVersion:5,workspace:'personal',exportedAt:stamp,...tables,debts:[],recurringRules:[],recurringOccurrences:[],balanceEvents:[]}
  })
  await page.getByLabel('Select an Accrynt backup file').setInputFiles({name:'synthetic-six-year.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))})
  page.once('dialog',d=>d.accept())
  await page.getByRole('button',{name:'Replace local records with backup',exact:true}).click()
  await expect(page.getByRole('button',{name:'Replace local records with backup',exact:true})).not.toBeVisible({timeout:30000})
  await expect(page.locator('.backup-status')).not.toContainText('freshness unknown')

  const startup = [], saveToRender = []
  for (let i = 0; i < 5; i++) {
    let start = performance.now()
    await page.goto(`http://127.0.0.1:4187/?run=${i}#/plan`)
    await expect(page.locator('.metric-detail').filter({ hasText: '50 obligations' })).toBeVisible()
    startup.push(Math.round(performance.now() - start))
    await page.getByRole('button', { name: 'Edit additional income ↗' }).click()
    await page.locator('.inline-editor input').fill(String(2000 + i))
    start = performance.now()
    await page.locator('.inline-editor').getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.inline-editor')).not.toBeVisible()
    await expect(page.locator('.metric-card').filter({ hasText: 'Expected income' })).toContainText(`$2,00${i}.00`)
    saveToRender.push(Math.round(performance.now() - start))
  }
  const transactionSaveMs = []
  await page.goto('http://127.0.0.1:4187/#/ledger')
  for (let i=0;i<3;i++) {
    await page.getByRole('button',{name:'+ Record transaction',exact:true}).click()
    const dialog=page.getByRole('dialog',{name:'Transaction',exact:true})
    await dialog.getByLabel('Description',{exact:true}).fill(`Synthetic timing entry ${i}`)
    await dialog.getByLabel('Amount (USD)',{exact:true}).fill('1')
    const start=performance.now()
    await dialog.getByRole('button',{name:'Save transaction',exact:true}).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('button',{name:`Inspect Synthetic timing entry ${i}`,exact:true})).toBeVisible()
    transactionSaveMs.push(Math.round(performance.now()-start))
  }
  console.log(JSON.stringify({ synthetic: { months: 72, obligations: 3600, transactions: 24000 }, viewport: '1920×1080', browser: await browser.version(), startupMs: startup, saveToRenderMs: saveToRender, transactionSaveMs }, null, 2))
} finally { await context.close(); await browser.close(); await server.httpServer.close() }
