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
    const toRgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
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
    const bgOf = (el: Element | null): string => {
      while (el) {
        const c = getComputedStyle(el).backgroundColor;
        if (c && !c.startsWith("rgba(0, 0, 0, 0)") && c !== "transparent") return c;
        el = el.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
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
      const r = ratio(toRgb(cs.color), toRgb(bgOf(el)));
      if (r < (large ? 3 : 4.5)) out.push(`${el.textContent!.trim().slice(0, 30)} ${r.toFixed(2)}`);
    }
    return out;
  }, root);
}
