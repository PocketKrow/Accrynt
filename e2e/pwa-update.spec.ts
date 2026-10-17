import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'

test('production PWA update reviews a dirty form and saves before reload; updated shell works offline', async ({ page, context }) => {
  let revision = 1
  const root = resolve('dist')
  const mime: Record<string, string> = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
      if (!file.startsWith(root + '/')) { res.writeHead(404).end(); return }
      let content = await readFile(file)
      if (pathname === '/sw.js') content = Buffer.from(content.toString() + `\n// synthetic update revision ${revision}\n`)
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(content)
    } catch { res.writeHead(404).end() }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No server port')
  try {
    await page.goto(`http://127.0.0.1:${address.port}/#/plan`)
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.reload(); await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    await page.getByRole('button', { name: 'Edit additional income ↗' }).click()
    await page.locator('.inline-editor input').fill('321.45')
    await page.evaluate(() => { (window as unknown as { syntheticMarker: boolean }).syntheticMarker = true })
    revision = 2
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update() })
    const update = page.getByRole('button', { name: 'Update and reload' })
    await expect(update).toBeVisible()
    await update.click(); await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await expect(page.locator('.inline-editor input')).toHaveValue('321.45')
    expect(await page.evaluate(() => (window as unknown as { syntheticMarker?: boolean }).syntheticMarker)).toBe(true)
    await update.click(); await page.getByRole('button', { name: 'Save and continue', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { syntheticMarker?: boolean }).syntheticMarker ?? false).catch(() => true)).toBe(false)
    await expect(page.locator('.metric-card').filter({ hasText: 'Expected income' })).toContainText('$321.45')
    await context.setOffline(true); await page.reload()
    await expect(page.getByRole('heading', { name: 'Monthly plan', exact: true })).toBeVisible()
    await expect(page.locator('.metric-card').filter({ hasText: 'Expected income' })).toContainText('$321.45')
  } finally { await context.setOffline(false); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
