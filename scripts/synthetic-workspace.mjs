// QA-only helper. It is never imported by the application or included in dist.
import { Buffer } from 'node:buffer'
import { build } from 'esbuild'
import { expect } from '@playwright/test'
const output = await build({ entryPoints: ['src/tests/fixtures/synthetic-workspace.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { syntheticFixture } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`)

export async function populateWorkspace(page, origin, reference = '2026-10-16') {
  await page.clock.setFixedTime(new Date(`${reference}T16:00:00Z`))
  await page.goto(`${origin}/#/settings`)
  await page.getByLabel('Select an Accrynt backup file').setInputFiles({ name: 'synthetic-qa.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...syntheticFixture(reference), workspace: 'personal' })) })
  await expect(page.getByText('Validated backup:', { exact: false })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Replace local records with backup', exact: true }).click()
  await expect(page.getByText('Validated backup:', { exact: false })).not.toBeVisible()
}
