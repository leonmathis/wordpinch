// One-off probe: element screenshots of kit sections that sit below the
// fold of the inner scroll container. Output: test-results/probe/*.png
import { test } from "@playwright/test";

test("kit sections", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/kit");
  await page.evaluate(() => document.fonts.ready);
  const sections = ["mode-grid", "glyphs"] as const;
  for (const name of sections) {
    const all = page.locator(`[data-kit="${name}"]`);
    for (let i = 0; i < (await all.count()); i++) {
      await all.nth(i).scrollIntoViewIfNeeded();
      await all.nth(i).screenshot({ path: `test-results/probe/${browserName}-${name}-${i === 0 ? "light" : "dark"}.png` });
    }
  }
  const slots = page.getByRole("img", { name: /Starts with T/ });
  for (let i = 0; i < (await slots.count()); i++) {
    await slots.nth(i).scrollIntoViewIfNeeded();
    await slots.nth(i).screenshot({ path: `test-results/probe/${browserName}-slots-${i === 0 ? "light" : "dark"}.png` });
  }
});
