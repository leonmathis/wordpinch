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
 * F6 daily pinch page with the daily API mocked, so every state renders
 * on every device. The server rules (one try, server clock, board) are
 * tests/e2e/daily.probe.ts.
 */

const NEXT = Date.now() + 5 * 3600_000 + 12 * 60_000;
const NEW = { number: 128, day: "2026-10-31", nextAt: NEXT, streak: 5, state: "new" };
const LETTERS = { start: "Q", end: "N", minLength: 4 };
const PLAYING = { ...NEW, state: "playing", letters: LETTERS, startedAt: 0 };
/** Started 6 s ago, at the moment it is served. */
const playing = () => ({ ...PLAYING, startedAt: Date.now() - 6_000 });
const DONE = {
  ...PLAYING,
  streak: 6,
  state: "done",
  result: {
    word: "queen",
    timeMs: 6800,
    definitions: [],
    players: 1204,
    fasterThan: 72,
    board: [
      { rank: 1, name: "Bartholomew-Alexandria Fitzgeral", word: "queen", timeMs: 2100 },
      { rank: 2, name: "Juno", word: "quoin", timeMs: 2900 },
      { rank: 3, name: "Ada", word: "queen", timeMs: 3400 },
    ],
  },
};

type Mock = { status?: unknown; start?: unknown; startStatus?: number; submit?: (word: string) => [number, unknown] };

async function open(page: Page, m: Mock) {
  const fresh = (v: unknown) => (v === PLAYING ? playing() : v);
  await page.route("**/api/daily", (r: Route) => r.fulfill({ json: fresh(m.status ?? NEW) }));
  await page.route("**/api/daily/start", (r: Route) =>
    r.fulfill({ status: m.startStatus ?? 200, json: m.start ?? playing() })
  );
  await page.route("**/api/daily/submit", (r: Route) => {
    const word = (r.request().postDataJSON() as { word: string }).word;
    const [status, json] = m.submit?.(word) ?? [200, { status: DONE }];
    return r.fulfill({ status, json });
  });
  // Starting signs in (anonymous account); the mock makes that moot.
  await page.route("**/auth/v1/**", (r: Route) => r.fulfill({ status: 500, json: {} }));
  await page.goto("/daily");
  await settle(page);
}

async function clean(page: Page) {
  expect(await findHorizontalOverflow(page)).toEqual([]);
  expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
  expect(await findLowContrast(page, ".wp-root")).toEqual([]);
}

