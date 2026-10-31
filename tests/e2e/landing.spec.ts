import { FEATURES } from "../../src/lib/features";
import { expect, test, type Page } from "@playwright/test";
import { attachScreenshot, collectConsoleErrors, expectNoErrors, findHorizontalOverflow, settle } from "./helpers";

/** The create error; Next's route announcer is also role=alert. */
const alert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

/** The visible "Play a friend" shape button (one grid per breakpoint). */
const friend = (page: Page) => page.locator('[data-landing="modes"]:visible button').first();

/**
 * Smallest distance (px) from the label's text corners to the tilted
 * square's outline. Same geometry as the kit test: the backdrop is drawn
 * at 74% of the box and tilted 6°.
 */
async function squareClearance(page: Page) {
  return friend(page).evaluate((btn) => {
    const shape = btn.firstElementChild as HTMLElement;
    const s = shape.getBoundingClientRect();
    const cx = s.left + s.width / 2, cy = s.top + s.height / 2;
    const e = Math.round(s.width * 0.74);
    const side = e / (Math.cos(Math.PI / 30) + Math.sin(Math.PI / 30));
    let min = Infinity;
    shape.querySelectorAll("span > span").forEach((sp) => {
      const rg = document.createRange();
      rg.selectNodeContents(sp);
      for (const r of Array.from(rg.getClientRects()))
        for (const [px, py] of [[r.left, r.top + r.height * 0.12], [r.right, r.top + r.height * 0.12], [r.left, r.bottom - r.height * 0.12], [r.right, r.bottom - r.height * 0.12]])
          min = Math.min(min, side / 2 - Math.abs(px - cx), side / 2 - Math.abs(py - cy));
    });
    return { min, box: s.width };
  });
}

test.describe("landing", () => {
  test("renders headline, the enabled modes, join row; no overflow", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");
    await settle(page);
    await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", "landing");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("one scribbled word");
    // "Play a friend" plus every mode whose feature flag is on.
    const enabled = 1 + Object.values(FEATURES).filter(Boolean).length;
    await expect(page.locator('[data-landing="modes"]:visible button')).toHaveCount(enabled);
    await expect(friend(page)).toHaveAccessibleName("Play a friend: new room");
    const join = page.getByRole("button", { name: "Join" });
    await expect(join).toBeDisabled();
    for (const el of [friend(page), join, page.getByLabel("Got a code from a friend?"), page.getByRole("button", { name: "Settings" })]) {
      const b = await el.boundingBox();
      expect(b!.height, "touch target").toBeGreaterThanOrEqual(44);
    }
    const c = await squareClearance(page);
    console.log(`[landing clearance] ${testInfo.project.name}: ${c.min.toFixed(1)}px in a ${c.box}px box`);
    expect(c.min).toBeGreaterThanOrEqual(12);
    await attachScreenshot(page, testInfo, "landing");
    expect(await findHorizontalOverflow(page)).toEqual([]);
    expectNoErrors(errors);
  });

  test("every mode's label keeps 12px from its shape's outline", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    // Same geometry as the kit check, applied to the real labels (the daily
    // tile says "one try a day", longer than the artboard's "Q _ _ _ N").
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
      const out: Record<string, number> = {};
      for (const shape of Array.from(document.querySelectorAll<HTMLElement>('[data-landing="modes"] [data-shape]'))) {
        if (!shape.offsetParent) continue;
        const kind = shape.dataset.shape!;
        const s = shape.getBoundingClientRect();
        const cx = s.left + s.width / 2, cy = s.top + s.height / 2;
        shape.querySelectorAll("span > span").forEach((sp) => {
          const rg = document.createRange();
          rg.selectNodeContents(sp);
          for (const r of Array.from(rg.getClientRects()))
            for (const [px, py] of [[r.left, r.top + r.height * 0.12], [r.right, r.top + r.height * 0.12], [r.left, r.bottom - r.height * 0.12], [r.right, r.bottom - r.height * 0.12]])
              out[kind] = Math.min(out[kind] ?? Infinity, clear[kind](px - cx, py - cy, s.width));
        });
      }
      return out;
    });
    console.log(`[landing modes] ${test.info().project.name}: ${Object.entries(result).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", ")}`);
    expect(Object.keys(result).length).toBe(1 + Object.values(FEATURES).filter(Boolean).length);
    for (const [kind, px] of Object.entries(result)) expect(px, kind).toBeGreaterThanOrEqual(12);
  });

  test("join: ambiguous characters explained, Join gated at 4, valid code navigates", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    const input = page.getByLabel("Got a code from a friend?");
    const msg = page.locator("#room-message");
    await expect(msg).toHaveText("4 characters · no I, O, 0 or 1");
    await input.pressSequentially("k1o");
    await expect(input).toHaveValue("K");
    await expect(msg).toHaveText("Room codes never use I, O, 0 or 1. Check the code again.");
    await expect(msg).toHaveAttribute("role", "status");
    // Join stays disabled below 4 characters, so Enter does not submit.
    await input.press("Enter");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "Join" })).toBeDisabled();
    await input.pressSequentially("7qm");
    await expect(msg).toHaveText("Room codes never use I, O, 0 or 1. Check the code again.");
    await expect(page.getByRole("button", { name: "Join" })).toBeEnabled();
    await page.getByRole("button", { name: "Join" }).click();
    await page.waitForURL(/\/r\/K7QM$/);
  });

  test("create: busy state, then 429 with Retry-After", async ({ page }, testInfo) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route("**/api/rooms", async (route) => {
      await gate;
      await route.fulfill({ status: 429, headers: { "Retry-After": "240" }, contentType: "application/json", body: "{}" });
    });
    await page.goto("/");
    await settle(page);
    await friend(page).click();
    await expect(friend(page)).toHaveAccessibleName("Creating room…: one sec");
    await expect(friend(page)).toBeDisabled();
    const c = await squareClearance(page);
    console.log(`[landing busy clearance] ${testInfo.project.name}: ${c.min.toFixed(1)}px`);
    expect(c.min).toBeGreaterThanOrEqual(12);
    release();
    await expect(alert(page)).toHaveText(
      "Too many rooms from this network. Try again in 4 minutes, or join a friend's room with their code."
    );
    await expect(friend(page)).toBeEnabled();
    // The join field is not blamed for a create failure.
    await expect(page.getByLabel("Got a code from a friend?")).not.toHaveAttribute("aria-invalid", "true");
    await attachScreenshot(page, testInfo, "landing-429");
    expect(await findHorizontalOverflow(page)).toEqual([]);
  });

  test("create: server error and network failure", async ({ page }) => {
    await page.route("**/api/rooms", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "database unavailable" }) })
    );
    await page.goto("/");
    await settle(page);
    await friend(page).click();
    await expect(alert(page)).toHaveText("Couldn't create a room: database unavailable");
    await page.unroute("**/api/rooms");
    await page.route("**/api/rooms", (route) => route.abort("failed"));
    await friend(page).click();
    await expect(alert(page)).toHaveText("Network error. Check your connection and try again.");
  });

  test("create: success navigates to the room", async ({ page }) => {
    let body: unknown;
    await page.route("**/api/rooms", (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "K7QM" }) });
    });
    await page.goto("/");
    await settle(page);
    await friend(page).click();
    await page.waitForURL(/\/r\/K7QM$/);
    expect(body).toMatchObject({ hostId: expect.any(String) });
  });
});

