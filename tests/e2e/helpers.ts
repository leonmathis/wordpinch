import { expect, type Page, type TestInfo } from "@playwright/test";

/** Phases the dev-only `?phase=` preview on /r/[code] can render. */
export const PHASES = ["lobby", "pick", "reveal", "race", "result", "matchend"] as const;
/** Any valid 4-character room code works for the dev preview. */
export const PREVIEW_ROOM = "K7QM";

/**
 * Console errors that the dev preview produces by design: there is no real
 * room on the server, so seat resolution and realtime fail.
 */
const EXPECTED_DEV_ERRORS = [
  /\/api\/rooms\/[A-Z0-9]{4}\/me/,
  /realtime/i,
  /Failed to load resource/,
  // React's dev-only performance track occasionally measures a server
  // component with a negative start under parallel load. Not in prod.
  /Failed to execute 'measure' on 'Performance'.*negative time stamp/,
];

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (EXPECTED_DEV_ERRORS.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => {
    if (EXPECTED_DEV_ERRORS.some((re) => re.test(err.message))) return;
    errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}

/** Waits for fonts so measurements use the real glyph metrics. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Elements that end past the right edge of the viewport or of their nearest
 * clipping ancestor. `.wp-body` scrolls vertically, which makes its
 * overflow-x `auto` too, so "inside a scroll container" is not an excuse:
 * only ancestors marked `data-scroll-x` (an intended horizontal scroller)
 * are. Visually hidden helpers (1px clipped labels) are skipped.
 */
export async function findHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const clipRight = (el: HTMLElement) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        if (p.hasAttribute("data-scroll-x")) return Infinity;
        if (getComputedStyle(p).overflowX !== "visible") return p.getBoundingClientRect().right;
        p = p.parentElement;
      }
      return vw;
    };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) continue;
      if (el.closest("[data-slot='dialog-content'], [data-sonner-toaster], nextjs-portal")) continue;
      const limit = Math.min(vw, clipRight(el));
      if (r.right > limit + 1) {
        const label = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40);
        out.push(`${el.tagName.toLowerCase()} +${Math.round(r.right - limit)}px "${label}"`);
      }
    }
    return out;
  });
}

/**
 * Screenshot for manual review: attached to the report and saved as
 * test-results/screens/<project>-<name>.png (Playwright clears
 * test-results at the start of every run). `.wp-body` scrolls on its own,
 * so `fullPage` stops at the viewport; taller screens also get one shot
 * per scrolled segment (<name>-2.png, -3.png …), and the scroll is reset.
 */
export async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const shot = async (suffix: string) => {
    const path = `test-results/screens/${testInfo.project.name}-${name}${suffix}.png`;
    const body = await page.screenshot({ fullPage: true, path });
    await testInfo.attach(name + suffix, { body, contentType: "image/png" });
  };
  await shot("");
  const steps = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".wp-body");
    return el && el.scrollHeight > el.clientHeight + 2 ? Math.ceil((el.scrollHeight - el.clientHeight) / (el.clientHeight * 0.8)) : 0;
  });
  for (let i = 1; i <= steps; i++) {
    await page.evaluate((i) => {
      const el = document.querySelector<HTMLElement>(".wp-body")!;
      el.scrollTop = Math.round(el.clientHeight * 0.8 * i);
    }, i);
    await shot(`-${i + 1}`);
  }
  if (steps) await page.evaluate(() => (document.querySelector<HTMLElement>(".wp-body")!.scrollTop = 0));
}

export function expectNoErrors(errors: string[]) {
  expect(errors, `unexpected console errors:\n${errors.join("\n")}`).toEqual([]);
}

/**
 * Buttons, switches and inputs under `root` smaller than 44×44. A
 * positioned `::after` hit area counts, and hidden 1px helpers (a switch's
 * native input) are skipped.
 */
export async function findSmallTargets(page: Page, root = "body") {
  return page.evaluate((root) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelector(root)!.querySelectorAll<HTMLElement>("button, [role='switch'], input, a[href]"))) {
      const r = el.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) continue;
      const after = getComputedStyle(el, "::after");
      const extra = after.content !== "none" && after.position === "absolute" ? -2 * (parseFloat(after.top) || 0) : 0;
      if (r.height + extra < 44 || r.width < 44)
        out.push(`${el.getAttribute("aria-label") ?? el.textContent?.trim()} ${Math.round(r.width)}x${Math.round(r.height + extra)}`);
    }
    return out;
  }, root);
}

/**
 * Every element under `root` that directly holds text, with its contrast
 * against the nearest opaque background. Text inside disabled or dimmed
 * controls is skipped (WCAG exempts inactive components). Returns the
 * entries below `min` (4.5:1 by default; 3:1 counts for text ≥24px or
 * ≥18.66px bold).
 */
