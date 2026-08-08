import { defineConfig, devices } from '@playwright/test';

const webRoot = __dirname;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4200',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      name: 'API',
      command:
        'DATABASE_URL= INGESTION_SCHEDULER_ENABLED=false CORS_ALLOWED_ORIGINS=http://127.0.0.1:4200,http://localhost:4200 WEBAUTHN_ALLOWED_ORIGINS=http://127.0.0.1:4200,http://localhost:4200 npm --prefix ../api run start:dev',
      cwd: webRoot,
      url: 'http://127.0.0.1:4000/api/health/ready',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      name: 'Web',
      command: 'npm start -- --host 127.0.0.1 --port 4200',
      cwd: webRoot,
      url: 'http://127.0.0.1:4200',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