test.describe("daily pinch", () => {
  test("intro: letters hidden, streak, ready", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await open(page, {});
    await expect(page.locator(".wp-chrome")).toContainText("Daily pinch #128");
    await expect(page.getByRole("img", { name: "5-day streak" })).toBeVisible();
    await expect(page.getByRole("img", { name: /Starts with a hidden letter, ends with a hidden letter/ })).toBeVisible();
    await expect(page.getByText("they stay hidden until you're ready")).toBeVisible();
    await attachScreenshot(page, testInfo, "daily-intro");
    await clean(page);
    expectNoErrors(errors.filter((e) => !/auth\/v1|identity/.test(e)));
  });

  test("3 · 2 · 1, then the letters and a running clock", async ({ page }, testInfo) => {
    await open(page, {});
    await page.getByRole("button", { name: "I'm ready" }).click();
    for (const n of [3, 2, 1]) await expect(page.getByRole("status", { name: `Starting in ${n}` })).toBeVisible();
    await expect(page.getByRole("img", { name: "Starts with Q, ends with N" })).toBeVisible();
    const timer = page.getByRole("timer");
    await expect(timer).toHaveText(/^0:0[6-9]$/);
    await expect(timer).not.toHaveText(await timer.textContent() ?? "", { timeout: 3000 });
    await expect(page.getByLabel("Your word, starting with Q and ending with N")).toBeFocused();
    await attachScreenshot(page, testInfo, "daily-play");
    await clean(page);
  });

  test("on phones the word field sits above the system keyboard", async ({ page }) => {
    const vp = page.viewportSize()!;
    test.skip(vp.width >= 768, "phones only");
    await open(page, { status: PLAYING });
    const box = (await page.getByLabel(/Your word/).boundingBox())!;
    const msg = (await page.locator("#daily-message").boundingBox())!;
    console.log(`[daily keyboard] ${test.info().project.name}: message ends ${(msg.y + msg.height).toFixed(0)}, keyboard at ${vp.height - 291}`);
    expect(msg.y + msg.height).toBeLessThanOrEqual(vp.height - 291);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test("a rejected word says why and the clock keeps going", async ({ page }) => {
    const reasons: Record<string, string> = {
      QUE: "too_short",
      QUEENS: "wrong_end",
      QXXN: "not_a_word",
    };
    await open(page, {
      status: PLAYING,
      submit: (w) => (reasons[w] ? [422, { error: reasons[w] }] : [200, { status: DONE }]),
    });
    const input = page.getByLabel(/Your word/);
    const msg = page.locator("#daily-message");
    for (const [word, text] of [
      ["QUE", "Too short, needs at least 4 letters."],
      ["QUEENS", "Has to end with N."],
      ["QXXN", "Not in our word list. Try another one."],
    ] as const) {
      await input.fill(word);
      await input.press("Enter");
      await expect(msg).toHaveText(text);
      await expect(input).toHaveAttribute("aria-invalid", "true");
    }
    // Typing clears it; the locked Q stays first.
    await input.fill("");
    await expect(input).toHaveValue("Q");
    await expect(msg).toHaveText("min 4 letters · Enter to submit");
    await page.keyboard.type("UEEN");
    await input.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "queen" })).toBeVisible();
  });

  test("done: time, comparison, board, share, next pinch", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await open(page, { status: DONE });
    await expect(page.getByRole("heading", { level: 1, name: "queen" })).toBeVisible();
    await expect(page.getByText("6.8 s · 5 letters")).toBeVisible();
    await expect(page.getByText("faster than 72% of the 1,204 people who played today")).toBeVisible();
    const rows = page.getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("Bartholomew-Alexandria Fitzgeral");
    await expect(rows.first()).toContainText("2.1 s");
    // On a phone the long name truncates; the time never does.
    const [name, time] = await Promise.all([
      rows.first().locator("span").nth(1).evaluate((el) => el.scrollWidth > el.clientWidth),
      rows.first().locator("span").nth(3).evaluate((el) => el.scrollWidth <= el.clientWidth),
    ]);
    expect(time).toBe(true);
    if (page.viewportSize()!.width < 768) expect(name).toBe(true);
    await expect(page.getByRole("timer", { name: "Time until the next daily pinch" })).toHaveText(/^next pinch in 0[45]:\d\d:\d\d$/);
    await expect(page.getByRole("img", { name: "6-day streak" })).toBeVisible();
    await attachScreenshot(page, testInfo, "daily-done");
    await clean(page);
    expectNoErrors(errors);
  });

  test("first one today", async ({ page }) => {
    await open(page, { status: { ...DONE, result: { ...DONE.result, players: 1, fasterThan: 100, board: DONE.result.board.slice(0, 1) } } });
    await expect(page.getByText("You're the first one today.")).toBeVisible();
  });

  test("no account: says so instead of starting", async ({ page }) => {
    await open(page, { startStatus: 401, start: { error: "Not signed in" } });
    await page.getByRole("button", { name: "I'm ready" }).click();
    await expect(page.locator(".wp-body").getByRole("alert")).toContainText("needs a player account", { timeout: 6000 });
  });

  test("the landing tile opens it", async ({ page }) => {
    await page.route("**/api/daily", (r) => r.fulfill({ json: NEW }));
    await page.goto("/");
    await page.locator('[data-landing="modes"]:visible').getByRole("button", { name: /Daily/ }).click();
    await page.waitForURL(/\/daily$/);
    await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", "daily");
  });
});
