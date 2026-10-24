// Read-only post-deployment check against the operator's local, exact candidate build.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const headers = JSON.parse(await readFile(new URL('../deployment/headers.json', import.meta.url), 'utf8'))
const origin = new URL(process.argv[2] ?? '')
assert(origin.protocol === 'https:' || (origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)), 'Use HTTPS except for local validation')
assert(origin.pathname === '/' && !origin.search && !origin.hash && !origin.username && !origin.password, 'Supply only the confirmed origin, without credentials, path, query or hash')
async function get(path) {
  const response = await fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  assert.equal(response.status, 200, `${path}: expected 200 without redirects`)
  for (const [name, value] of Object.entries(headers)) assert.equal(response.headers.get(name), value, `${path}: ${name}`)
  return response
}
const html = await get('/')
assert.match(html.headers.get('content-type') ?? '', /text\/html/)
assert.equal(html.headers.get('cache-control'), 'no-cache')
const content = await html.text()
assert.equal(content, await readFile(new URL('../dist/index.html', import.meta.url), 'utf8'), 'Served HTML differs from this local candidate build')
for (const [path, mime] of [['/index.html', 'text/html'], ['/sw.js', 'javascript'], ['/manifest.webmanifest', 'application/manifest+json']]) {
  const response = await get(path)
  assert.equal(response.headers.get('cache-control'), 'no-cache', path)
  assert((response.headers.get('content-type') ?? '').includes(mime), `${path}: incorrect MIME type`)
}
const assets = [...content.matchAll(/(?:src|href)="(\/assets\/[^"<>]+\.(?:js|css))"/g)].map(match => match[1])
assert(assets.length >= 2, 'Missing built scripts/styles')
for (const path of assets) {
  const response = await get(path)
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable', path)
  assert((response.headers.get('content-type') ?? '').includes(path.endsWith('.css') ? 'text/css' : 'javascript'), `${path}: incorrect MIME type`)
  assert.equal(await response.text(), await readFile(new URL(`../dist${path}`, import.meta.url), 'utf8'), `${path}: content differs from local build`)
}
console.log(`Passed: exact local build, ${assets.length} assets, response headers, MIME types and cache controls at ${origin.origin}. Browser/offline/update/recovery checks remain separate.`)
