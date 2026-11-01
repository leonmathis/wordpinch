import { defineConfig, devices } from "@playwright/test";

/** Config for one-off measurement probes (`*.probe.ts`), not the suite. */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.probe\.ts/,
  reporter: [["list"]],
  // E2E_BASE_URL points the live probes at a deployment instead of the dev server.
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
