import { Buffer } from 'node:buffer'
import { test, expect } from './support/workspace'

test('desktop controls, row actions, settings stacks and report baselines stay aligned in both themes', async ({page}) => {
  await page.clock.setFixedTime('2026-10-16T16:00:00Z')
  await page.setViewportSize({width:1920,height:1080})
  for (const theme of ['light','dark']) {
    await page.goto('/#/settings')
    await page.getByLabel('Theme',{exact:true}).selectOption(theme)
    await page.goto('/#/')
    await page.evaluate(()=>document.fonts.ready)
    const controls = await page.locator('.page-tools').evaluate(node => [...node.children].map(n=>{const r=n.getBoundingClientRect();return {center:r.y+r.height/2,x:r.x,right:r.right}}))
    expect(controls).toHaveLength(2)
    expect(Math.abs(controls[0].center-controls[1].center)).toBeLessThan(1)
    expect(controls[1].x-controls[0].right).toBeLessThanOrEqual(20)
    await page.goto('/#/plan')
    const edits = await page.getByRole('button',{name:/^Edit Fictional/}).evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().x))
    expect(edits.length).toBeGreaterThan(5)
    expect(Math.max(...edits)-Math.min(...edits)).toBeLessThan(1)
    await page.goto('/#/settings')
    const panel = (name:string) => page.locator('section.panel').filter({has:page.getByRole('heading',{name,exact:true})})
    const appearance = (await panel('Interface').boundingBox())!, storage = (await panel('Data location').boundingBox())!, backup = (await panel('Backup & restore').boundingBox())!
    expect(storage.x).toBeCloseTo(appearance.x,1)
    expect(storage.y-appearance.y-appearance.height).toBeGreaterThanOrEqual(12)
    expect(storage.y-appearance.y-appearance.height).toBeLessThanOrEqual(20)
    expect(backup.y).toBeCloseTo(appearance.y,1)
    await page.goto('/#/reports')
    const bars = await page.locator('.trend-bars').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{bottom:r.bottom,height:r.height}}))
    expect(bars).toHaveLength(6)
    for(const bar of bars) { expect(bar.bottom).toBeCloseTo(bars[0].bottom,1);expect(bar.height).toBeCloseTo(bars[0].height,1) }
    await page.goto('/#/debts')
    const actions = page.locator('.debt-card-actions').first()
    const pay = (await actions.getByRole('button',{name:'Record payment',exact:true}).boundingBox())!, adjust = (await actions.getByRole('button',{name:'Adjust balance',exact:true}).boundingBox())!
    expect(adjust.x-pay.x-pay.width).toBeGreaterThanOrEqual(8)
    expect(pay.y+pay.height/2).toBeCloseTo(adjust.y+adjust.height/2,1)
  }
})

test('narrow tables scroll with the keyboard without widening the page', async ({page}) => {
  await page.clock.setFixedTime('2026-10-16T16:00:00Z')
  await page.setViewportSize({width:320,height:800})
  await page.goto('/#/plan')
  const table = page.getByRole('region',{name:'Planned payments table',exact:true})
  await table.focus();await expect(table).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect.poll(()=>table.evaluate(n=>n.scrollLeft)).toBeGreaterThan(0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.getByRole('button',{name:'+ Add obligation',exact:true}).click()
  const dialog = page.getByRole('dialog',{name:'Add obligation',exact:true})
  await expect(page.getByLabel('Obligation name')).toBeFocused()
  const box = (await dialog.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320)
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible()
})

test('large ledgers page their rows, reset filters and export every matching entry', async ({page}) => {
  await page.clock.setFixedTime('2026-10-16T16:00:00Z')
  const stamp='2026-10-16T16:00:00.000Z'
  const payload = {format:'accrynt-portable',schemaVersion:5,workspace:'personal',exportedAt:stamp,months:[],obligations:[],debts:[],recurringRules:[],recurringOccurrences:[],balanceEvents:[],
    transactions:Array.from({length:120},(_,i)=>({id:`cc000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,date:'2026-10-15',name:`Synthetic entry ${String(i+1).padStart(3,'0')}`,kind:'expense',category:'Utilities',amountCents:100,account:'Synthetic checking',obligationId:null,payment:null,updatedAt:stamp}))}
  await page.goto('/#/settings')
  await page.getByLabel('Select an Accrynt backup file').setInputFiles({name:'synthetic-paged-ledger.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))})
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Replace local records with backup',exact:true}).click()
  await expect(page.getByRole('button',{name:'Replace local records with backup',exact:true})).not.toBeVisible()
  await page.goto('/#/ledger')
  const table=page.getByRole('region',{name:'Transactions table',exact:true})
  await expect(table.getByRole('row')).toHaveCount(51)
  await expect(page.getByText('1–50 of 120 matching entries',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Inspect Synthetic entry 001',exact:true}).click()
  await page.getByRole('button',{name:'Next entries',exact:true}).click()
  await expect(page.getByText('51–100 of 120 matching entries',{exact:true})).toBeVisible()
  await expect(page.getByRole('complementary',{name:'Transaction inspector'})).toContainText('Select a transaction')
  await page.getByRole('button',{name:'Next entries',exact:true}).click()
  await expect(table.getByRole('row')).toHaveCount(21)
  await expect(page.getByRole('button',{name:'Next entries',exact:true})).toBeDisabled()
  await page.getByLabel('Search transactions').fill('entry 001')
  await expect(table.getByRole('row')).toHaveCount(2)
  await expect(page.getByRole('navigation',{name:'Transaction pages',exact:true})).not.toBeVisible()
  await page.getByLabel('Search transactions').fill('')
  await expect(page.getByText('1–50 of 120 matching entries',{exact:true})).toBeVisible()
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Export CSV',exact:true}).click()
  const stream=await (await downloading).createReadStream();if(!stream)throw Error('CSV stream unavailable')
  const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk))
  const csv=Buffer.concat(chunks).toString('utf8')
  expect(csv.trim().split(/\r?\n/)).toHaveLength(121)
  expect(csv).toContain('Synthetic entry 120')
})
