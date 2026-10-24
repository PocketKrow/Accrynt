import { expect, it } from 'vitest'
import { fingerprint } from '../data/backup-health'
import { demoFixture } from '../data/demo'

// Independent original algorithm: persisted witnesses must survive this update.
async function originalFingerprint(rows: unknown[]) {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]))
    return value
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(rows))))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
it('preserves persisted witnesses for all seven tables, receipts and nested unusual JSON properties', async () => {
  for (const rows of Object.values(demoFixture('2026-10-16')).filter(Array.isArray)) expect(await fingerprint(rows)).toBe(await originalFingerprint(rows))
  const rows = [JSON.parse('{"__proto__":{"z":1,"a":2},"10":"ten","2":"two","nested":[null,{"é":"鳥","a":0}]}'), { omitted: undefined, array: [undefined, NaN], negative: -0 }]
  expect(await fingerprint(rows)).toBe(await originalFingerprint(rows))
  expect(await fingerprint([{ z: 1, a: 2 }])).toBe(await fingerprint([{ a: 2, z: 1 }]))
  expect(await fingerprint([{ a: 1 }])).not.toBe(await fingerprint([{ a: 2 }]))
})
it('does not alias distinct raw object shapes containing embedded NUL characters', async () => {
  const rows = [{ 'a\0b': 1, c: 2 }, { a: 3, 'b\0c': 4 }]
  expect(await fingerprint(rows)).toBe(await originalFingerprint(rows))
  expect(await fingerprint(rows)).not.toBe(await fingerprint([rows[0], { a: 30, 'b\0c': 4 }]))
})
