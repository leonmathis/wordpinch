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
  flowerClearance,
  settle,
} from "./helpers";

async function open(page: Page, query: string) {
  // Confetti draws on a full-screen canvas; off for stable checks.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/r/${PREVIEW_ROOM}?phase=matchend&${query}`);
  await settle(page);
  await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", "matchend");
}

const VIEWS = {
  win: "as=host&end=win",
  loss: "as=host&end=loss",
  tie: "as=host&end=tie",
  guest: "as=guest&end=win",
  away: "as=host&end=win&away=1",
  "rounds-15": "as=host&end=win&rounds=15",
  stress: "as=host&end=tie&stress=1",
} as const;

test.describe("match end", () => {
  for (const [view, query] of Object.entries(VIEWS)) {
    test(`${view}: renders cleanly`, async ({ page }, testInfo) => {
      const errors = collectConsoleErrors(page);
      await open(page, query);
      await finishAnimations(page);
      await attachScreenshot(page, testInfo, `matchend-${view}`);
      expect(await findHorizontalOverflow(page)).toEqual([]);
      expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
      expect(await findLowContrast(page, ".wp-root")).toEqual([]);
      const clear = await flowerClearance(page, ".wp-body");
      expect(clear).toHaveLength(2);
      console.log(`[flowers] ${testInfo.project.name} ${view}: ${clear.map((x) => x.toFixed(1)).join(", ")}`);
      for (const c of clear) expect(c, `flower label clearance ${clear.map((x) => x.toFixed(1))}`).toBeGreaterThanOrEqual(12);
      expectNoErrors(errors);
    });
  }

  test("headlines and flower colours per outcome", async ({ page }) => {
    const fills = () =>
      page.locator(".wp-body [data-shape='flower']:visible > svg g").evaluateAll((gs) => gs.map((g) => getComputedStyle(g).fill));
    await open(page, VIEWS.win);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Youpinched it!");
    await expect(page.getByText("confetti")).toBeVisible();
    const [yellow, pink] = await fills();
    expect(yellow).not.toBe(pink);
    await open(page, VIEWS.loss);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Junopinched it, rematch?");
    await expect(page.getByText("confetti")).toHaveCount(0);
    const [cream, winner] = await fills();
    expect(winner).toBe(yellow);
    expect(cream).not.toBe(yellow);
    await open(page, VIEWS.tie);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dead heat!nobody blinks");
    const both = await fills();
    expect(both).toEqual([yellow, yellow]);
    await expect(page.locator(".wp-body [data-shape='flower']:visible").first()).toContainText("3.5");
  });

  test("awards: fastest and longest from the words played", async ({ page }) => {
    await open(page, VIEWS.win);
    const fastest = page.getByRole("group", { name: "Fastest" });
    await expect(fastest).toContainText("tooth");
    await expect(fastest).toContainText("Leon · 2.4 s");
    const longest = page.getByRole("group", { name: "Longest" });
    await expect(longest).toContainText("shrimp");
    await expect(longest).toContainText("Juno · 6 letters");
  });

  test("rounds table: one row per round, outcome rows, slower side muted", async ({ page }) => {
    await open(page, VIEWS.win);
    const table = page.getByRole("table", { name: "Rounds" });
    await expect(table.getByRole("row")).toHaveCount(8);
    await expect(table.getByText("out of time, nobody scored")).toBeVisible();
    const row3 = table.getByRole("row").nth(3);
    await expect(row3).toContainText("tooth");
    await expect(row3).toContainText("teeth");
    const [fast, slow] = await row3.locator(".uppercase").evaluateAll((els) => els.map((e) => getComputedStyle(e).fontWeight));
    expect(Number(fast)).toBeGreaterThan(Number(slow));
    await open(page, VIEWS["rounds-15"]);
    await expect(table.getByRole("row")).toHaveCount(16);
    await expect(table.getByText("Juno won, Leon left the round")).toBeVisible();
    await expect(table.getByText("out of time, both scored")).toBeVisible();
    await expect(table.getByText("no word played")).toBeVisible();
  });

  test("buttons: rematch for the referee, waiting states otherwise", async ({ page }) => {
    await open(page, VIEWS.win);
    await expect(page.getByRole("button", { name: "Rematch" })).toBeEnabled();
    await expect(page.getByRole("link", { name: "Leave room" })).toHaveAttribute("href", "/");
    await open(page, VIEWS.guest);
    await expect(page.getByRole("button", { name: "Waiting for Leon…" })).toBeDisabled();
    await open(page, VIEWS.away);
    await expect(page.getByRole("button", { name: "Waiting for Juno to come back…" })).toBeDisabled();
  });

  test("top bar: match over with every pill filled", async ({ page }) => {
    await open(page, VIEWS.win);
    await expect(page.locator(".wp-chrome")).toContainText("Match over · 7 rounds");
    const ops = await page.locator(".wp-chrome [aria-hidden] > span").evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
    expect(ops).toEqual(Array(7).fill("1"));
  });

  test("layout: table beside the summary from 1024px", async ({ page }) => {
    await open(page, VIEWS.win);
    const head = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    const table = (await page.getByRole("table", { name: "Rounds" }).boundingBox())!;
    const rematch = (await page.getByRole("button", { name: "Rematch" }).boundingBox())!;
    if (page.viewportSize()!.width >= 1024) {
      expect(table.x).toBeGreaterThan(head.x + head.width);
      expect(rematch.x + rematch.width).toBeLessThan(table.x);
    } else {
      expect(rematch.y).toBeGreaterThan(table.y + table.height);
    }
  });
});
