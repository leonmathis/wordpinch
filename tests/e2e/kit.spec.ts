import { expect, test } from "@playwright/test";
import { attachScreenshot, collectConsoleErrors, expectNoErrors, findHorizontalOverflow, findLowContrast, settle } from "./helpers";

test.describe("/dev/kit", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/kit");
    await settle(page);
  });

  test("renders without errors or horizontal overflow", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await page.reload();
    await settle(page);
    await attachScreenshot(page, testInfo, "kit");
    expect(await findHorizontalOverflow(page)).toEqual([]);
    expectNoErrors(errors);
  });

  test("glyph ink sits on the shape centre (≤0.5px)", async ({ page }, testInfo) => {
    const worst = await page.evaluate(() => {
      const family = getComputedStyle(document.documentElement).getPropertyValue("--font-gochi-hand").trim();
      // Ink box from rendered pixels, not measureText: WebKit's
      // actualBoundingBoxLeft/Right disagree with its own pixels (probe in
      // tests/e2e/glyph-metrics.probe.ts), Chromium's match.
      // Rendered at 4x and scaled back: whole-pixel edges would otherwise
      // limit the centre to ±0.5px, the size of the tolerance itself.
      const SCALE = 4;
      const W = 800;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = W;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const inkBox = (glyph: string, fs: number) => {
        ctx.clearRect(0, 0, W, W);
        ctx.font = `${fs * SCALE}px ${family}`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(glyph, 200, 500);
        const d = ctx.getImageData(0, 0, W, W).data;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let y = 0; y < W; y++)
          for (let x = 0; x < W; x++)
            if (d[(y * W + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const m = ctx.measureText(glyph);
        // Ink centre relative to the advance-box centre and the baseline, in px at fs.
        return {
          cx: ((x0 + x1 + 1) / 2 - 200 - m.width / 2) / SCALE,
          cy: ((y0 + y1 + 1) / 2 - 500) / SCALE,
          asc: m.fontBoundingBoxAscent / SCALE,
          desc: m.fontBoundingBoxDescent / SCALE,
        };
      };
      let max = 0;
      const rows: string[] = [];
      for (const grid of Array.from(document.querySelectorAll('[data-kit="glyphs"]'))) {
        // Measure the unrotated layout: a rotation about the centre does not
        // move the centre, but it inflates getBoundingClientRect.
        const wrappers = Array.from(grid.querySelectorAll<HTMLElement>(":scope > span > span:last-child"));
        const saved = wrappers.map((w) => w.style.transform);
        wrappers.forEach((w) => (w.style.transform = "none"));
        for (const shape of Array.from(grid.children)) {
          const text = shape.querySelector<HTMLElement>("span.font-hand")!;
          const fs = parseFloat(getComputedStyle(text).fontSize);
          const ink = inkBox(text.textContent ?? "", fs);
          const half = (ink.asc + ink.desc - fs) / 2;
          const r = text.getBoundingClientRect();
          const inkX = r.left + r.width / 2 + ink.cx;
          // Line box (line-height 1) top sits `asc - half` above the baseline.
          const inkY = r.top + (ink.asc - half) + ink.cy;
          const s = shape.getBoundingClientRect();
          const dx = inkX - (s.left + s.width / 2);
          const dy = inkY - (s.top + s.height / 2);
          max = Math.max(max, Math.abs(dx), Math.abs(dy));
          rows.push(`${text.textContent} ${dx.toFixed(2)} ${dy.toFixed(2)}`);
        }
        wrappers.forEach((w, i) => (w.style.transform = saved[i]));
      }
      return { max, rows };
    });
    testInfo.annotations.push({ type: "glyph worst px", description: worst.max.toFixed(2) });
    console.log(`[glyph] ${testInfo.project.name}: worst ${worst.max.toFixed(2)}px over ${worst.rows.length} glyphs`);
    expect(worst.max, worst.rows.join(" | ")).toBeLessThanOrEqual(0.5);
  });

  test("labels keep ≥12px from the real shape outline", async ({ page }) => {
    const result = await page.evaluate(() => {
      const STAR = [[180,100],[158.97,119.16],[164.72,147.02],[136.44,150.16],[124.72,176.08],[100,162],[75.28,176.08],[63.56,150.16],[35.28,147.02],[41.03,119.16],[20,100],[41.03,80.84],[35.28,52.98],[63.56,49.84],[75.28,23.92],[100,38],[124.72,23.92],[136.44,49.84],[164.72,52.98],[158.97,80.84]];
      const FL = [[100,100,62],[166,100,22],[157.2,133,22],[133,157.2,22],[100,166,22],[67,157.2,22],[43,133,22],[34,100,22],[43,67,22],[67,42.8,22],[100,34,22],[133,42.8,22],[157.2,67,22]];
      const seg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(px - ax - t * dx, py - ay - t * dy);
      };
      const flowerEdge: number[][] = [];
      for (const [cx, cy, r] of FL) for (let a = 0; a < 360; a++) {
        const x = cx + r * Math.cos((a * Math.PI) / 180), y = cy + r * Math.sin((a * Math.PI) / 180);
        if (!FL.some(([ox, oy, or]) => (ox !== cx || oy !== cy) && Math.hypot(x - ox, y - oy) < or - 0.01)) flowerEdge.push([x, y]);
      }
      const clear: Record<string, (x: number, y: number, size: number) => number> = {
        square: (x, y, size) => { const e = Math.round(size * 0.74); const s = e / (Math.cos(Math.PI / 30) + Math.sin(Math.PI / 30)); return Math.min(s / 2 - Math.abs(x), s / 2 - Math.abs(y)); },
        circle: (x, y, size) => Math.round(size * 0.81) / 2 - Math.hypot(x, y),
        star: (x, y, size) => { const k = size / 200, ux = x / k + 100, uy = y / k + 100; let m = Infinity; for (let i = 0; i < STAR.length; i++) { const [a, b] = STAR[i], [c, d] = STAR[(i + 1) % STAR.length]; m = Math.min(m, seg(ux, uy, a, b, c, d)); } return (m + 9) * k; },
        flower: (x, y, size) => { const k = size / 200, ux = x / k + 100, uy = y / k + 100; let m = Infinity; for (const [bx, by] of flowerEdge) m = Math.min(m, Math.hypot(ux - bx, uy - by)); return m * k; },
      };
      const kinds = ["square", "star", "circle", "flower"];
      const out: Record<string, number> = {};
      for (const grid of Array.from(document.querySelectorAll('[data-kit="mode-grid"]'))) {
        // Each mode is a Button wrapping its Shape.
        Array.from(grid.children).map((b) => b.firstElementChild!).forEach((shape, i) => {
          const s = shape.getBoundingClientRect();
          const cx = s.left + s.width / 2, cy = s.top + s.height / 2;
          let w = Infinity;
          shape.querySelectorAll("span > span").forEach((sp) => {
            const rg = document.createRange();
            rg.selectNodeContents(sp);
            for (const r of Array.from(rg.getClientRects()))
              for (const [px, py] of [[r.left, r.top + r.height * 0.12], [r.right, r.top + r.height * 0.12], [r.left, r.bottom - r.height * 0.12], [r.right, r.bottom - r.height * 0.12]])
                w = Math.min(w, clear[kinds[i]](px - cx, py - cy, s.width));
          });
          out[kinds[i]] = Math.min(out[kinds[i]] ?? Infinity, w);
        });
      }
      return out;
    });
    console.log(`[clearance] ${test.info().project.name}: ${Object.entries(result).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", ")}`);
    for (const [kind, px] of Object.entries(result)) expect(px, kind).toBeGreaterThanOrEqual(12);
  });

  test("star and flower backdrops fill their box, also inside buttons", async ({ page }) => {
    const bad = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-shape] > svg")).flatMap((svg) => {
        const box = svg.parentElement!.getBoundingClientRect();
        const r = svg.getBoundingClientRect();
        return Math.abs(r.width - box.width) > 0.5 || Math.abs(r.height - box.height) > 0.5
          ? [`${svg.parentElement!.dataset.shape} ${r.width}x${r.height} in ${box.width}`]
          : [];
      })
    );
    expect(await page.locator('[data-kit="mode-grid"] button [data-shape="star"] > svg').count()).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  test("contrast helper: flags low contrast, reads translucent and oklab fills", async ({ page }) => {
    await page.evaluate(() => {
      const box = document.createElement("div");
      box.id = "contrast-selftest";
      box.style.background = "rgb(220, 228, 195)";
      box.innerHTML = [
        '<p style="color: #9aa08a">grey on sage</p>',
        '<p style="color: #141414; background: oklab(1 0 0 / 0.45)">ink on translucent white</p>',
        '<p style="color: oklab(0.2 0 0)">oklab ink</p>',
        '<p style="color: rgb(20 20 20 / 0.2)">faint ink</p>',
      ].join("");
      document.body.prepend(box);
    });
    const low = await findLowContrast(page, "#contrast-selftest");
    expect(low.map((l) => l.replace(/ [\d.]+$/, ""))).toEqual(["grey on sage", "faint ink"]);
  });

  test("touch targets are ≥44px", async ({ page }) => {
    const small = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, [role='switch'], input"))) {
        const r = el.getBoundingClientRect();
        // Visually hidden helpers (e.g. the switch's native input) are not targets.
        if (r.width <= 2 || r.height <= 2) continue;
        const after = getComputedStyle(el, "::after");
        const extra = after.content !== "none" && after.position === "absolute" ? -2 * (parseFloat(after.top) || 0) : 0;
        if (r.height + extra < 44 || r.width < 44) out.push(`${el.getAttribute("aria-label") ?? el.textContent?.trim()} ${Math.round(r.width)}x${Math.round(r.height + extra)}`);
      }
      return out;
    });
    expect(small).toEqual([]);
  });

  test("text meets contrast: pills, disabled pill, status pills", async ({ page }) => {
    const pairs = await page.evaluate(() => {
      const toRgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const bgOf = (el: Element | null): string => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !c.startsWith("rgba(0, 0, 0, 0)") && c !== "transparent") return c; el = el.parentElement; } return "rgb(255,255,255)"; };
      const sel = "[data-slot='button'], [role='status'], [role='alert']";
      return Array.from(document.querySelectorAll(sel)).map((el) => {
        const textEl = el.matches("[role='status'], [role='alert']") ? el.querySelector("span.flex-1")! : el;
        return { text: (el.textContent ?? "").trim().slice(0, 30), ratio: +ratio(toRgb(getComputedStyle(textEl).color), toRgb(bgOf(textEl))).toFixed(2) };
      });
    });
    const failing = pairs.filter((p) => p.ratio < 4.5);
    expect(failing, JSON.stringify(pairs)).toEqual([]);
  });

  test("share sheet is a bottom sheet on phones and a 440px dialog from 640px", async ({ page }) => {
    await page.getByRole("button", { name: "Open share sheet" }).first().click();
    const popup = page.locator("[data-slot='dialog-content']");
    await expect(popup).toBeVisible();
    await page.waitForTimeout(400);
    const box = (await popup.boundingBox())!;
    const vp = page.viewportSize()!;
    if (vp.width < 640) {
      expect(Math.round(box.y + box.height)).toBe(vp.height);
      expect(Math.round(box.width)).toBe(vp.width);
    } else {
      expect(Math.round(box.width)).toBe(440);
      expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThanOrEqual(1);
    }
    const close = (await popup.getByRole("button", { name: "Close" }).boundingBox())!;
    expect(close.width).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
  });
});
