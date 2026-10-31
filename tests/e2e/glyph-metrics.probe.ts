// One-off probe, not part of the suite (no .spec suffix): compares the ink
// box reported by canvas measureText with the ink box found by scanning the
// rendered pixels, per engine. Run with:
//   npx playwright test --config tests/e2e/probe.config.ts
import { test } from "@playwright/test";

test("ink box: measureText vs pixels", async ({ page, browserName }) => {
  await page.goto("/dev/kit");
  await page.evaluate(() => document.fonts.ready);
  const rows = await page.evaluate(() => {
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-gochi-hand").trim();
    const size = 200;
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 400;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const out: string[] = [];
    for (const g of ["L", "V", "Y", "G", "H", "T"]) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${size}px ${family}`;
      ctx.textBaseline = "alphabetic";
      const x0 = 200, base = 250;
      ctx.fillText(g, x0, base);
      const m = ctx.measureText(g);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = Infinity, maxX = -Infinity;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++)
          if (data[(y * canvas.width + x) * 4 + 3] > 40) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
      const pixelDx = ((minX + maxX + 1) / 2 - x0 - m.width / 2) / size * 100;
      const metricDx = ((m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 - m.width / 2) / size * 100;
      out.push(`${g}: pixels ${pixelDx.toFixed(1)}% metrics ${metricDx.toFixed(1)}% advance ${(m.width / size * 100).toFixed(1)}%`);
    }
    return out;
  });
  console.log(`[${browserName}] ${rows.join(" | ")}`);
});
