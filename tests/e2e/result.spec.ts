import { expect, test, type Page } from "@playwright/test";
import {
  PREVIEW_ROOM,
  attachScreenshot,
  collectConsoleErrors,
  expectNoErrors,
  findHorizontalOverflow,
  findLowContrast,
  findSmallTargets,
  finishAnimations,
  settle,
} from "./helpers";

const SUGGESTIONS = ["teeth", "thrash", "touch", "tench", "truth", "trough"];

async function open(page: Page, query: string, suggestions: string[] = SUGGESTIONS) {
  await page.route("**/api/words/suggest**", (r) => r.fulfill({ json: { suggestions } }));
  await page.goto(`/r/${PREVIEW_ROOM}?phase=result&as=host&${query}`);
  await settle(page);
  await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", "result");
}

const TITLES: Record<string, string> = {
  win: "Leon won round 3",
  nearmiss: "Leon won round 3 by 140 ms",
  split: "Tied round 3: both score",
  splittimeout: "Tied round 3: out of time, both score",
  nobody: "Tied round 3: neither scores",
  nobodytimeout: "Round 3: out of time, neither scores",
  forfeit: "Leon wins round 3 by forfeit",
  replay: "Tied round 3: replaying",
};

test.describe("result", () => {
  for (const [variant, title] of Object.entries(TITLES)) {
    test(`${variant}: title and clean render`, async ({ page }, testInfo) => {
      const errors = collectConsoleErrors(page);
      await open(page, `result=${variant}`);
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await finishAnimations(page);
      await attachScreenshot(page, testInfo, `result-${variant}`);
      expect(await findHorizontalOverflow(page)).toEqual([]);
      expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
      expect(await findLowContrast(page, ".wp-root")).toEqual([]);
      expectNoErrors(errors);
    });
  }

  test("win: anchored word, IPA, definition card, suggestions", async ({ page }) => {
    await open(page, "result=win");
    const h1 = page.getByRole("heading", { level: 1, name: "tooth" });
    await expect(h1).toBeVisible();
    const colours = await h1.locator(":visible > span").evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
    expect(colours).toHaveLength(2);
    expect(colours[0]).not.toBe(colours[1]);
    await expect(page.getByText("/tuːθ/")).toBeVisible();
    await expect(page.getByRole("button", { name: "Play pronunciation" })).toBeVisible();
    await expect(page.getByText("noun", { exact: true })).toBeVisible();
    await expect(page.getByText("“She chipped a tooth on the ice.”")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Other words that worked" })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(6);
  });

  test("scores: you first, +1 badge on the winner only", async ({ page }) => {
    await open(page, "result=win");
    await finishAnimations(page);
    const cards = page.locator(".grid-cols-2 > .relative");
    await expect(cards.nth(0)).toContainText("Leon");
    await expect(cards.nth(0)).toContainText("3");
    await expect(cards.nth(0)).toContainText("+1");
    await expect(cards.nth(1)).toContainText("Juno");
    await expect(cards.nth(1)).not.toContainText("+");
    await open(page, "result=split");
    await expect(page.getByText("+1")).toHaveCount(2);
  });

  test("near miss: two cards with race times and a photo finish note", async ({ page }) => {
    await open(page, "result=nearmiss");
    await expect(page.getByText("2.40 s · winner")).toBeVisible();
    await expect(page.getByText("2.54 s", { exact: true })).toBeVisible();
    await expect(page.getByText("photo finish! 140 ms apart")).toBeVisible();
  });

  for (const [variant, a, b] of [
    ["splittimeout", "Time's up!", "a point each, then"],
    ["nobodytimeout", "Time's up!", "no point this round"],
    ["nobody", "Dead heat", "nobody gets the point"],
    ["forfeit", "Juno left", "the point is yours"],
    ["replay", "One more go", "same letters, new race"],
  ]) {
    test(`${variant}: hero reads "${a} / ${b}"`, async ({ page }) => {
      await open(page, `result=${variant}`);
      await expect(page.getByText(a, { exact: true })).toBeVisible();
      await expect(page.getByText(b, { exact: true })).toBeVisible();
      if (variant === "replay") {
        await expect(page.getByRole("status").filter({ hasText: "Replaying round shortly…" })).toBeVisible();
        await expect(page.getByRole("heading", { name: /words/i })).toHaveCount(0);
      } else {
        await expect(page.getByRole("heading", { name: "Words you could have played" })).toBeVisible();
      }
    });
  }

  test("no suggestions: says so plainly", async ({ page }) => {
    await open(page, "result=nobodytimeout", []);
    await expect(page.getByText("No 4+ letter words start with T and end with H. Tough round.")).toBeVisible();
  });

  test("hold: the bar freezes and says why while the referee reads", async ({ page }) => {
    await open(page, "result=win");
    await expect(page.getByRole("button", { name: /Next round/ })).toBeVisible();
    await page.getByText("“She chipped a tooth on the ice.”").hover();
    await expect(page.getByText("Paused while you read")).toBeVisible();
    const state = await page.locator(".advance-bar > i").evaluate((el) => getComputedStyle(el).animationPlayState);
    expect(state).toBe("paused");
  });

  test("guest sees no Next button", async ({ page }) => {
    await page.route("**/api/words/suggest**", (r) => r.fulfill({ json: { suggestions: SUGGESTIONS } }));
    await page.goto(`/r/${PREVIEW_ROOM}?phase=result&as=guest&result=win`);
    await settle(page);
    await expect(page.getByRole("button", { name: /Next round/ })).toHaveCount(0);
    await expect(page.getByText("Next round in a moment…")).toBeVisible();
  });

  test("long words wrap inside their card", async ({ page }, testInfo) => {
    for (const v of ["win", "split"]) {
      await open(page, `result=${v}&stress=1`);
      await finishAnimations(page);
      await attachScreenshot(page, testInfo, `result-${v}-stress`);
      expect(await findHorizontalOverflow(page)).toEqual([]);
    }
  });

  test("layout: two columns from 1024px", async ({ page }) => {
    await open(page, "result=win");
    const word = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    const sug = (await page.getByRole("heading", { name: "Other words that worked" }).boundingBox())!;
    if (page.viewportSize()!.width >= 1024) expect(sug.x).toBeGreaterThan(word.x + word.width);
    else expect(sug.y).toBeGreaterThan(word.y);
  });

  test("reduced motion: no entrance animation, no hydration mismatch", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors = collectConsoleErrors(page);
    for (const v of ["win", "split"]) {
      await open(page, `result=${v}`);
      const names = await page.locator(".slide-up-in").evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
      expect(names.length).toBeGreaterThan(0);
      expect(names.every((n) => n === "none")).toBe(true);
    }
    // CountUp used to seed from useReducedMotion(), which differs between
    // server and client.
    expectNoErrors(errors);
  });
});
