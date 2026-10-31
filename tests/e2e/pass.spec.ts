import { expect, test, type Page, type Route } from "@playwright/test";
import {
  attachScreenshot,
  collectConsoleErrors,
  expectNoErrors,
  findHorizontalOverflow,
  findLowContrast,
  findSmallTargets,
  flowerClearance,
  settle,
} from "./helpers";

/**
 * F8 pass the phone: a local game, so the whole flow runs here with the
 * letter pair and the word check mocked, and Playwright's clock deciding
 * the turn times.
 */

const PAIRS = [["T", "H"], ["S", "O"], ["Q", "N"], ["G", "E"], ["B", "K"]];
const WORDS = new Set(["tooth", "teeth", "solo", "sago", "queen", "quoin", "glove", "grape", "brisk", "brick"]);

async function open(page: Page) {
  let n = 0;
  await page.route("**/api/words/pair**", (r: Route) => {
    const [start, end] = PAIRS[n++ % PAIRS.length];
    return r.fulfill({ json: { start, end } });
  });
  await page.route("**/api/words/validate", (r: Route) => {
    const { word } = r.request().postDataJSON() as { word: string };
    return r.fulfill({ json: { valid: WORDS.has(word), word, source: WORDS.has(word) ? "wordlist" : "rejected" } });
  });
  await page.clock.install();
  await page.goto("/pass");
  await settle(page);
  // Time only moves with runFor, so typing doesn't add to a turn's time.
  await page.clock.pauseAt(Date.now() + 1000);
}

async function clean(page: Page) {
  expect(await findHorizontalOverflow(page)).toEqual([]);
  expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
  expect(await findLowContrast(page, ".wp-root")).toEqual([]);
}

/** One turn: tap "I'm X", wait `ms`, play `word` (or let the clock run out). */
async function turn(page: Page, who: string, word: string | null, ms: number) {
  await page.getByRole("button", { name: `I'm ${who}, tap when ready` }).click();
  const input = page.getByLabel(/Your word, starting with/);
  await expect(input).toBeFocused();
  await page.clock.runFor(ms);
  if (word) {
    await input.fill(word.toUpperCase());
    await input.press("Enter");
  }
}

