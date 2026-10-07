import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'pnpm --filter @kinsen/api start',
      url: 'http://127.0.0.1:3011/api/health',
      reuseExistingServer: false,
      timeout: 30_000,
      env: { HOST: '127.0.0.1', PORT: '3011', DATABASE_PATH: ':memory:' },
    },
    {
      command: 'pnpm build && pnpm preview',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { KINSEN_API_TARGET: 'http://127.0.0.1:3011', VITE_ASSET_TRACKER_E2E: 'true' },
    },
  ],
})
