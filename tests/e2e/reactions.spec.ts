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

/**
 * F3 reactions, cheers and the opponent's letter count, via the dev
 * preview (`rx=` stands in for an incoming reaction, `typed=` for the
 * opponent's count). The live flow over Supabase is reactions.probe.ts.
 */

async function open(page: Page, query: string) {
  await page.goto(`/r/${PREVIEW_ROOM}?${query}`);
  await settle(page);
}

const bubble = (page: Page) => page.locator(".fx-bubble");

test.describe("race reactions", () => {
  const VIEWS = {
    plain: "phase=race&as=host",
    incoming: "phase=race&as=host&rx=close&typed=4&peek=1",
    cheer: "phase=race&as=guest&rx=go-guest&typed=7",
    stress: "phase=race&as=host&stress=1&rx=gg&typed=19",
  } as const;

  for (const [view, query] of Object.entries(VIEWS)) {
    test(`${view}: renders cleanly`, async ({ page }, testInfo) => {
      const errors = collectConsoleErrors(page);
      await open(page, query);
      await expect(page.getByRole("group", { name: "Reactions" }).getByRole("button")).toHaveCount(3);
      await attachScreenshot(page, testInfo, `race-fx-${view}`);
      expect(await findHorizontalOverflow(page)).toEqual([]);
      expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
      expect(await findLowContrast(page, ".wp-root")).toEqual([]);
      expectNoErrors(errors);
    });
  }

  test("incoming reaction: a bubble above the opponent line, and the letter count", async ({ page }) => {
    await open(page, VIEWS.incoming);
    await expect(bubble(page)).toHaveText("ooh close!");
    await expect(page.getByText("Juno is in the round")).toBeVisible();
    await expect(page.getByText("4 letters", { exact: true })).toBeVisible();
    // Screen readers hear who sent it.
    await expect(page.locator("[aria-live='polite']").filter({ hasText: "Juno: ooh close!" })).toHaveCount(1);
    // The bubble sits on the line's top edge, clear of the input above it.
    const line = await page.getByText("Juno is in the round").locator("..").boundingBox();
    const b = await bubble(page).boundingBox();
    const input = await page.getByLabel(/Your word/).boundingBox();
    expect(b!.y + b!.height).toBeGreaterThan(line!.y);
    expect(b!.y).toBeLessThan(line!.y);
    console.log(`[bubble] ${test.info().project.name}: bubble top ${b!.y.toFixed(0)}, input bottom ${(input!.y + input!.height).toFixed(0)}`);
  });

  test("a rejected word's message is never covered", async ({ page }) => {
    await open(page, VIEWS.incoming);
    await expect(bubble(page)).toBeVisible();
    const input = page.getByLabel(/Your word/);
    await input.press("End");
    await input.pressSequentially("OO");
    await input.press("Enter");
    await expect(page.locator("#race-message")).toHaveText(/Too short/);
    await expect(bubble(page)).toHaveCount(0);
    // Typing clears the message, and the bubble may come back.
    await input.pressSequentially("T");
    await expect(page.locator("#race-message")).not.toHaveText(/Too short/);
    await expect(bubble(page)).toBeVisible();
  });

  test("a cheer from a spectator shows in the race too", async ({ page }) => {
    await open(page, VIEWS.cheer);
    await expect(bubble(page)).toHaveText("go Juno!");
    await expect(page.locator("[aria-live='polite']").filter({ hasText: "Someone watching: go Juno!" })).toHaveCount(1);
    await expect(page.getByText("7 letters", { exact: true })).toBeVisible();
  });

  test("one letter, or a submitted word, shows no count", async ({ page }) => {
    await open(page, "phase=race&as=host&typed=1");
    await expect(page.getByText(/\d+ letters?$/)).toHaveCount(0);
    await open(page, "phase=race&as=host&typed=6&opp=submitted");
    await expect(page.getByText("checking…")).toBeVisible();
    await expect(page.getByText("6 letters")).toHaveCount(0);
    await open(page, "phase=race&as=host&typed=6&away=1");
    await expect(page.getByText("6 letters")).toHaveCount(0);
  });

  test("on phones everything sits above the system keyboard", async ({ page }) => {
    const vp = page.viewportSize()!;
    test.skip(vp.width >= 768, "phones only");
    await open(page, VIEWS.incoming);
    // The reactions and (with peek on) the peek pill share one row.
    const pills = await page.locator("[data-race-actions]").boundingBox();
    const limit = vp.height - 291;
    console.log(`[keyboard] ${test.info().project.name}: reactions end at ${(pills!.y + pills!.height).toFixed(0)}, keyboard starts at ${limit}`);
    expect(pills!.y + pills!.height).toBeLessThanOrEqual(limit);
  });

  test("tapping a reaction keeps the word input focused", async ({ page }) => {
    await open(page, VIEWS.plain);
    const input = page.getByLabel(/Your word/);
    await input.focus();
    await input.press("End");
    await input.pressSequentially("OO");
    await page.getByRole("button", { name: "ooh close" }).click();
    // The pills don't steal the tap-to-focus of the race frame, and the
    // row rests briefly after a tap.
    await expect(page.getByRole("button", { name: "gg" })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("button", { name: "gg" })).not.toHaveAttribute("aria-disabled", "true", { timeout: 3000 });
    await expect(input).toHaveValue("TOO");
    await expect(input).toBeFocused();
  });

  test("the bubble fades on its own, and only fades under reduced motion", async ({ page }) => {
    await open(page, VIEWS.incoming);
    const anim = () =>
      bubble(page).evaluate((el) => {
        el.removeAttribute("data-hold");
        const cs = getComputedStyle(el);
        return { name: cs.animationName, ms: parseFloat(cs.animationDuration) * 1000, fill: cs.animationFillMode };
      });
    expect(await anim()).toEqual({ name: "fx-bubble", ms: 2800, fill: "both" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await anim()).name).toBe("fx-bubble-fade");
  });
});

test.describe("spectator cheers", () => {
  test("cheer buttons name the players and render cleanly", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await open(page, "phase=race&as=spectator&rx=close&typed=5");
    const cheers = page.getByRole("group", { name: "Cheers" }).getByRole("button");
    await expect(cheers).toHaveText(["go Leon!", "go Juno!", "ooh"]);
    await expect(page.getByText("Cheer from the sidelines")).toBeVisible();
    await expect(bubble(page)).toHaveText("ooh close!");
    await expect(page.getByText("5 letters", { exact: true })).toBeVisible();
    await attachScreenshot(page, testInfo, "spectator-cheers");
    expect(await findHorizontalOverflow(page)).toEqual([]);
    expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
    expect(await findLowContrast(page, ".wp-root")).toEqual([]);
    expectNoErrors(errors);
  });

  for (const phase of ["lobby", "pick", "result", "matchend"] as const) {
    test(`${phase}: cheers stay available`, async ({ page }) => {
      await open(page, `phase=${phase}&as=spectator&stress=1`);
      await expect(page.getByRole("group", { name: "Cheers" }).getByRole("button")).toHaveCount(3);
      expect(await findHorizontalOverflow(page)).toEqual([]);
    });
  }

  test("players get reactions, not cheers", async ({ page }) => {
    await open(page, "phase=race&as=guest");
    await expect(page.getByRole("group", { name: "Cheers" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Reactions" }).getByRole("button")).toHaveText(["psst, hurry", "ooh close", "gg"]);
  });
});
