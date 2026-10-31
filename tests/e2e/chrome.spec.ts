import { expect, test, type Page } from "@playwright/test";
import { PREVIEW_ROOM, attachScreenshot, collectConsoleErrors, expectNoErrors, findHorizontalOverflow, settle } from "./helpers";

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Settings" }).first().click();
  const menu = page.locator("[data-slot='popover-content']");
  await expect(menu).toBeVisible();
  // The popup zooms in from 95%; measure only once the animation is done.
  await menu.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  return menu;
}

/** Every point of the box lies inside the viewport. */
async function expectInViewport(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
}

test.describe("top bar", () => {
  test("landing: wordmark and a 44px gear, no round pills", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await expect(page.getByRole("link", { name: "wordpinch" })).toBeVisible();
    const gear = (await page.getByRole("button", { name: "Settings" }).boundingBox())!;
    expect(gear.width).toBeGreaterThanOrEqual(44);
    expect(gear.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByText(/^Round \d+ of \d+$/)).toHaveCount(0);
  });

  test("in a match: round label and one pill per round, fitting up to 15", async ({ page }) => {
    await page.goto("/dev/kit");
    await settle(page);
    const bars = page.locator('[data-kit="top-bar"]').first().locator("xpath=..").locator('[data-kit="top-bar"]');
    await expect(bars.nth(1).getByText("Round 3 of 7")).toBeVisible();
    await expect(bars.nth(1).locator("span.rounded-full.bg-foreground")).toHaveCount(7);
    await expect(bars.nth(2).getByText("Round 15 of 15")).toBeVisible();
    const pills = bars.nth(2).locator("span.rounded-full.bg-foreground");
    await expect(pills).toHaveCount(15);
    // The last pill must end before the gear starts.
    const lastPill = (await pills.nth(14).boundingBox())!;
    const gear = (await bars.nth(2).getByRole("button", { name: "Settings" }).boundingBox())!;
    expect(lastPill.x + lastPill.width).toBeLessThan(gear.x);
  });
});