test.describe("pass the phone", () => {
  test("setup: names, how it works, start", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await open(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("one device, two rivals");
    await expect(page.getByText("You take turns.")).toBeVisible();
    await page.getByLabel("Player 1 name").fill("Ann");
    await page.getByLabel("Player 2 name").fill("Bo");
    await attachScreenshot(page, testInfo, "pass-setup");
    await clean(page);
    await page.getByRole("button", { name: "Start · 5 rounds" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hand the phoneto Ann");
    expectNoErrors(errors);
  });

  test("handoff: big flower button, label clear of the scallops", async ({ page }, testInfo) => {
    await open(page);
    await page.getByLabel("Player 1 name").fill("Ann");
    await page.getByLabel("Player 2 name").fill("Bo");
    await page.getByRole("button", { name: "Start · 5 rounds" }).click();
    await expect(page.getByText("no peeking, Bo!")).toBeVisible();
    const clear = await flowerClearance(page, ".wp-body");
    console.log(`[handoff flower] ${test.info().project.name}: ${clear.map((c) => c.toFixed(1)).join(", ")}`);
    expect(clear.length).toBe(1);
    expect(clear[0]).toBeGreaterThanOrEqual(12);
    await attachScreenshot(page, testInfo, "pass-handoff");
    await clean(page);
  });

  test("a full match: hidden times, faster word wins, match end", async ({ page }, testInfo) => {
    await open(page);
    await page.getByLabel("Player 1 name").fill("Ann");
    await page.getByLabel("Player 2 name").fill("Bo");
    await page.getByRole("button", { name: "Start · 5 rounds" }).click();

    // Round 1: Ann first (3 s), then Bo (5 s): Ann takes it.
    await turn(page, "Ann", "tooth", 3000);
    await expect(page.getByText("Ann's word and time stay hidden until you've played too.")).toBeVisible();
    await page.getByRole("button", { name: "I'm Bo, tap when ready" }).click();
    await expect(page.getByText("Ann played · time hidden")).toBeVisible();
    // Nothing of Ann's word is on screen during Bo's turn.
    expect(await page.locator("body").innerText()).not.toMatch(/TOOTH|3\.0 s/i);
    await page.clock.runFor(5000);
    await page.getByLabel(/Your word/).fill("TEETH");
    await page.getByLabel(/Your word/).press("Enter");
    await expect(page.getByText("Ann took round 1")).toBeVisible();
    await expect(page.getByText("3.0 s · winner")).toBeVisible();
    await expect(page.getByText("5.0 s", { exact: true })).toBeVisible();
    await attachScreenshot(page, testInfo, "pass-result");
    await clean(page);

    // Round 2: Bo goes first now; Ann runs out of time.
    await page.getByRole("button", { name: /Next round/ }).click();
    await expect(page.locator(".wp-chrome")).toContainText("Round 2 of 5 · Ann 1 · 0 Bo");
    await turn(page, "Bo", "solo", 2000);
    await turn(page, "Ann", null, 31_000);
    await expect(page.getByText("Bo took round 2")).toBeVisible();
    await expect(page.getByText("out of time")).toBeVisible();

    // Rounds 3–5: equal times split; then Ann twice.
    await page.getByRole("button", { name: /Next round/ }).click();
    await turn(page, "Ann", "queen", 4000);
    await turn(page, "Bo", "quoin", 4000);
    await expect(page.getByText("Tied round 3: both score")).toBeVisible();
    for (const [a, b] of [["glove", "grape"], ["brisk", "brick"]]) {
      await page.getByRole("button", { name: /Next round|See who won/ }).click();
      const first = (await page.getByRole("heading", { level: 1 }).textContent())!.includes("Ann") ? "Ann" : "Bo";
      await turn(page, first, first === "Ann" ? a : b, first === "Ann" ? 1000 : 6000);
      const second = first === "Ann" ? "Bo" : "Ann";
      await turn(page, second, second === "Ann" ? a : b, second === "Ann" ? 1000 : 6000);
    }
    await page.getByRole("button", { name: "See who won" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Annpinched it!");
    await expect(page.getByText("Ann 4")).toBeVisible();
    await expect(page.getByText("Bo 2")).toBeVisible();
    await expect(page.getByRole("list", { name: "Rounds" }).getByRole("listitem")).toHaveCount(5);
    await attachScreenshot(page, testInfo, "pass-end");
    await clean(page);
    await page.getByRole("button", { name: "Play again" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hand the phoneto Ann");
  });

  test("rejections say why and the clock keeps going", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Start · 5 rounds" }).click();
    await page.getByRole("button", { name: /tap when ready/ }).click();
    const input = page.getByLabel(/Your word/);
    const msg = page.locator("#pass-message");
    for (const [w, text] of [
      ["TOT", "Too short, needs at least 4 letters."],
      ["TOOTS", "Has to end with H."],
      ["TXXH", "Not in our word list. Try another one."],
    ]) {
      await input.fill(w);
      await input.press("Enter");
      await expect(msg).toHaveText(text);
    }
    await expect(page.getByRole("timer")).toHaveAccessibleName("30 seconds left");
    await page.clock.runFor(4000);
    await expect(page.getByRole("timer")).toHaveAccessibleName("26 seconds left");
  });

  test("on phones the turn sits above the system keyboard", async ({ page }) => {
    const vp = page.viewportSize()!;
    test.skip(vp.width >= 768, "phones only");
    await open(page);
    await page.getByRole("button", { name: "Start · 5 rounds" }).click();
    await page.getByRole("button", { name: /tap when ready/ }).click();
    const msg = (await page.locator("#pass-message").boundingBox())!;
    console.log(`[pass keyboard] ${test.info().project.name}: message ends ${(msg.y + msg.height).toFixed(0)}, keyboard at ${vp.height - 291}`);
    expect(msg.y + msg.height).toBeLessThanOrEqual(vp.height - 291);
  });

  test("stress: 32-character names wrap or truncate, nothing overflows", async ({ page }, testInfo) => {
    await open(page);
    await page.getByLabel("Player 1 name").fill("Maximiliana Wolkenstein-Haberlin");
    await page.getByLabel("Player 2 name").fill("Bartholomew-Alexandria Fitzgeral");
    await page.getByRole("button", { name: "Start · 5 rounds" }).click();
    // Sentences use the first name only, so the flower stays on screen.
    await expect(page.getByText("no peeking, Bartholomew-Alexandria!")).toBeVisible();
    const flower = (await page.getByRole("button", { name: /tap when ready/ }).boundingBox())!;
    expect(flower.y + flower.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await clean(page);
    const clear = await flowerClearance(page, ".wp-body");
    expect(clear[0]).toBeGreaterThanOrEqual(12);
    await attachScreenshot(page, testInfo, "pass-handoff-stress");
    await turn(page, "Maximiliana", "tooth", 1000);
    await turn(page, "Bartholomew-Alexandria", "teeth", 2000);
    await clean(page);
    await attachScreenshot(page, testInfo, "pass-result-stress");
  });

  test("the landing tile opens it", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-landing="modes"]:visible').getByRole("button", { name: /Pass the/ }).click();
    await page.waitForURL(/\/pass$/);
    await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", "pass");
  });
});
