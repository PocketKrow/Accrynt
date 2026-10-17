import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { test, expect, type Page, type Download } from '@playwright/test'

const stamp = '2026-10-16T16:00:00.000Z'
const legacy = JSON.parse(readFileSync(new URL('../src/tests/fixtures/v3-original-export.json', import.meta.url), 'utf8'))
async function fixed(page: Page) { await page.clock.setFixedTime(new Date(stamp)) }
async function readDownload(download: Download) {
  const stream = await download.createReadStream()
  if (!stream) throw new Error('Download stream unavailable')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
async function restore(page: Page, payload: unknown) {
  await page.goto('/#/settings')
  await page.getByLabel('Select an Accrynt backup file').setInputFiles({ name:'synthetic-review.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(payload)) })
  await expect(page.getByText('Validated backup:', { exact:false })).toBeVisible()
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name:'Replace local records with backup', exact:true }).click()
  await expect(page.getByRole('button', { name:'Replace local records with backup', exact:true })).not.toBeVisible()
}
async function backup(page: Page) {
  await page.goto('/#/settings')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name:'Download JSON backup', exact:true }).click()
  return readDownload(await download)
}

test('failed native v3 upgrade exposes a complete read-only raw download without Settings', async ({ page }) => {
  await fixed(page)
  await page.route('**/review-seed', route => route.fulfill({ contentType:'text/html', body:'<!doctype html><title>Synthetic seed</title>' }))
  await page.goto('/review-seed')
  const poisoned = { ...legacy.debts[0], unexpectedLegacyProperty:'preserve original legacy bytes' }
  const tables = { months:legacy.months, obligations:legacy.obligations, transactions:legacy.transactions, debts:[poisoned], recurringRules:[], recurringOccurrences:[] }
  await page.evaluate(async tables => {
    await new Promise<void>((resolve,reject) => {
      const request = indexedDB.open('accrynt-local-v1',30)
      request.onupgradeneeded = () => {
        const indexes = { months:[], obligations:['month','category','paidAt','debtId'], transactions:['date','kind','category','obligationId'], debts:[], recurringRules:[], recurringOccurrences:['month','ruleId','obligationId'] }
        for (const [name,fields] of Object.entries(indexes)) {
          const store = request.result.createObjectStore(name,{ keyPath:name === 'months' ? 'key' : 'id' })
          for (const field of fields) store.createIndex(field,field)
        }
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result, transaction = database.transaction(Object.keys(tables),'readwrite')
        for (const [name,rows] of Object.entries(tables)) for (const row of rows) transaction.objectStore(name).put(row)
        transaction.oncomplete = () => { database.close(); resolve() }
        transaction.onabort = () => reject(transaction.error)
      }
    })
  }, tables)
  await page.goto('/#/')
  await expect(page.getByRole('alert').filter({ hasText:'Local storage unavailable' })).toBeVisible()
  const capture = async () => {
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name:'Download raw recovery', exact:true }).click()
    const result = await download
    expect(result.suggestedFilename()).toContain('RAW-RECOVERY-native')
    return readDownload(result)
  }
  const raw = await capture()
  expect(raw).toMatchObject({ format:'accrynt-raw-recovery',nativeVersion:30,workspace:'personal',tables })
  expect(Object.keys(raw.tables)).toHaveLength(6)
  await page.getByRole('button', { name:'Retry local storage', exact:true }).click()
  await expect(page.getByRole('button', { name:'Download raw recovery', exact:true })).toBeVisible()
  expect(await capture()).toMatchObject({ nativeVersion:30,tables })
})

test('copying prior-month bills preserves explicit zero income unless the user selects replacement', async ({ page }) => {
  await fixed(page)
  const payload = { format:'accrynt-portable',schemaVersion:5,workspace:'personal',exportedAt:stamp,
    months:[{key:'2026-09',incomeCents:80000,openingCents:null,updatedAt:stamp},{key:'2026-10',incomeCents:0,openingCents:32123,updatedAt:stamp}],
    obligations:[{id:'aa000000-0000-4000-8000-000000000001',month:'2026-09',name:'Synthetic copy bill',category:'Utilities',plannedCents:10000,dueDay:15,paidAt:stamp,debtId:null,updatedAt:stamp}],
    debts:[],transactions:[],recurringRules:[],recurringOccurrences:[],balanceEvents:[] }
  for (const replace of [false,true]) {
    await restore(page,payload)
    await page.goto('/#/plan')
    await page.getByRole('button', { name:'Copy previous month', exact:true }).click()
    const dialog = page.getByRole('dialog', { name:'Copy previous month', exact:true })
    const checkbox = dialog.getByRole('checkbox', { name:/Copy additional expected income/ })
    await expect(checkbox).not.toBeChecked()
    if (replace) await checkbox.check()
    await dialog.getByRole('button', { name:'Copy plan', exact:true }).click()
    await expect(dialog).not.toBeVisible()
    const bill = page.getByRole('row').filter({ hasText:'Synthetic copy bill' })
    await expect(bill).toContainText('Unpaid')
    const saved = await backup(page)
    expect(saved.months.find((row: {key:string}) => row.key === '2026-10')).toMatchObject({ incomeCents:replace ? 80000 : 0,openingCents:32123 })
    expect(saved.obligations.filter((row: {month:string}) => row.month === '2026-10')).toHaveLength(1)
  }
})

