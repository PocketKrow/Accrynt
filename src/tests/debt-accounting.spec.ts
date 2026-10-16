import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dexie from 'dexie'
import { readFileSync } from 'node:fs'
import { AccryntDatabase, db, readWorkspace, clearWorkspace } from '../data/database'
import { exportBackup, restoreBackup, validateBackup } from '../data/backup'
import { localRepository as repo } from '../data/repository'
import { accruedEstimate, monthlyInterest, parseAnnualRate, projectDebt } from '../domain/debt'
import { newId, now, localDate, type Debt } from '../domain/models'
const original = JSON.parse(readFileSync(new URL('./fixtures/v3-original-export.json', import.meta.url),'utf8'))
const debt = (fields: Partial<Debt> = {}):Debt => ({ id:newId(),name:'Synthetic precise loan', balanceCents:100000,startingBalanceCents:150000,minimumCents:10000,monthlyPaymentCents:10000,
  aprMilliPercent:18000,balanceAsOf:'2026-01-01',interestMethod:'monthly',updatedAt:now(),...fields })
beforeEach(async()=>{await db.open();await clearWorkspace()})
afterEach(async()=>{vi.restoreAllMocks();await clearWorkspace();db.close()})
async function post(d:Debt, fields:Partial<Parameters<typeof repo.adjustDebt>[0]> = {}) {
 return repo.adjustDebt({id:newId(),debtId:d.id,expectedUpdatedAt:d.updatedAt,kind:'fee',date:localDate(),amountCents:2500,note:'Synthetic adjustment',...fields})
}

describe('exact rates and date-aware estimates',()=>{
 it('preserves 6.125% and independently calculated payoff without rounding the APR',()=>{
  expect(parseAnnualRate('6.125')).toBe(6125)
  expect(monthlyInterest(847500,6125)).toBe(4326)
  expect(projectDebt(debt({balanceCents:847500,aprMilliPercent:6125,monthlyPaymentCents:31000}))).toMatchObject({months:30,totalInterestCents:67628,finalPaymentCents:16128})
 })
 it('distinguishes monthly, daily365 and daily360, leap dates and unknown rates',()=>{
  const d=debt({balanceAsOf:'2026-01-01'})
  expect(accruedEstimate(d,'2026-01-31')?.interestCents).toBe(0)
  expect(accruedEstimate(d,'2026-02-01')?.interestCents).toBe(1500)
  expect(accruedEstimate({...d,interestMethod:'daily-365'},'2026-01-31')?.interestCents).toBe(1479)
  expect(accruedEstimate({...d,interestMethod:'daily-360'},'2026-01-31')?.interestCents).toBe(1500)
  expect(accruedEstimate({...d,balanceAsOf:'2024-02-28',interestMethod:'daily-365'},'2024-03-01')?.days).toBe(2)
  expect(accruedEstimate({...d,balanceAsOf:'2026-01-31'},'2026-02-28')?.periods).toBe(1)
  expect(accruedEstimate({...d,balanceAsOf:'2026-01-31'},'2026-04-30')?.interestCents).toBe(4500)
  expect(accruedEstimate({...d,aprMilliPercent:null},'2026-01-31')).toBeNull()
  expect(accruedEstimate({...d,aprMilliPercent:0},'2026-04-30')?.interestCents).toBe(0)
  expect(()=>accruedEstimate(d,'2025-12-31')).toThrow()
  expect(()=>accruedEstimate(d,'2026-02-30')).toThrow()
 })
 it('is pure across repeated estimate calculations and old-rate results remain exact',async()=>{
  const d=debt();await db.debts.add(d);const before=await readWorkspace()
  for(let i=0;i<5;i++){accruedEstimate(d,'2026-10-16');projectDebt(d,true)}
  expect(await readWorkspace()).toEqual(before)
  for(const [b,r,expected] of [[100000,1200,1000],[5,12000,1],[99999999999,100000,83333333333]]) expect(monthlyInterest(b,r*10)).toBe(expected)
 })
})

