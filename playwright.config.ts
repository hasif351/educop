import { defineConfig } from "@playwright/test";

// End-to-end tests run against a production build with a freshly seeded database.
// E2E_PORT lets several checkouts run their suites side by side.
const PORT = Number(process.env.E2E_PORT || 3100);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: { command: `npm run start -- -p ${PORT}`, url: `http://localhost:${PORT}/api/health`, reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
