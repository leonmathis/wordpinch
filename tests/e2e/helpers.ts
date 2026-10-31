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
 * Full-page screenshot for manual review: attached to the report and saved
 * as test-results/screens/<project>-<name>.png (Playwright clears
 * test-results at the start of every run).
 */
export async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = `test-results/screens/${testInfo.project.name}-${name}.png`;
  const body = await page.screenshot({ fullPage: true, path });
  await testInfo.attach(name, { body, contentType: "image/png" });
}

export function expectNoErrors(errors: string[]) {
  expect(errors, `unexpected console errors:\n${errors.join("\n")}`).toEqual([]);
}
