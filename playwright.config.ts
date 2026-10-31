import { defineConfig, devices } from "@playwright/test";

/**
 * Device checks for the redesign (docs/redesign/03-code-mapping.md §7).
 * Runs against the dev server, because the dev-only routes (/dev/kit and
 * the ?phase= preview on /r/[code]) are what the checks render.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 13"] } },
    { name: "iphone-dark", use: { ...devices["iPhone 13"], colorScheme: "dark" } },
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "ipad", use: { ...devices["iPad (gen 7)"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    {
      name: "desktop-dark",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, colorScheme: "dark" },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
