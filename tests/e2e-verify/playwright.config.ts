import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  reporter: 'list',
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: process.env.XZONES_BASE_URL ?? 'http://127.0.0.1:4175',
    trace: 'retain-on-failure',
  },
  outputDir: process.env.XZONES_ARTIFACTS_DIR ?? '/tmp/xzones-gameplay-artifacts',
})
