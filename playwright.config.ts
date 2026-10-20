import { defineConfig } from "@playwright/test";

// End-to-end tests run against a production build with a freshly seeded database.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  webServer: { command: "npm run start -- -p 3100", url: "http://localhost:3100/api/health", reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
