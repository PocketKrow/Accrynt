import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
async function fixed(page: Page) { await page.clock.install({ time: new Date('2026-10-16T16:00:00Z') }) }
async function addIncome(page: Page) {
  await page.getByText('Recurring bills & income · 0 active', { exact: true }).click()
  await page.getByRole('button', { name: '+ Add recurring item' }).click()
  const dialog = page.getByRole('dialog', { name: 'Recurring item', exact: true })
  await dialog.getByLabel('Name', { exact: true }).fill('Synthetic linked payroll')
  await dialog.getByLabel('Recurring type').selectOption('income')
  await dialog.getByLabel('Recurring amount (USD)').fill('500')
  await dialog.getByRole('button', { name: 'Save recurring item' }).click()
  await expect(dialog).not.toBeVisible()
}
test('explicit partial receipts preserve plan income, support future edits/unlinking, and persist across reload', async ({ page }) => {
  await fixed(page); await page.goto('/#/plan'); await addIncome(page)
  const scheduled = page.locator('.expected-income-panel .scheduled-row')
  const expected = page.locator('.metric-card').filter({ hasText: 'Expected income' })
  const transaction = page.getByRole('dialog', { name: 'Transaction', exact: true })
  for (const [name, amount] of [['Synthetic deposit one','200'],['Synthetic deposit two','300']]) {
    await scheduled.getByRole('button', { name: 'Record receipt', exact: true }).click()
    await expect(transaction.getByLabel('Scheduled income link (optional)')).not.toHaveValue('')
    await transaction.getByLabel('Description', { exact: true }).fill(name)
    await transaction.getByLabel('Amount (USD)', { exact: true }).fill(amount)
    await transaction.getByRole('button', { name: 'Save transaction' }).click()
    await expect(transaction).not.toBeVisible()
  }
  await expect(scheduled).toContainText('$500.00 received'); await expect(expected).toContainText('$500.00')
  await expect(scheduled.getByRole('button', { name: 'Record extra receipt' })).toBeVisible()
  await scheduled.getByRole('button', { name: 'Skip this month' }).click()
  await expect(expected).toContainText('$0.00'); await expect(scheduled).toContainText('$500.00 received')
  await scheduled.getByRole('button', { name: 'Restore this month' }).click()
  await page.goto('/#/ledger')
  await page.getByRole('button', { name: 'Edit Synthetic deposit one', exact: true }).click()
  await transaction.getByLabel('Date', { exact: true }).fill('2026-10-20')
  await transaction.getByRole('button', { name: 'Save transaction' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Synthetic deposit one' })).toContainText('Scheduled · excluded from actuals')
  await page.goto('/#/plan'); await expect(scheduled).toContainText('$300.00 received'); await expect(scheduled).toContainText('$200.00 scheduled')
  await expect(expected).toContainText('$500.00'); await page.reload(); await expect(scheduled).toContainText('$300.00 received')
  await page.goto('/#/ledger'); await page.getByRole('button', { name: 'Edit Synthetic deposit two', exact: true }).click()
  await transaction.getByLabel('Scheduled income link (optional)').selectOption('')
  await transaction.getByRole('button', { name: 'Save transaction' }).click()
  await page.goto('/#/plan'); await expect(scheduled).toContainText('$0.00 received'); await expect(expected).toContainText('$500.00')
})
test('recurrence failure leaves live writes working, warns about incomplete totals and retries explicitly', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.add
    ;(window as unknown as { failRecurrence: boolean; failedAttempts: number }).failRecurrence = true
    ;(window as unknown as { failedAttempts: number }).failedAttempts = 0
    IDBObjectStore.prototype.add = function(...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'recurringOccurrences' && (window as unknown as { failRecurrence: boolean }).failRecurrence) {
        ;(window as unknown as { failedAttempts: number }).failedAttempts++
        throw new DOMException('Synthetic recurrence failure', 'QuotaExceededError')
      }
      return original.apply(this,args)
    }
  })
  await fixed(page); await page.goto('/#/plan'); await addIncome(page)
  await expect(page.getByRole('alert').filter({ hasText: 'Monthly plan may be incomplete' })).toBeVisible()
  await page.goto('/#/ledger'); await page.getByRole('button', { name: '+ Record transaction', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Transaction', exact: true })
  await dialog.getByLabel('Description', { exact: true }).fill('Synthetic live write')
  await dialog.getByLabel('Amount (USD)', { exact: true }).fill('25')
  await dialog.getByRole('button', { name: 'Save transaction' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Synthetic live write' })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { failedAttempts: number }).failedAttempts)).toBe(1)
  await page.evaluate(() => { (window as unknown as { failRecurrence: boolean }).failRecurrence = false })
  await page.getByRole('button', { name: 'Retry recurring items' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Monthly plan may be incomplete' })).not.toBeVisible()
  await page.goto('/#/plan'); await expect(page.locator('.expected-income-panel')).toContainText('Synthetic linked payroll')
})
test('damaged current state yields labelled raw recovery before confirmed repair', async ({ page }, info) => {
  await fixed(page); await page.goto('/#/settings'); await expect(page.locator('h1')).toBeVisible()
  await page.evaluate(async () => {
    await new Promise<void>((resolve,reject) => {
      const request = indexedDB.open('accrynt-local-v1')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result, tx = database.transaction('months','readwrite')
        tx.objectStore('months').put({ key:'2026-10',incomeCents:-1,openingCents:null,updatedAt:'2026-10-16T00:00:00.000Z' })
        tx.oncomplete = () => { database.close(); resolve() }; tx.onerror = () => reject(tx.error)
      }
    })
  })
  await page.reload(); await page.getByRole('button', { name: 'Download JSON backup', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  const empty = { format:'accrynt-portable',schemaVersion:5,workspace:'personal',exportedAt:'2026-10-16T16:00:00.000Z',months:[],obligations:[],transactions:[],debts:[],recurringRules:[],recurringOccurrences:[],balanceEvents:[] }
  await page.getByLabel('Select an Accrynt backup file').setInputFiles({ name:'repair.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(empty)) })
  const confirmations: string[] = []
  page.on('dialog', async d => { confirmations.push(d.message()); await d.accept() })
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name:'Replace local records with backup' }).click()
  const download = await downloading, path = info.outputPath('raw-recovery.json')
  await download.saveAs(path)
  expect(download.suggestedFilename()).toContain('RAW-RECOVERY')
  expect(JSON.parse(readFileSync(path,'utf8'))).toMatchObject({ format:'accrynt-raw-recovery',months:[{incomeCents:-1}] })
  expect(confirmations).toHaveLength(2)
  await expect(page.getByRole('button', { name:'Load selected-month example' })).toBeVisible()
})
test('overflow scope, aligned report tracks and local fonts remain usable offline', async ({ page }) => {
  await fixed(page); await page.goto('/?demo=1#/')
  await expect(page.getByText('Showing 6 of 7 outstanding', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name:'Other months · upcoming saved obligations' })).toBeVisible()
  await page.goto('/?demo=1#/reports')
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => [...document.fonts].some(f=>f.family === 'Inter' && f.status === 'loaded'))).toBe(true)
  const positions = await page.locator('.category-breakdown .small-meter').evaluateAll(nodes => nodes.map(n=>({x:n.getBoundingClientRect().x,width:n.getBoundingClientRect().width})))
  expect(positions.length).toBeGreaterThan(1)
  for(const position of positions) { expect(position.x).toBeCloseTo(positions[0].x,1); expect(position.width).toBeCloseTo(positions[0].width,1) }
  await expect(page.getByRole('row').filter({hasText:'2026-10'})).toContainText('Partial · through 2026-10-16')
  await page.evaluate(async()=>{await navigator.serviceWorker.ready}); await page.reload()
  await page.context().setOffline(true); await page.reload()
  await expect(page.locator('h1')).toHaveText('Reports')
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(()=>document.fonts.check('400 14px Inter'))).toBe(true)
  expect(await page.evaluate(()=>document.fonts.check('400 14px "JetBrains Mono"'))).toBe(true)
})
test('prior-month posted interest is suggested once and the retained-date editor warning is visible', async ({ page }) => {
  await fixed(page); await page.goto('/?demo=1#/debts')
  const card = page.locator('.debt-card').filter({has:page.getByRole('heading',{name:'Fictional personal loan',exact:true})})
  await card.getByRole('button',{name:'Edit ↗'}).click()
  const editor = page.getByRole('dialog',{name:'Debt',exact:true})
  await editor.getByLabel('Current balance (USD)').fill('4000')
  await expect(editor.getByText('The balance changed while its reference date stays', {exact:false})).toBeVisible()
  await editor.getByLabel('Balance as of date (optional)').fill('2026-09-01')
  await editor.getByRole('button',{name:'Save debt'}).click()
  await card.getByRole('button',{name:'Adjust balance',exact:true}).click()
  const adjustment = page.getByRole('dialog',{name:'Adjust debt balance'})
  await adjustment.getByLabel('Adjustment type').selectOption('interest')
  await adjustment.getByLabel('Effective date').fill('2026-09-30')
  await adjustment.getByLabel('Audit note').fill('Synthetic prior-cycle interest')
  await adjustment.getByRole('button',{name:'Confirm balance adjustment'}).click()
  await expect(adjustment).not.toBeVisible()
  await card.getByRole('button',{name:'Record payment',exact:true}).click()
  const payment = page.getByRole('dialog',{name:'Record payment',exact:true})
  await expect(payment.getByLabel('Interest included in payment (USD)')).toHaveValue('56.67')
  await expect(payment.getByLabel('Interest is already included')).toBeChecked()
  await expect(payment.getByLabel('Posted interest context')).toContainText('2026-09')
  await expect(payment.getByText('Balance reference date', {exact:false})).toContainText('2026-09-30 → 2026-10-16')
  await payment.getByRole('button',{name:'Confirm payment'}).click()
  await expect(payment).not.toBeVisible()
  await card.getByRole('button',{name:'Record payment',exact:true}).click()
  await expect(payment.getByLabel('Interest included in payment (USD)')).toHaveValue('0.00')
})
test('long names and large balances stay within every route at narrow and desktop widths', async ({ page }) => {
 await fixed(page); await page.goto('/#/settings')
 const id='00000000-0000-4000-8000-000000000001',stamp='2026-10-16T00:00:00.000Z',name='Synthetic long account '+ 'X'.repeat(70)
 const payload={format:'accrynt-portable',schemaVersion:5,workspace:'personal',exportedAt:stamp,
  months:[{key:'2026-10',incomeCents:99999999999,openingCents:-99999999999,updatedAt:stamp}],
  debts:[{id,name,balanceCents:99999999999,startingBalanceCents:null,minimumCents:0,monthlyPaymentCents:0,aprMilliPercent:null,balanceAsOf:null,interestMethod:'monthly',updatedAt:stamp}],
  obligations:[{id,month:'2026-10',name,plannedCents:99999999999,dueDay:31,paidAt:null,debtId:id,category:'Debt payments',updatedAt:stamp}],
  transactions:[],recurringRules:[],recurringOccurrences:[],balanceEvents:[]}
 await page.getByLabel('Select an Accrynt backup file').setInputFiles({name:'large.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))})
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Replace local records with backup'}).click()
 await expect(page.getByRole('button',{name:'Replace local records with backup'})).not.toBeVisible()
 for(const theme of ['light','dark']) {
  await page.goto('/#/settings');await page.getByLabel('Theme',{exact:true}).selectOption(theme)
  for(const width of [320,1440]) {
   await page.setViewportSize({width,height:1000})
   for(const route of ['/','/plan','/ledger','/debts','/reports','/settings']) {
    await page.goto(`/#${route}`);await expect(page.locator('h1')).toBeVisible()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme} ${width} ${route} ${await page.evaluate(()=>[...document.querySelectorAll('h2,.debt-balance,.panel-heading,.debt-card')].filter(n=>n.getBoundingClientRect().right>innerWidth).map(n=>n.className || n.tagName).join(','))}`).toBe(true)
   }
  }
 }
})
