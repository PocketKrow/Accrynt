import { Buffer } from 'node:buffer'
import { expect, type Page } from '@playwright/test'

export async function downloadBackup(page: Page) {
  await page.goto('/#/settings')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download JSON backup', exact: true }).click()
  const file = await pending, stream = await file.createReadStream()
  if (!stream) throw new Error('Missing portable backup download')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return { filename: file.suggestedFilename(), buffer: Buffer.concat(chunks) }
}
export async function restoreFile(page: Page, buffer: Buffer) {
  await page.goto('/#/settings')
  await page.getByLabel('Select an Accrynt backup file').setInputFiles({ name: 'synthetic-recovery.json', mimeType: 'application/json', buffer })
  await expect(page.getByText('Validated backup:', { exact: false })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  // The application also initiates its independent pre-replacement safety download.
  const safety = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Replace local records with backup', exact: true }).click()
  expect((await safety).suggestedFilename()).toContain('before-restore')
  await expect(page.getByText('Validated backup:', { exact: false })).not.toBeVisible()
}
