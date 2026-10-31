import { expect, test, type Page } from "@playwright/test";
import {
  PREVIEW_ROOM,
  attachScreenshot,
  collectConsoleErrors,
  expectNoErrors,
  findHorizontalOverflow,
  findLowContrast,
  findSmallTargets,
  settle,
} from "./helpers";

const VIEWS = {
  first: "as=host",
  last: "as=guest",
  away: "as=host&away=1",
  stress: "as=host&stress=1",
} as const;

async function open(page: Page, query: string) {
  await page.goto(`/r/${PREVIEW_ROOM}?phase=pick&${query}`);
  await settle(page);
  await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", "pick");
}

const grid = (page: Page) => page.getByRole("radiogroup", { name: "Choose a letter" });
const key = (page: Page, l: string) => grid(page).getByRole("radio", { name: l, exact: true });
const lockBtn = (page: Page) => page.getByRole("button", { name: /^(Lock in|Pick a letter|Locking)/ });

test.describe("pick", () => {
  for (const [view, query] of Object.entries(VIEWS)) {
    test(`${view}: renders cleanly`, async ({ page }, testInfo) => {
      const errors = collectConsoleErrors(page);
      await open(page, query);
      await attachScreenshot(page, testInfo, `pick-${view}`);
      expect(await findHorizontalOverflow(page)).toEqual([]);
      expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
      expect(await findLowContrast(page, ".wp-root")).toEqual([]);
      expectNoErrors(errors);
    });
  }

  test("away banner stands out from the pink ground", async ({ page }) => {
    await open(page, VIEWS.away);
    const banner = page.getByText(/Juno disconnected/).locator("xpath=ancestor::*[contains(@class,'rounded-[26px]')][1]");
    const [bg, ground] = await Promise.all([
      banner.evaluate((el) => getComputedStyle(el).backgroundColor),
      page.locator(".wp-root").evaluate((el) => getComputedStyle(el).backgroundColor),
    ]);
    expect(bg).not.toBe(ground);
  });

  test("top bar carries round and score", async ({ page }) => {
    await open(page, VIEWS.first);
    await expect(page.locator(".wp-chrome")).toContainText("Round 3 of 7 · Leon 2 · 1 Juno");
    await open(page, VIEWS.stress);
    // 32-character names are cut, and the label stays left of the gear.
    const label = (await page.locator(".wp-chrome").getByText(/^Round 3 of 7/).boundingBox())!;
    const gear = (await page.getByRole("button", { name: "Settings" }).boundingBox())!;
    expect(label.x + label.width).toBeLessThan(gear.x);
  });

  test("grid: radios, arrow keys, one tab stop", async ({ page }) => {
    await open(page, VIEWS.first);
    await expect(grid(page).getByRole("radio")).toHaveCount(26);
    await expect(grid(page).locator("[aria-checked='true']")).toHaveCount(0);
    await expect(lockBtn(page)).toHaveText("Pick a letter");
    await expect(lockBtn(page)).toBeDisabled();

    await key(page, "T").click();
    await expect(key(page, "T")).toHaveAttribute("aria-checked", "true");
    await expect(lockBtn(page)).toHaveText("Lock in T");
    await expect(grid(page).locator("[tabindex='0']")).toHaveCount(1);

    await key(page, "T").focus();
    await page.keyboard.press("ArrowRight");
    await expect(key(page, "U")).toHaveAttribute("aria-checked", "true");
    await expect(key(page, "U")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(key(page, "N")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(key(page, "U")).toBeFocused();
    await page.keyboard.press("End");
    await expect(key(page, "Z")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowRight");
    await expect(key(page, "Z")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(key(page, "A")).toHaveAttribute("aria-checked", "true");
    await expect(grid(page).locator("[aria-checked='true']")).toHaveCount(1);
  });

  test("physical keyboard: a letter picks, Enter locks, Change letter unlocks", async ({ page }, testInfo) => {
    await open(page, VIEWS.first);
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("q");
    await expect(key(page, "Q")).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Nice pick,");
    await expect(page.getByRole("status").filter({ hasText: "Locked in. Waiting for Juno" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Locked" })).toBeVisible();
    await expect(grid(page)).toHaveAttribute("aria-disabled", "true");
    await expect(key(page, "A")).toBeDisabled();
    await attachScreenshot(page, testInfo, "pick-locked");
    expect(await findHorizontalOverflow(page)).toEqual([]);
    expect(await findLowContrast(page, ".wp-root")).toEqual([]);
    // Letters typed while locked change nothing.
    await page.keyboard.press("x");
    await expect(key(page, "Q")).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "Change letter" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pick the");
    await expect(key(page, "Q")).toBeEnabled();
    await expect(lockBtn(page)).toHaveText("Lock in Q");
  });

  test("keys typed in the settings menu don't pick", async ({ page }) => {
    await open(page, VIEWS.first);
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText("How to play")).toBeVisible();
    await page.keyboard.press("k");
    await expect(grid(page).locator("[aria-checked='true']")).toHaveCount(0);
  });

  test("idle opponent: skip card after 45 s locked", async ({ page }) => {
    await page.clock.install();
    await open(page, VIEWS.first);
    await key(page, "T").click();
    await lockBtn(page).click();
    await page.clock.fastForward(44_000);
    await expect(page.getByText("Juno still hasn’t picked.")).toHaveCount(0);
    await page.clock.fastForward(2_000);
    await expect(page.getByText("Juno still hasn’t picked.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip this round" })).toBeVisible();
  });

  test("slot order follows the word: first left, last right", async ({ page }) => {
    await open(page, VIEWS.first);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("first letter");
    let hidden = (await page.getByRole("img", { name: "Juno's letter, hidden until the reveal" }).boundingBox())!;
    await key(page, "T").click();
    let mine = (await page.locator(".wp-body [data-shape='square']:visible").first().boundingBox())!;
    expect(mine.x).toBeLessThan(hidden.x);

    await open(page, VIEWS.last);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("last letter");
    hidden = (await page.getByRole("img", { name: "Leon's letter, hidden until the reveal" }).boundingBox())!;
    mine = (await page.locator(".wp-body [data-shape='star']:visible").first().boundingBox())!;
    expect(mine.x).toBeGreaterThan(hidden.x);
  });

  test("words played expands into earlier rounds", async ({ page }) => {
    await open(page, VIEWS.first);
    const toggle = page.getByRole("button", { name: /Words played · 2/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const rows = page.locator("li").filter({ hasText: /^Rd \d/ });
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("glove");
    await expect(rows.nth(1)).toContainText("Juno");
    expect(await findHorizontalOverflow(page)).toEqual([]);
  });

  test("layout: grid beside the headline from 1024px, below it on phones", async ({ page }) => {
    await open(page, VIEWS.first);
    const head = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    const letters = (await grid(page).boundingBox())!;
    if (page.viewportSize()!.width >= 1024) {
      expect(letters.x).toBeGreaterThan(head.x + head.width);
      expect((await key(page, "A").boundingBox())!.height).toBeGreaterThanOrEqual(60);
    } else {
      expect(letters.y).toBeGreaterThan(head.y + head.height);
    }
  });

  test("typing dots hold still under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, VIEWS.first);
    await key(page, "T").click();
    await lockBtn(page).click();
    const anim = await page.locator(".typing-dots i").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe("none");
  });
});
