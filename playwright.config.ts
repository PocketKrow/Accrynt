import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  // Date-only accounting fixtures must not inherit the host browser's timezone.
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', timezoneId:'UTC', locale:'en-US' },
  projects: [
    { name: 'chromium', testIgnore: '**/date-boundary.spec.ts', use: { ...devices['Desktop Chrome'],
      launchOptions: process.env.ACCRYNT_CHROMIUM_PATH ? {
        executablePath: process.env.ACCRYNT_CHROMIUM_PATH,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
      } : undefined
    } },
    { name: 'firefox', testIgnore: '**/date-boundary.spec.ts', use: { ...devices['Desktop Firefox'],
      // Resolve the native permission dialog in disposable test profiles only.
      launchOptions: { firefoxUserPrefs: { 'permissions.default.persistent-storage': 1 } }
    } },
    { name: 'webkit-smoke', testMatch: [
      '**/webkit-smoke.spec.ts', '**/connected.spec.ts', '**/recovery-drill.spec.ts', '**/security.spec.ts',
      '**/webkit-reliability.spec.ts', '**/production.spec.ts'
    ], use: { ...devices['Desktop Safari'] } },
    ...(['America/New_York', 'Pacific/Auckland'] as const).map((timezoneId, index) => ({
      name: index === 0 ? 'new-york' : 'auckland', testMatch: '**/date-boundary.spec.ts',
      use: { ...devices['Desktop Firefox'], timezoneId }
    }))
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false
  }
})