test.describe("404", () => {
  for (const [path, title] of [["/r/ZZ", "This room went missing"], ["/nope/page", "Nothing here"]] as const) {
    test(`${path} shows the Pastel Pop 404`, async ({ page }, testInfo) => {
      const errors = collectConsoleErrors(page);
      const res = await page.goto(path);
      expect(res!.status()).toBe(404);
      await settle(page);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", "landing");
      const back = page.getByRole("link", { name: "Back to start" });
      const bb = (await back.boundingBox())!;
      expect(bb.height).toBeGreaterThanOrEqual(44);
      // A pill, not the default rounded-lg (raw buttonVariants skipped tailwind-merge).
      expect(parseFloat(await back.evaluate((el) => getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThanOrEqual(bb.height / 2);
      // "404" stays ≥12px inside the star's inner vertices (radius 62/200 of
      // the box plus half the 18-unit rounded stroke).
      const gap = await page.getByText("404", { exact: true }).evaluate((el) => {
        const box = el.closest("svg")?.parentElement ?? el.parentElement!.parentElement!;
        const svg = box.querySelector("svg")!.getBoundingClientRect();
        const cx = svg.left + svg.width / 2, cy = svg.top + svg.height / 2;
        const inner = ((62 + 9) / 200) * svg.width;
        const rg = document.createRange();
        rg.selectNodeContents(el);
        const r = rg.getBoundingClientRect();
        const far = Math.max(...[[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
        return inner - far;
      });
      console.log(`[404 clearance] ${testInfo.project.name}: ${gap.toFixed(1)}px`);
      expect(gap).toBeGreaterThanOrEqual(12);
      await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
      await attachScreenshot(page, testInfo, `404-${path.split("/")[1]}`);
      expect(await findHorizontalOverflow(page)).toEqual([]);
      // next-themes renders its inline script inside React; when a page
      // throws notFound() the dev build re-renders it on the client and
      // warns. Predates R4 (same on the old 404) and is absent in prod.
      expectNoErrors(errors.filter((e) => !e.startsWith("Encountered a script tag")));
      await back.click();
      await page.waitForURL(/\/$/);
    });
  }
});