export async function findLowContrast(page: Page, root = "body") {
  return page.evaluate((root) => {
    // Any CSS colour (rgb, oklab, color-mix results) to sRGB + alpha via a
    // canvas, so translucent fills like `bg-card/45` are read correctly.
    const cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgba = (c: string): [number, number, number, number] => {
      cv.clearRect(0, 0, 1, 1);
      cv.fillStyle = "#000";
      cv.fillStyle = c;
      cv.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = cv.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (top: [number, number, number, number], under: number[]) =>
      [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    // Text in a Shape sits on its backdrop, a sibling (span or SVG), not an
    // ancestor; read that fill. Rings are outlines, so they fall through.
    const shapeFill = (el: Element) => {
      const shape = el.closest("[data-shape]");
      if (!shape || shape.getAttribute("data-shape") === "ring") return null;
      const back = shape.firstElementChild!;
      const c = back.tagName.toLowerCase() === "svg"
        ? getComputedStyle(back.querySelector("polygon, circle")!).fill
        : getComputedStyle(back).backgroundColor;
      return c.startsWith("rgb") || c.startsWith("oklab") || c.startsWith("color") ? c : null;
    };
    // Background behind `el`: translucent layers composited over whatever
    // is under them, down to the first opaque one (or the body).
    const bgOf = (el: Element | null): number[] => {
      const layers: [number, number, number, number][] = [];
      const fill = el ? shapeFill(el) : null;
      if (fill) layers.push(rgba(fill));
      for (let cur = el; cur && !(layers.length > 0 && layers[layers.length - 1][3] >= 1); cur = cur.parentElement) {
        const c = rgba(getComputedStyle(cur).backgroundColor);
        if (c[3] > 0) layers.push(c);
      }
      let base = rgba(getComputedStyle(document.body).backgroundColor).slice(0, 3);
      for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
      return base;
    };
    const dimmed = (el: Element | null) => {
      for (; el; el = el.parentElement) {
        if (el.matches(":disabled, [data-disabled], [aria-disabled='true']")) return true;
        if (parseFloat(getComputedStyle(el).opacity) < 1) return true;
      }
      return false;
    };
    const out: string[] = [];
    for (const el of Array.from(document.querySelector(root)!.querySelectorAll<HTMLElement>("*"))) {
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!own || el.getClientRects().length === 0 || dimmed(el)) continue;
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700);
      const bg = bgOf(el);
      const r = ratio(over(rgba(cs.color), bg), bg);
      if (r < (large ? 3 : 4.5)) out.push(`${el.textContent!.trim().slice(0, 30)} ${r.toFixed(2)}`);
    }
    return out;
  }, root);
}

/**
 * Waits for running one-shot animations (entrance fades, pops) to end, so
 * contrast and screenshots see the settled frame: `findLowContrast` skips
 * anything with opacity < 1, which a mid-fade element is. Infinite loops
 * (dots, bobbing) are ignored.
 */
export async function finishAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {}))
    )
  );
}


/**
 * Smallest distance (px) from the text inside each visible flower `Shape`
 * under `root` to the flower's real scalloped outline (same geometry as
 * the kit test). Text corners are inset 12% vertically, as there.
 */
export async function flowerClearance(page: Page, root = "body") {
  return page.evaluate((root) => {
    const FL = [[100,100,62],[166,100,22],[157.2,133,22],[133,157.2,22],[100,166,22],[67,157.2,22],[43,133,22],[34,100,22],[43,67,22],[67,42.8,22],[100,34,22],[133,42.8,22],[157.2,67,22]];
    const edge: number[][] = [];
    for (const [cx, cy, r] of FL)
      for (let a = 0; a < 360; a++) {
        const x = cx + r * Math.cos((a * Math.PI) / 180), y = cy + r * Math.sin((a * Math.PI) / 180);
        if (!FL.some(([ox, oy, or]) => (ox !== cx || oy !== cy) && Math.hypot(x - ox, y - oy) < or - 0.01)) edge.push([x, y]);
      }
    const out: number[] = [];
    for (const shape of Array.from(document.querySelector(root)!.querySelectorAll<HTMLElement>("[data-shape='flower']"))) {
      if (!shape.offsetParent) continue;
      const s = shape.getBoundingClientRect();
      const k = s.width / 200, cx = s.left + s.width / 2, cy = s.top + s.height / 2;
      let min = Infinity;
      const content = shape.lastElementChild!;
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent!.trim()) continue;
        const rg = document.createRange();
        rg.selectNodeContents(n);
        for (const r of Array.from(rg.getClientRects()))
          for (const [px, py] of [[r.left, r.top + r.height * 0.12], [r.right, r.top + r.height * 0.12], [r.left, r.bottom - r.height * 0.12], [r.right, r.bottom - r.height * 0.12]]) {
            const ux = (px - cx) / k + 100, uy = (py - cy) / k + 100;
            for (const [bx, by] of edge) min = Math.min(min, Math.hypot(ux - bx, uy - by) * k);
          }
      }
      if (min !== Infinity) out.push(min);
    }
    return out;
  }, root);
}
