import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { mkdir } from 'node:fs/promises'
const stage = process.argv[2] ?? 'after'
const dir = 'docs/v09-evidence'
await mkdir(dir, { recursive: true })
const server = await preview({ preview: { host:'127.0.0.1', port:4173, strictPort:true } })
const browser = await chromium.launch({ executablePath: process.env.ACCRYNT_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
try {
  await page.clock.setFixedTime('2026-10-18T16:00:00Z')
  for (const theme of ['light', 'dark']) {
    await page.goto('http://127.0.0.1:4173/?demo=1#/settings')
    await page.getByLabel('Theme', { exact:true }).selectOption(theme)
    for (const width of [320, 390, 1920]) {
      await page.setViewportSize({ width, height: width === 1920 ? 1080 : 850 })
      for (const [name, route] of [['overview','/'], ['ledger','/ledger'], ['settings','/settings'], ['entry','/ledger']]) {
        await page.goto(`http://127.0.0.1:4173/?demo=1#${route}`)
        await page.locator('.metric-card, .data-counts').first().waitFor()
        await page.evaluate(() => document.fonts.ready)
        if (name === 'entry') await page.getByRole('button', {name:'+ Record transaction',exact:true}).click()
        await page.screenshot({path:`${dir}/${stage}-${theme}-${width}-${name}.png`, fullPage:name!=='entry'})
        if (await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error(`Overflow: ${theme} ${width} ${name}`)
        if (name === 'entry') {
          await page.getByRole('dialog',{name:'Transaction',exact:true}).evaluate(node=>{node.scrollTop=node.scrollHeight})
          await page.screenshot({path:`${dir}/${stage}-${theme}-${width}-entry-actions.png`})
        }
        if (stage === 'after' && name === 'overview') {
          await page.getByRole('button',{name:'View breakdown: After outstanding bills',exact:true}).click()
          await page.screenshot({path:`${dir}/${stage}-${theme}-${width}-breakdown.png`})
          await page.keyboard.press('Escape')
        }
      }
    }
  }
  if(errors.length) throw Error(errors.join('\n'))
  console.log(`${stage}: screenshots captured; no page errors or document overflow`)
} finally { await browser.close(); await server.httpServer.close() }
