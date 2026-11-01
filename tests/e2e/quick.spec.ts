import { expect, test, type Page, type Route } from "@playwright/test";
import {
  attachScreenshot,
  collectConsoleErrors,
  expectNoErrors,
  findHorizontalOverflow,
  findLowContrast,
  findSmallTargets,
  settle,
} from "./helpers";

/**
 * F7 quick match page with the queue API mocked, on every device. The
 * pairing itself is tests/e2e/quick.probe.ts.
 */

async function open(page: Page, reply: (method: string) => [number, unknown]) {
  await page.route("**/api/quick", (r: Route) => {
    const [status, json] = reply(r.request().method());
    return r.fulfill({ status, json });
  });
  await page.route("**/auth/v1/**", (r: Route) => r.fulfill({ status: 500, json: {} }));
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("wordpinch:v1:name", "Leon"));
  await page.goto("/quick");
  await settle(page);
}

const waiting = () => [200, { state: "waiting", waitingSince: Date.now(), waiting: 3 }] as [number, unknown];

async function clean(page: Page) {
  expect(await findHorizontalOverflow(page)).toEqual([]);
  expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
  expect(await findLowContrast(page, ".wp-root")).toEqual([]);
}

test.describe("quick match", () => {
  test("searching: orbit on its rings, the count, Cancel", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await open(page, (m) => (m === "DELETE" ? [200, { state: "idle" }] : waiting()));
    await expect(page.getByRole("status", { name: "Searching for an opponent" })).toBeVisible();
    await expect(page.getByText(/^3 waiting · 0:0\d$/)).toBeVisible();
    const offs = await page.locator("[data-orbit-dot]").evaluateAll((dots) =>
      dots.map((d) => {
        const ring = d.parentElement!.previousElementSibling as HTMLElement;
        const rb = ring.getBoundingClientRect();
        const db = d.getBoundingClientRect();
        const r = rb.width / 2 - parseFloat(getComputedStyle(ring).borderTopWidth) / 2;
        return Math.abs(Math.hypot(db.x + db.width / 2 - (rb.x + rb.width / 2), db.y + db.height / 2 - (rb.y + rb.height / 2)) - r);
      })
    );
    for (const o of offs) expect(o).toBeLessThanOrEqual(0.5);
    await attachScreenshot(page, testInfo, "quick-searching");
    await clean(page);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    expectNoErrors(errors.filter((e) => !/auth\/v1|identity/.test(e)));
  });

  test("the orbit turns, and holds still under reduced motion", async ({ page }) => {
    await open(page, () => waiting());
    const anim = () => page.locator(".quick-orbit").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(await anim()).toBe("quick-orbit");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await anim()).toBe("none");
  });

  test("matched: you vs them, then into the room", async ({ page }, testInfo) => {
    await open(page, () => [200, { state: "matched", code: "K7QM", opponent: "Bartholomew-Alexandria Fitzgeral" }]);
    await expect(page.getByText("Matched!")).toBeVisible();
    await expect(page.getByText("5 rounds · 30 s · quick-match rules")).toBeVisible();
    // The long name truncates under its avatar.
    const name = page.getByText("Bartholomew-Alexandria Fitzgeral");
    expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await attachScreenshot(page, testInfo, "quick-matched");
    await clean(page);
    await page.waitForURL(/\/r\/K7QM$/, { timeout: 6000 });
  });

  test("a minute alone: nobody around", async ({ page }, testInfo) => {
    await page.clock.install();
    await open(page, (m) => (m === "DELETE" ? [200, { state: "idle" }] : waiting()));
    await expect(page.getByText(/waiting ·/)).toBeVisible();
    await page.clock.fastForward(61_000);
    await expect(page.getByText("Quiet right now")).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite a friend" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep waiting" })).toBeVisible();
    await attachScreenshot(page, testInfo, "quick-none");
    await clean(page);
  });

  test("no account: says so", async ({ page }) => {
    await open(page, () => [401, { error: "Not signed in" }]);
    await expect(page.locator(".wp-body").getByRole("alert")).toContainText("needs a player account");
  });

  test("the landing tile opens it", async ({ page }) => {
    await page.route("**/api/quick", (r) => r.fulfill({ json: { state: "waiting", waitingSince: Date.now(), waiting: 1 } }));
    await page.goto("/");
    await page.locator('[data-landing="modes"]:visible').getByRole("button", { name: /Quick/ }).click();
    await page.waitForURL(/\/quick$/);
    await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", "quick");
  });
});
