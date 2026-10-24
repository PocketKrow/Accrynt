import { populateWorkspace } from './support/workspace'
import { test, expect } from '@playwright/test'
import headers from '../deployment/headers.json' with { type: 'json' }

test('production host contract, local-only requests and strict CSP cover all routes, themes and empty/populated states', async ({ page, request, baseURL }, info) => {
  const unexpected: string[] = [], errors: string[] = []
  const violations: Array<{ route: string; theme: string; populated: boolean; directives: string[] }> = []
  page.on('request', req => { if (new URL(req.url()).origin !== new URL(baseURL!).origin) unexpected.push(req.url()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    const state = window as typeof window & { cspViolations: string[] }
    state.cspViolations = []
    document.addEventListener('securitypolicyviolation', event => state.cspViolations.push(event.effectiveDirective))
  })
  await page.clock.setFixedTime(new Date('2026-10-16T16:00:00Z'))
  for (const populated of [false, true]) {
    if (populated) await populateWorkspace(page)
    for (const theme of ['light', 'dark']) {
      await page.goto('/#/settings')
      await page.getByLabel('Theme', { exact: true }).selectOption(theme)
      for (const route of ['/', '/plan', '/ledger', '/debts', '/reports', '/settings']) {
        await page.goto(`/#${route}`)
        await expect(page.locator('h1')).toBeVisible()
        const directives = await page.evaluate(() => (window as typeof window & { cspViolations: string[] }).cspViolations)
        if (directives.length) violations.push({ route, theme, populated, directives })
      }
    }
  }
  const response = await request.get('/')
  for (const [name, value] of Object.entries(headers)) expect(response.headers()[name.toLowerCase()]).toBe(value)
  expect(response.headers()['cache-control']).toBe('no-cache')
  for (const path of ['/sw.js', '/manifest.webmanifest']) expect((await request.get(path)).headers()['cache-control']).toBe('no-cache')
  const script = await page.locator('script[type=module]').getAttribute('src')
  expect((await request.get(script!)).headers()['cache-control']).toBe('public, max-age=31536000, immutable')
  expect(unexpected).toEqual([]); expect(errors).toEqual([])
  // A deliberate negative control proves enforcement, rather than just presence.
  await page.evaluate(() => { (window as typeof window & { cspViolations: string[] }).cspViolations = [] })
  await page.evaluate(() => { const script = document.createElement('script'); script.textContent = 'window.syntheticInlineRan = true'; document.body.append(script) })
  expect(await page.evaluate(() => (window as typeof window & { syntheticInlineRan?: boolean }).syntheticInlineRan)).toBeUndefined()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { cspViolations: string[] }).cspViolations.some(directive => directive === 'script-src-elem' || directive === 'script-src'))).toBe(true)
  await info.attach('csp-route-violations', { body: JSON.stringify(violations), contentType: 'application/json' })
  // Keep this strict. WebKit 27.2's native-select regression is documented in
  // QA-v1.md and must not be hidden by a broad message filter or CSP bypass.
  expect(violations).toEqual([])
})
