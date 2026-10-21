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
  webServer: {
    command: `npm run start -- -p ${PORT}`, url: `http://localhost:${PORT}/api/health`, reuseExistingServer: !process.env.CI, timeout: 60_000,
    // Fake LiveKit settings turn "Educop live (beta)" on. Nothing listens on that
    // port, so the stage's can't-connect handling is what gets tested.
    env: { LIVEKIT_URL: "ws://127.0.0.1:7881", LIVEKIT_API_KEY: "e2e-fake-key", LIVEKIT_API_SECRET: "e2e-fake-secret-not-a-real-livekit-secret-0123" },
  },
});
