import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

// No global seeding or real Auth service. Provider navigation is intercepted by
// the browser tests. Explicit overrides prevent .env.local production access.
const baseURL = 'http://127.0.0.1:3105'
export default defineConfig({
  testDir: './oauth-ui',
  outputDir: '../test-results/oauth-ui',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [{
    command: 'node e2e/oauth-ui/auth-settings.mjs',
    cwd: resolve(__dirname, '..'),
    url: 'http://127.0.0.1:54999/auth/v1/settings',
    reuseExistingServer: false,
  }, {
    command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3105',
    cwd: resolve(__dirname, '..'),
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54999',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'oauth-ui-test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: '',
      RESEND_API_KEY: '', SLACK_WEBHOOK_URL: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '',
    },
  }],
})