describe('ordered, reversible, atomic balance events',()=>{
 it('posts a monthly estimate exactly once, retains reversal history and guards duplicate periods',async()=>{
  let d=debt();await db.debts.add(d)
  const period=localDate().slice(0,7),id=`interest:${d.id}:${period}`
  const input={id,kind:'interest' as const,date:localDate(),amountCents:1500,period}
  const [a,b]=await Promise.all([post(d,input),post(d,input)])
  expect(a.id).toBe(b.id);expect(await db.balanceEvents.count()).toBe(1)
  expect((await db.debts.get(d.id))?.balanceCents).toBe(101500)
  await repo.undoAdjustment(id)
  d=(await db.debts.get(d.id))!;expect(d.balanceCents).toBe(100000);expect(d.balanceAsOf).toBe('2026-01-01')
  expect((await db.balanceEvents.get(id))?.reversedAt).not.toBeNull()
  await expect(post(d,input)).rejects.toThrow('already used')
 })
 it('blocks earlier payment undo across a statement event, then safely restores reference dates',async()=>{
  const d=debt();await db.debts.add(d)
  const payment=await repo.recordPayment({id:newId(),date:localDate(),name:'Synthetic payment',amountCents:10000,interestCents:1500,account:'',debtId:d.id,obligationId:null,expectedDebtUpdatedAt:d.updatedAt})
  const after=(await db.debts.get(d.id))!,event=await post(after,{kind:'statement',amountCents:93000})
  await expect(repo.undoPayment(payment.id,payment.updatedAt)).rejects.toThrow('changed')
  await repo.undoAdjustment(event.id);await repo.undoPayment(payment.id,payment.updatedAt)
  expect(await db.debts.get(d.id)).toMatchObject({balanceCents:100000,balanceAsOf:'2026-01-01'})
  expect(await db.transactions.count()).toBe(0)
 })
 it('cannot bypass ordering when a later charge and refund return to the same balance',async()=>{
  const d=debt();await db.debts.add(d)
  const a=await post(d), afterA=(await db.debts.get(d.id))!
  const b=await post(afterA,{amountCents:100}),afterB=(await db.debts.get(d.id))!
  const c=await post(afterB,{kind:'refund',amountCents:-100})
  await expect(repo.undoAdjustment(a.id)).rejects.toThrow('latest')
  await repo.undoAdjustment(c.id);await repo.undoAdjustment(b.id);await repo.undoAdjustment(a.id)
  expect((await db.debts.get(d.id))?.balanceCents).toBe(100000)
 })
 it('records direct statement edits as events and rejects stale or failed writes atomically',async()=>{
  const d=debt();await db.debts.add(d)
  await repo.saveDebt({...d,balanceCents:101000},d.id,d.updatedAt)
  expect(await db.balanceEvents.count()).toBe(1)
  await expect(post(d)).rejects.toThrow('changed')
  const current=(await db.debts.get(d.id))!,before=await readWorkspace()
  vi.spyOn(db.debts,'update').mockRejectedValueOnce(new Error('Synthetic storage failure'))
  await expect(post(current)).rejects.toThrow('storage failure');expect(await readWorkspace()).toEqual(before)
 })
 it('refuses a second full interest month after an interest-bearing payment and disallows future/backdated changes',async()=>{
  const d=debt();await db.debts.add(d)
  await repo.recordPayment({id:newId(),date:localDate(),name:'Synthetic payment',amountCents:10000,interestCents:1500,account:'',debtId:d.id,obligationId:null,expectedDebtUpdatedAt:d.updatedAt})
  const current=(await db.debts.get(d.id))!,period=localDate().slice(0,7)
  await expect(post(current,{id:`interest:${d.id}:${period}`,kind:'interest',period,amountCents:1373})).rejects.toThrow('already recorded')
  await expect(post(current,{date:'2099-01-01'})).rejects.toThrow('future')
  await expect(post(current,{date:'2025-01-01'})).rejects.toThrow('reference')
 })
 it('retains events and receipt identity for deleted debts and rejects corrupt backup arithmetic before replacement',async()=>{
  const d=debt();await db.debts.add(d);await post(d)
  const backup=await exportBackup(),before=await readWorkspace()
  await expect(restoreBackup({...backup,balanceEvents:[{...backup.balanceEvents[0],deltaCents:0}]})).rejects.toThrow()
  expect(await readWorkspace()).toEqual(before)
  await repo.deleteDebt(d.id)
  expect(validateBackup(await exportBackup()).balanceEvents).toHaveLength(1)
 })
})

describe('authentic legacy migration and portable compatibility',()=>{
 it('imports original v3 export without changing any balances, IDs or interest splits; v4 roundtrips',async()=>{
  await restoreBackup(original)
  const modern=await exportBackup()
  expect(modern.schemaVersion).toBe(4)
  expect(modern.debts[0]).toMatchObject({balanceCents:91000,aprMilliPercent:12000,balanceAsOf:null,interestMethod:'monthly'})
  expect(modern.debts[0]).not.toHaveProperty('aprBasisPoints')
  expect(modern.transactions[0].payment).toMatchObject(original.transactions[0].payment)
  await clearWorkspace();await restoreBackup(modern)
  expect(await exportBackup()).toMatchObject({...modern,exportedAt:expect.any(String)})
 })
 it('upgrades a native v3 database containing the original export exactly once',async()=>{
  const name=`accrynt-v3-fixture-${newId()}`,old=new Dexie(name),upgraded=new AccryntDatabase(name)
  old.version(3).stores({months:'key',obligations:'id,month,category,paidAt,debtId',transactions:'id,date,kind,category,obligationId',debts:'id',recurringRules:'id',recurringOccurrences:'id,month,ruleId,obligationId'})
  try{
   await old.open();for(const table of old.tables) await table.bulkAdd(original[table.name]);old.close()
   await upgraded.open();const first=await upgraded.debts.toArray()
   expect(first[0]).toMatchObject({balanceCents:91000,aprMilliPercent:12000,balanceAsOf:null})
   expect(await upgraded.obligations.toArray()).toEqual(original.obligations)
   expect((await upgraded.transactions.toArray())[0].payment).toMatchObject(original.transactions[0].payment)
   upgraded.close();await upgraded.open();expect(await upgraded.debts.toArray()).toEqual(first)
  }finally{old.close();await upgraded.delete()}
 })
})
