import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:3010", trace: "on-first-retry", timezoneId: "Australia/Sydney" },
  webServer: { command: process.env.PLAYWRIGHT_USE_PRODUCTION_SERVER==="1"?"./node_modules/.bin/next start -p 3010":"./node_modules/.bin/next dev -p 3010", url: "http://127.0.0.1:3010", reuseExistingServer: false },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
