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

async function open(page: Page, phase: string, extra = "") {
  await page.goto(`/r/${PREVIEW_ROOM}?phase=${phase}&as=spectator${extra}`);
  await settle(page);
  await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", phase);
}

const PHASES = ["lobby", "pick", "reveal", "race", "result", "matchend"] as const;

test.describe("spectator", () => {
  for (const phase of PHASES) {
    test(`${phase}: banner in flow, clean render`, async ({ page }, testInfo) => {
      const errors = collectConsoleErrors(page);
      await open(page, phase);
      const banner = page.getByRole("status").filter({ hasText: "You’re watching. Both seats are taken." });
      await expect(banner).toBeVisible();
      await expect(banner).toContainText("3 here");
      // In normal flow: below the top bar, not overlapping it.
      const bar = (await page.locator(".wp-chrome").boundingBox())!;
      const b = (await banner.boundingBox())!;
      expect(b.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
      expect(await banner.evaluate((el) => getComputedStyle(el.parentElement!).position)).not.toBe("absolute");
      await finishAnimations(page);
      await attachScreenshot(page, testInfo, `spectator-${phase}`);
      expect(await findHorizontalOverflow(page)).toEqual([]);
      expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
      expect(await findLowContrast(page, ".wp-root")).toEqual([]);
      expectNoErrors(errors);
    });
  }

  test("lobby: code, players, not started", async ({ page }) => {
    await open(page, "lobby");
    await expect(page.getByText(PREVIEW_ROOM, { exact: true })).toBeVisible();
    await expect(page.getByText("the match hasn’t started yet")).toBeVisible();
    await expect(page.getByRole("region", { name: "Players" })).toContainText("Leon");
    await expect(page.getByRole("region", { name: "Players" })).toContainText("Juno");
  });

  test("pick: two hidden letters, who picks which end", async ({ page }) => {
    await open(page, "pick");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Both arepicking letters…");
    await expect(page.getByText("Leon · first")).toBeVisible();
    await expect(page.getByText("Juno · last")).toBeVisible();
    await expect(page.locator(".wp-body [data-shape='ring']")).toHaveCount(2);
  });

  test("race: real per-player state, not 'typing'", async ({ page }) => {
    await open(page, "race");
    await expect(page.getByText("Leon is in the round")).toBeVisible();
    await expect(page.getByText("Juno is in the round")).toBeVisible();
    await expect(page.getByText(/typing/)).toHaveCount(0);
    await expect(page.getByText("words stay secret until the round ends")).toBeVisible();
    await expect(page.getByRole("timer")).toHaveText("30");
    await open(page, "race", "&opp=submitted");
    await expect(page.getByText("Juno submitted a word")).toBeVisible();
    await expect(page.getByText("Leon is in the round")).toBeVisible();
    await open(page, "race", "&away=1");
    await expect(page.getByText("Juno is offline")).toBeVisible();
    await expect(page.locator(".wp-chrome")).toContainText("Round 3 of 7 · Leon 2 · 1 Juno");
  });

  test("result: word, time and both scores", async ({ page }) => {
    await page.route("**/api/words/suggest**", (r) => r.fulfill({ json: { suggestions: [] } }));
    await open(page, "result");
    await expect(page.getByText("Leon won round 3", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "tooth" })).toBeVisible();
    await expect(page.getByText("/tuːθ/ · 2.4 s")).toBeVisible();
  });

  test("match end: winner first, rounds table", async ({ page }) => {
    await open(page, "matchend", "&end=loss");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Junopinched it!");
    const pills = page.locator(".wp-body .rounded-full.text-\\[28px\\]");
    await expect(pills.nth(0)).toHaveText("Juno 4");
    await expect(pills.nth(1)).toHaveText("Leon 3");
    await expect(page.getByRole("table", { name: "Rounds" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Rematch|Waiting/ })).toHaveCount(0);
  });

  test("layout: one column at most 720px on desktop", async ({ page }) => {
    await open(page, "race");
    test.skip(page.viewportSize()!.width < 1024, "desktop only");
    expect((await page.locator(".wp-frame").boundingBox())!.width).toBeLessThanOrEqual(720);
  });
});
