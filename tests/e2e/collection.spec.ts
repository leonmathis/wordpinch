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
 * F2 word collection: the /collection page (GET /api/collection is mocked,
 * so no account is needed), the result-screen bookmark and the match-end
 * banner via the dev preview. The live flow over Supabase is
 * tests/e2e/collection.probe.ts.
 */

const today = new Date();
const daysAgo = (n: number, hour = 12) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - n, hour);
  return d.toISOString();
};
const def = (definition: string) => [{ partOfSpeech: "noun", definition }];

const WORDS = [
  { word: "tooth", definitions: def("One of the hard white structures in the mouth."), source: "won", opponent: "Juno", time_ms: 2400, created_at: daysAgo(0) },
  { word: "shrimp", definitions: def("A small free-swimming crustacean with an elongated body."), source: "saved", opponent: "Juno", time_ms: null, created_at: daysAgo(1) },
  { word: "glove", definitions: def("A covering for the hand with separate parts for each finger."), source: "won", opponent: "Juno", time_ms: 3100, created_at: daysAgo(1, 9) },
  { word: "brisk", definitions: def("Active, fast and energetic."), source: "won", opponent: "Ada", time_ms: 5200, created_at: daysAgo(2) },
  { word: "plank", definitions: def("A long, thin, flat piece of timber."), source: "saved", opponent: "Juno", time_ms: null, created_at: daysAgo(4) },
  { word: "queen", definitions: [], source: "won", opponent: null, time_ms: 6800, created_at: daysAgo(4) },
];

const STRESS = [
  {
    word: "straightforwardness",
    definitions: def("The quality of being honest and easy to understand, without any hidden meaning, ".repeat(3)),
    source: "won",
    opponent: "Bartholomew-Alexandria Fitzgeral",
    time_ms: 299_900,
    created_at: daysAgo(0),
  },
  {
    word: "incomprehensibilities",
    definitions: def("Things that cannot be understood."),
    source: "saved",
    opponent: "Maximiliana Wolkenstein-Haberlin",
    time_ms: null,
    created_at: daysAgo(0),
  },
];

async function openCollection(page: Page, body: unknown, status = 200) {
  await page.route("**/api/collection", (r) =>
    r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
  );
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("wordpinch:v1:name", "Leon"));
  await page.goto("/collection");
  await settle(page);
}

const cards = (page: Page) => page.locator(".wp-body ul > li");

test.describe("collection page", () => {
  const VIEWS = {
    full: { words: WORDS },
    empty: { words: [] },
    stress: { words: STRESS },
  } as const;

  for (const [view, body] of Object.entries(VIEWS)) {
    test(`${view}: renders cleanly`, async ({ page }, testInfo) => {
      const errors = collectConsoleErrors(page);
      await openCollection(page, body);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        view === "empty" ? "nothing pinched yet" : `${body.words.length} pinched so far`
      );
      await attachScreenshot(page, testInfo, `collection-${view}`);
      expect(await findHorizontalOverflow(page)).toEqual([]);
      expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
      expect(await findLowContrast(page, ".wp-root")).toEqual([]);
      expectNoErrors(errors);
    });
  }

  test("stats, cards and filter", async ({ page }, testInfo) => {
    await openCollection(page, { words: WORDS });
    await expect(page.getByText("Leon", { exact: true })).toBeVisible();
    const stats = page.locator(".wp-body .grid-cols-3 > div");
    await expect(stats.nth(0)).toHaveText("6words");
    await expect(stats.nth(1)).toHaveText("2.4 sfastest");
    // Today, yesterday, two days ago; four days ago is after a gap.
    await expect(stats.nth(2)).toHaveText("3day streak");

    await expect(cards(page)).toHaveCount(6);
    const first = cards(page).first();
    await expect(first).toContainText("tooth");
    await expect(first).toContainText("won");
    await expect(first).toContainText(`vs Juno · 2.4 s · ${today.getDate()}.${today.getMonth() + 1}.`);
    await expect(cards(page).nth(1)).toContainText("saved from Juno");
    // No opponent, no meaning: the meta line drops the name, and the card says so.
    await expect(cards(page).nth(5)).toContainText("No meaning saved for this one.");
    await expect(cards(page).nth(5)).toContainText(/^.*won.*6\.8 s · \d+\.\d+\.$/);

    // Anchor letters: first and last letter coloured, middle in ink.
    const colours = await first.locator("span").first().evaluate((el) => {
      const [a, , z] = [el.children[0], null, el.children[1]] as Element[];
      return { a: getComputedStyle(a).color, z: getComputedStyle(z).color, ink: getComputedStyle(el).color };
    });
    expect(colours.a).not.toBe(colours.ink);
    expect(colours.z).not.toBe(colours.ink);
    expect(colours.a).not.toBe(colours.z);

    const filter = page.getByRole("group", { name: "Filter words" });
    await filter.getByRole("button", { name: "Won" }).click();
    await expect(cards(page)).toHaveCount(4);
    for (const t of await cards(page).allTextContents()) expect(t).toContain("won");
    await filter.getByRole("button", { name: "Saved" }).click();
    await expect(cards(page)).toHaveCount(2);
    await expect(cards(page).first()).toContainText("shrimp");
    await attachScreenshot(page, testInfo, "collection-saved");
    await filter.getByRole("button", { name: "All" }).click();
    await expect(cards(page)).toHaveCount(6);

    // Desktop shows three cards per row, phones one.
    const lefts = new Set(await cards(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left))));
    const width = page.viewportSize()!.width;
    expect(lefts.size).toBe(width >= 1024 ? 3 : 1);
  });

  test("a filter with no words says how to get one", async ({ page }) => {
    await openCollection(page, { words: WORDS.filter((w) => w.source === "won") });
    await page.getByRole("group", { name: "Filter words" }).getByRole("button", { name: "Saved" }).click();
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("No saved words yet. Tap the bookmark on a round result to keep one.");
  });

  test("empty state leads back to a game", async ({ page }) => {
    await openCollection(page, { words: [] });
    await expect(page.getByText("Win a round, or tap the bookmark on any word")).toBeVisible();
    await page.getByRole("link", { name: "Play a game" }).click();
    await page.waitForURL((u) => u.pathname === "/");
  });

  test("a failed load offers a retry", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/collection", (r) => {
      calls += 1;
      return calls === 1
        ? r.fulfill({ status: 500, contentType: "application/json", body: "{}" })
        : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ words: WORDS }) });
    });
    await page.goto("/collection");
    await expect(page.locator(".wp-body").getByRole("alert")).toContainText("Couldn't load your words");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(cards(page)).toHaveCount(6);
  });

  test("the landing bookmark opens it, and back returns", async ({ page }) => {
    await page.route("**/api/collection", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ words: [] }) })
    );
    await page.goto("/");
    const link = page.getByRole("link", { name: "Your word collection" });
    await expect(link).toBeVisible();
    // Circles, like the gear (a bare buttonVariants() once left them square).
    const radius = (l: typeof link) => l.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
    expect(await radius(link)).toBeGreaterThanOrEqual(22);
    await link.click();
    await page.waitForURL(/\/collection$/);
    expect(await radius(page.getByRole("link", { name: "Back to start" }))).toBeGreaterThanOrEqual(22);
    await page.getByRole("link", { name: "Back to start" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    // Not inside a room: the top bar there keeps only the gear.
    await page.goto(`/r/${PREVIEW_ROOM}?phase=lobby&as=host`);
    await expect(page.getByRole("link", { name: "Your word collection" })).toHaveCount(0);
  });
});