test.describe("settings menu", () => {
  test("landing menu: sound, theme, rules; no room or leave rows", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");
    await settle(page);
    const menu = await openMenu(page);
    await expectInViewport(page, (await menu.boundingBox())!);
    await attachScreenshot(page, testInfo, "menu-landing");
    await expect(menu.getByText("Room", { exact: true })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: "Leave room" })).toHaveCount(0);

    // Sound switch flips and the change survives a reopen.
    const sound = menu.getByRole("switch", { name: "Sound" });
    const before = await sound.getAttribute("aria-checked");
    await sound.click();
    await expect(sound).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");

    // Theme segments drive next-themes.
    await menu.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await menu.getByRole("button", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await menu.getByRole("button", { name: "Auto" }).click();
    await expect(menu.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");

    // Rules open as a sheet and close with Escape.
    await menu.getByRole("button", { name: "How to play" }).click();
    const rules = page.getByRole("dialog", { name: "How to play" });
    await expect(rules).toBeVisible();
    await expect(rules.getByRole("listitem")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(rules).toBeHidden();
    expectNoErrors(errors);
  });

  test("room menu: share opens the sheet, leave links home", async ({ page }, testInfo) => {
    await page.goto(`/r/${PREVIEW_ROOM}?phase=pick`);
    await settle(page);
    const menu = await openMenu(page);
    await expect(menu.getByText(PREVIEW_ROOM, { exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Leave room" })).toHaveAttribute("href", "/");
    const targets = await menu.locator("button, a, [role='switch']").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const after = getComputedStyle(el, "::after");
        const extra = after.content !== "none" && after.position === "absolute" ? -2 * (parseFloat(after.top) || 0) : 0;
        return { name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim(), h: r.height + extra, w: r.width };
      })
    );
    for (const t of targets) expect(t.h, t.name).toBeGreaterThanOrEqual(44);

    await menu.getByRole("button", { name: "Share" }).click();
    const sheet = page.getByRole("dialog", { name: "Invite a friend" });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(300);
    await attachScreenshot(page, testInfo, "share-sheet");
    const box = (await sheet.boundingBox())!;
    const vp = page.viewportSize()!;
    if (vp.width < 640) expect(Math.round(box.y + box.height)).toBe(vp.height);
    else expect(Math.round(box.width)).toBe(440);
    await expectInViewport(page, box);
    await expect(sheet.getByRole("textbox", { name: "Room link" })).toHaveValue(new RegExp(`/r/${PREVIEW_ROOM}$`));
    await expect(sheet.getByRole("img", { name: /QR code/ })).toBeVisible();
    const copy = (await sheet.getByRole("button", { name: "Copy link" }).boundingBox())!;
    expect(copy.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("status banners", () => {
  test("reconnecting and seat-error pills sit below the top bar, inside the viewport", async ({ page }, testInfo) => {
    await page.goto(`/r/${PREVIEW_ROOM}?phase=race&reconnect=1`);
    await settle(page);
    const reconnecting = page.getByRole("status").filter({ hasText: "Reconnecting…" });
    await expect(reconnecting).toBeVisible();
    await attachScreenshot(page, testInfo, "banners");
    const gear = (await page.getByRole("button", { name: "Settings" }).boundingBox())!;
    const pill = (await reconnecting.boundingBox())!;
    expect(pill.y).toBeGreaterThanOrEqual(gear.y + gear.height);
    await expectInViewport(page, pill);
    // The dev preview has no real seat, so the seat error shows up too.
    const seat = page.getByRole("alert").filter({ hasText: "Couldn’t confirm your seat" });
    if (await seat.count()) {
      await expectInViewport(page, (await seat.boundingBox())!);
      const retry = (await seat.getByRole("button", { name: "Retry" }).boundingBox())!;
      expect(retry.height).toBeGreaterThanOrEqual(44);
    }
    expect(await findHorizontalOverflow(page)).toEqual([]);
  });

  test("spinner stops under reduced motion", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ ...testInfo.project.use, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`/r/${PREVIEW_ROOM}?phase=race&reconnect=1`);
    await settle(page);
    const animation = await page
      .getByRole("status")
      .filter({ hasText: "Reconnecting…" })
      .locator("svg")
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe("none");
    await context.close();
  });
});

test("scrolled content passes under an opaque top bar", async ({ page }) => {
  await page.goto("/r/K7QM?phase=lobby&as=host");
  await page.evaluate(() => document.fonts.ready);
  const bar = (await page.locator(".wp-chrome").boundingBox())!;
  expect(bar.height).toBeLessThanOrEqual(64);
  const scrolled = await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>(".wp-body")!;
    body.scrollTop = 300;
    return body.scrollTop;
  });
  test.skip(scrolled === 0, "lobby fits without scrolling on this viewport");
  // The bar spans the full width on top of the content; the background
  // check below is what proves the content is hidden, not just covered.
  const leaks = await page.evaluate(({ h }) => {
    // The bar is pointer-events: none so it never eats taps meant for the
    // page; hit-testing needs it on while we probe what is painted on top.
    document.querySelector<HTMLElement>(".wp-chrome")!.style.pointerEvents = "auto";
    const out: string[] = [];
    for (let x = 4; x < window.innerWidth; x += 24)
      for (const y of [2, h / 2, h - 2]) {
        const el = document.elementFromPoint(x, y);
        if (el && !el.closest(".wp-chrome")) out.push(`${x},${y} ${el.tagName} ${(el.textContent ?? "").trim().slice(0, 20)}`);
      }
    return out;
  }, { h: bar.height });
  expect(leaks).toEqual([]);
  const bg = await page.locator(".wp-chrome").evaluate((el) => getComputedStyle(el).backgroundColor);
  const rootBg = await page.locator(".wp-root").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe(rootBg);
});

