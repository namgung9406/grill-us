import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "Desktop Chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "Mobile Chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: [
    {
      command: "npx tsx e2e/global-setup.ts && npm run dev:server",
      url: "http://127.0.0.1:3001/api/health",
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        PORT: "3001",
        LEADERBOARD_ENABLED: "true",
        LEADERBOARD_DEV_AUTH_BYPASS: "true",
        LEADERBOARD_DEV_USER_ID: "00000000-0000-4000-8000-000000000001",
        LEADERBOARD_DEV_DISPLAY_NAME: "E2E 플레이어",
        LEADERBOARD_RATE_LIMIT_MAX: "1000",
        LEADERBOARD_DB_PATH: ".tmp/e2e-leaderboard.sqlite",
      },
    },
    {
      command: "npm run dev:client -- --mode e2e --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      env: {
        VITE_ENTRA_CLIENT_ID: "e2e-client",
        VITE_ENTRA_TENANT_ID: "e2e-tenant",
        VITE_ENTRA_REDIRECT_URI: "http://127.0.0.1:5173",
        VITE_ENTRA_API_SCOPE: "api://e2e/Leaderboard.Access",
        VITE_LEADERBOARD_ENABLED: "true",
        VITE_E2E_AUTH: "true",
      },
    },
  ],
});