test('desktop disclosures retain debt context, income discovery and readable report and receipt details', async ({ page }) => {
  await fixed(page); await page.setViewportSize({width:1920,height:1080})
  await page.goto('/?demo=1#/plan')
  await page.getByRole('button', { name:/Review scheduled income/ }).click()
  await expect(page.getByRole('region', { name:'Scheduled income',exact:true })).toBeFocused()
  await page.goto('/?demo=1#/debts')
  const active = page.locator('.debt-card').filter({ has:page.getByRole('heading',{name:'Fictional vehicle loan',exact:true}) })
  await expect(active.locator('.debt-assumptions')).toContainText('Saved as of')
  await expect(active.locator('.debt-assumptions')).toContainText('Nominal monthly')
  await expect(active.locator('.accrual-estimate details')).not.toHaveAttribute('open','')
  await active.locator('.accrual-estimate summary').click()
  await expect(active.getByText('Estimated unposted interest',{exact:true})).toBeVisible()
  const paidOff = page.locator('.debt-card').filter({ hasText:'Paid off · saved balance is zero' })
  await expect(paidOff).toHaveCount(1)
  await expect(paidOff.getByText('Saved monthly payment',{exact:true})).not.toBeVisible()
  await paidOff.getByText('Historical payment terms',{exact:true}).click()
  await expect(paidOff.getByText('Saved monthly payment',{exact:true})).toBeVisible()
  await page.goto('/?demo=1#/reports')
  const partial = page.getByRole('row').filter({hasText:'2026-10'})
  await expect(partial.locator('th .cell-sub')).toHaveCSS('display','block')
  await expect(page.locator('.trend-month.is-partial .chart-period-label')).toHaveText('Partial')
  await page.goto('/?demo=1#/ledger')
  await page.getByRole('button', {name:'Inspect Synthetic partial card payment',exact:true}).click()
  const row = page.getByRole('row').filter({hasText:'Synthetic partial card payment'})
  await expect(row.getByRole('cell',{name:'Debt payment',exact:true})).toBeVisible()
  const time = page.locator('.ledger-inspector time')
  await expect(time).toBeVisible()
  expect(await time.getAttribute('title')).toBe(await time.getAttribute('datetime'))
  expect(await time.textContent()).not.toBe(await time.getAttribute('datetime'))
})

test('cross-month linked payments clarify bill status while cash stays in its transaction month', async ({ page }) => {
  await fixed(page)
  const id = 'aa000000-0000-4000-8000-000000000001'
  const payload = {format:'accrynt-portable',schemaVersion:5,workspace:'personal',exportedAt:stamp,
    months:[{key:'2026-10',incomeCents:0,openingCents:50000,updatedAt:stamp}],debts:[],recurringRules:[],recurringOccurrences:[],balanceEvents:[],
    obligations:[{id,month:'2026-10',name:'Synthetic advance bill',category:'Utilities',plannedCents:10000,dueDay:15,paidAt:null,debtId:null,updatedAt:stamp}],
    transactions:[{id:'aa000000-0000-4000-8000-000000000002',date:'2026-09-30',name:'Synthetic advance payment',kind:'expense',category:'Utilities',amountCents:10000,account:'Synthetic checking',obligationId:id,payment:null,updatedAt:stamp}] }
  await restore(page,payload); await page.goto('/#/plan')
  const bill = page.getByRole('row').filter({hasText:'Synthetic advance bill'})
  await expect(bill).toContainText('Paid')
  await expect(bill).toContainText('Includes payments dated 2026-09-30 · cash belongs to those months')
  await page.goto('/#/ledger')
  await expect(page.locator('.metric-card').filter({hasText:'Recorded outflow'})).toContainText('$0.00')
  await page.goto('/#/')
  await expect(page.getByRole('main')).toContainText('$500.00')
})