test.describe("result bookmark", () => {
  const open = (page: Page, as: "host" | "guest" | "spectator", result = "win") =>
    page.goto(`/r/${PREVIEW_ROOM}?phase=result&as=${as}&result=${result}`);

  test("the winner's word is already collected", async ({ page }) => {
    await open(page, "host");
    const b = page.getByRole("button", { name: "In your word collection" });
    await expect(b).toHaveAttribute("aria-pressed", "true");
  });

  test("the other player saves it with a tap", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await open(page, "guest");
    const b = page.getByRole("button", { name: "Save to your word collection" });
    await expect(b).toHaveAttribute("aria-pressed", "false");
    await b.click();
    await expect(page.getByRole("button", { name: "In your word collection" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await attachScreenshot(page, testInfo, "result-saved");
    expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
    expect(await findLowContrast(page, ".wp-root")).toEqual([]);
    expectNoErrors(errors);
  });

  test("spectators and wordless results have no bookmark", async ({ page }) => {
    await open(page, "spectator");
    await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", /result|spectator/);
    await expect(page.getByRole("button", { name: /word collection/ })).toHaveCount(0);
    for (const r of ["nearmiss", "split", "nobody", "forfeit", "replay"]) {
      await open(page, "host", r);
      await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", "result");
      await expect(page.getByRole("button", { name: /word collection/ }), r).toHaveCount(0);
    }
  });
});

test.describe("match-end banner", () => {
  test("counts this match's new words and links to the collection", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/r/${PREVIEW_ROOM}?phase=matchend&as=host&end=win&collected=3`);
    await settle(page);
    const banner = page.getByRole("link", { name: "3 new words in your collection" });
    await expect(banner).toBeVisible();
    await attachScreenshot(page, testInfo, "matchend-collected");
    expect(await findHorizontalOverflow(page)).toEqual([]);
    expect(await findLowContrast(page, ".wp-root")).toEqual([]);
    expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
    await page.goto(`/r/${PREVIEW_ROOM}?phase=matchend&as=host&end=win&collected=1`);
    await expect(page.getByRole("link", { name: "1 new word in your collection" })).toBeVisible();
    await page.goto(`/r/${PREVIEW_ROOM}?phase=matchend&as=host&end=win`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /in your collection/ })).toHaveCount(0);
  });

  test("stress names keep the banner inside the column", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/r/${PREVIEW_ROOM}?phase=matchend&as=host&end=tie&stress=1&collected=12`);
    await settle(page);
    await expect(page.getByRole("link", { name: "12 new words in your collection" })).toBeVisible();
    expect(await findHorizontalOverflow(page)).toEqual([]);
  });
});
