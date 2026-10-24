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
const small = process.argv.includes('--small'), samples = 7
const stages = { monthly: [], transaction: [] }
await page.addInitScript(() => {
  window.__longTasks = []
  new PerformanceObserver(list => window.__longTasks.push(...list.getEntries().map(e => e.duration))).observe({ type: 'longtask', buffered: true })
})
async function resetProfile() { await page.evaluate(() => { performance.clearMeasures(); window.__longTasks = [] }) }
async function captureProfile(kind) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  stages[kind].push(await page.evaluate(() => {
    const totals = {}
    for (const entry of performance.getEntriesByType('measure')) if (entry.name.startsWith('profile:')) totals[entry.name] = (totals[entry.name] ?? 0) + entry.duration
    return { totalsMs: totals, longTasksMs: window.__longTasks, heapBytes: performance.memory?.usedJSHeapSize ?? null }
  }))
}
try {
  // Freeze only Date: Playwright's clock also replaces performance entry APIs.
  await page.addInitScript(() => {
    const stamp = Date.parse('2026-10-16T16:00:00Z')
    window.Date = new Proxy(Date, {
      construct(target, args) { return Reflect.construct(target, args.length ? args : [stamp]) },
      get(target, key) { return key === 'now' ? () => stamp : Reflect.get(target, key) }
    })
  })
  await page.goto('http://127.0.0.1:4187/#/settings')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  const fixture = await page.evaluate(small => {
    const stamp = '2026-10-01T00:00:00.000Z'
    const allMonths = Array.from({ length: 72 }, (_, i) => `${2021 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`)
    const months = small ? allMonths.slice(-6) : allMonths
    const tables = {
      months: months.map(key => ({ key, openingCents: 100000, incomeCents: 100000, updatedAt: stamp })),
      obligations: Array.from({ length: small ? 60 : 3600 }, (_, i) => ({ id: crypto.randomUUID(), month: months[i % months.length], name: `Synthetic bill ${i}`, category: 'Other', plannedCents: 100, dueDay: 20, paidAt: null, debtId: null, updatedAt: stamp })),
      transactions: Array.from({ length: small ? 240 : 24000 }, (_, i) => ({ id: crypto.randomUUID(), date: `${months[i % months.length]}-01`, name: `Synthetic activity ${i}`, kind: i % 2 ? 'expense' : 'income', category: 'Other', amountCents: 100, account: '', obligationId: null, payment: null, updatedAt: stamp }))
    }
    return {format:'accrynt-portable',schemaVersion:5,workspace:'personal',exportedAt:stamp,...tables,debts:[],recurringRules:[],recurringOccurrences:[],balanceEvents:[]}
  }, small)
  await page.getByLabel('Select an Accrynt backup file').setInputFiles({name:'synthetic-six-year.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))})
  page.once('dialog',d=>d.accept())
  await page.getByRole('button',{name:'Replace local records with backup',exact:true}).click()
  await expect(page.getByRole('button',{name:'Replace local records with backup',exact:true})).not.toBeVisible({timeout:30000})
  await expect(page.locator('.backup-status')).not.toContainText('freshness unknown')

  const startup = [], saveToRender = []
  for (let i = 0; i < samples; i++) {
    let start = performance.now()
    await page.goto(`http://127.0.0.1:4187/?run=${i}#/plan`)
    await expect(page.locator('.metric-detail').filter({ hasText: `${small ? 10 : 50} obligations` })).toBeVisible()
    startup.push(Math.round(performance.now() - start))
    await page.getByRole('button', { name: 'Edit additional income ↗' }).click()
    await page.locator('.inline-editor input').fill(String(2000 + i))
    await resetProfile()
    start = performance.now()
    await page.locator('.inline-editor').getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.inline-editor')).not.toBeVisible()
    await expect(page.locator('.metric-card').filter({ hasText: 'Expected income' })).toContainText(`$2,00${i}.00`)
    saveToRender.push(Math.round(performance.now() - start))
    await captureProfile('monthly')
  }
  const transactionSaveMs = []
  await page.goto('http://127.0.0.1:4187/#/ledger')
  for (let i=0;i<samples;i++) {
    await page.getByRole('button',{name:'+ Record transaction',exact:true}).click()
    const dialog=page.getByRole('dialog',{name:'Transaction',exact:true})
    await dialog.getByLabel('Description',{exact:true}).fill(`Synthetic timing entry ${i}`)
    await dialog.getByLabel('Amount (USD)',{exact:true}).fill('1')
    await resetProfile()
    const start=performance.now()
    await dialog.getByRole('button',{name:'Save transaction',exact:true}).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('button',{name:`Inspect Synthetic timing entry ${i}`,exact:true})).toBeVisible()
    transactionSaveMs.push(Math.round(performance.now()-start))
    await captureProfile('transaction')
  }
  console.log(JSON.stringify({ synthetic: { months: fixture.months.length, obligations: fixture.obligations.length, transactions: fixture.transactions.length }, viewport: '1920×1080', browser: await browser.version(), startupMs: startup, saveToRenderMs: saveToRender, transactionSaveMs, stages }, null, 2))
} finally { await context.close(); await browser.close(); await server.httpServer.close() }
