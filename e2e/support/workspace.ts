import { Buffer } from 'node:buffer'
import { test as base, type Page } from '@playwright/test'
import { syntheticFixture, type SyntheticScenario } from '../../src/tests/fixtures/synthetic-workspace'
import { restoreFile } from './backup'

export * from '@playwright/test'

/** Synthetic data enters disposable test profiles through the production restore flow. */
export async function populateWorkspace(page: Page, reference = '2026-10-16', scenario: SyntheticScenario = 'showroom') {
  await page.clock.setFixedTime(new Date(`${reference}T16:00:00Z`))
  const fixture = { ...syntheticFixture(reference, scenario), workspace: 'personal' }
  await restoreFile(page, Buffer.from(JSON.stringify(fixture)))
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(new Date('2026-10-16T16:00:00Z'))
    await populateWorkspace(page)
    await use(page)
  }
})
