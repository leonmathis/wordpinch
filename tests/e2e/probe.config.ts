import { defineConfig, devices } from "@playwright/test";

/** Config for one-off measurement probes (`*.probe.ts`), not the suite. */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.probe\.ts/,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
