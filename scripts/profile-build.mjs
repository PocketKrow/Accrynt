// Disposable instrumentation of a production build. Source files are never rewritten.
// Rebuild normally before correctness testing or delivery: npm run build.
import { build } from 'vite'

function replace(code, from, to) {
  if (!code.includes(from)) throw new Error(`Profiling hook no longer matches: ${from}`)
  return code.replace(from, to)
}
await build({ plugins: [{ name: 'accrynt-profile', enforce: 'pre', transform(source, id) {
  let code = source
  if (id.endsWith('/src/data/backup-health.ts')) {
    code = replace(code, 'return down.transaction(mode', 'const transactionStart = performance.now(); const profileTransaction = down.transaction(mode')
    code = replace(code, ': stores, mode, options)\n    },', ": stores, mode, options)\n      if (mode === 'readwrite') profileTransaction.addEventListener('complete', () => performance.measure('profile:write-transaction', {start: transactionStart})); return profileTransaction\n    },")
    const read = 'const readRows = async () => (await table.query({ trans: request.trans, values: true, query: { index: table.schema.primaryKey, range: { type: 3, lower: undefined, upper: undefined } } })).result'
    code = replace(code, read, "const readRows = async () => { const start = performance.now(); const rows = (await table.query({ trans: request.trans, values: true, query: { index: table.schema.primaryKey, range: { type: 3, lower: undefined, upper: undefined } } })).result; performance.measure('profile:mutation-table-reads', {start}); return rows }")
    code = replace(code, 'const before = await readRows()', "const readStart = performance.now(); const before = await readRows(); performance.measure('profile:mutation-read-before', { start: readStart })")
    code = replace(code, 'const result = await table.mutate(request)', "const writeStart = performance.now(); const result = await table.mutate(request); performance.measure('profile:mutation-write', { start: writeStart })")
    code = replace(code, "const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(rows))))", "const start = performance.now(); const bytes = new TextEncoder().encode(JSON.stringify(canonical(rows))); performance.measure('profile:canonical-encode', {start}); const hashStart = performance.now(); const digest = await crypto.subtle.digest('SHA-256', bytes); performance.measure('profile:sha256', {start: hashStart})")
  }
  if (id.endsWith('/src/data/database.ts')) {
    code = replace(code, "export function readWorkspace() {\n  return", "export function readWorkspace() {\n  const start = performance.now(); return")
    code = replace(code, '\n  }))\n}', "\n  })).then(data => { performance.measure('profile:snapshot-refresh', {start}); return data })\n}")
  }
  if (id.endsWith('/src/stores/finance.ts')) {
    code = replace(code, 'next(payload) {', 'next(payload) { const renderStart = performance.now()')
    code = replace(code, "loaded.value = true\n        void generateMonth()", "loaded.value = true\n        requestAnimationFrame(() => requestAnimationFrame(() => performance.measure('profile:snapshot-to-frame', {start: renderStart})))\n        void generateMonth()")
    for (const name of ['buildObligationPayments', 'monthlySummary', 'availableMoney']) {
      // These store selectors have one expression each. Preserve dependency tracking.
      const pattern = new RegExp(`computed\\(\\(\\) => (${name}\\([^\\n]+)\\)`)
      if (!pattern.test(code)) throw new Error(`Missing selector hook: ${name}`)
      code = code.replace(pattern, `computed(() => { const start = performance.now(); const result = $1; performance.measure('profile:${name}', {start}); return result })`)
    }
  }
  return code === source ? null : { code, map: null }
} }] })
