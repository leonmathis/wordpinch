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

/** Height of the iOS system keyboard the design reserves (02 §Race). */
const KEYBOARD = 291;

async function open(page: Page, phase: string, query: string) {
  await page.goto(`/r/${PREVIEW_ROOM}?phase=${phase}&${query}`);
  await settle(page);
}

const input = (page: Page) => page.getByLabel("Your word, starting with T and ending with H");
const message = (page: Page) => page.locator("#race-message");
const timer = (page: Page) => page.getByRole("timer");

async function clean(page: Page, errors: string[]) {
  await finishAnimations(page);
  expect(await findHorizontalOverflow(page)).toEqual([]);
  expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
  expect(await findLowContrast(page, ".wp-root")).toEqual([]);
  expectNoErrors(errors);
}

test.describe("race", () => {
  for (const [view, query] of Object.entries({
    typing: "as=host",
    paused: "as=host&away=1",
    "opp-submitted": "as=guest&opp=submitted",
    stress: "as=host&stress=1",
  })) {
    test(`${view}: renders cleanly`, async ({ page }, testInfo) => {
      const errors = collectConsoleErrors(page);
      await open(page, "race", query);
      await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", "race");
      if (view === "stress") await input(page).fill("THOROUGHBREDSMITHH");
      await attachScreenshot(page, testInfo, `race-${view}`);
      await clean(page, errors);
    });
  }

  test("everything that matters sits above the phone keyboard", async ({ page }) => {
    await open(page, "race", "as=host");
    const vp = page.viewportSize()!;
    test.skip(vp.width >= 768, "no on-screen keyboard");
    const limit = vp.height - KEYBOARD;
    const parts = {
      timer: timer(page),
      input: input(page),
      message: message(page),
      opponent: page.getByText("Juno is in the round"),
    };
    for (const [name, loc] of Object.entries(parts)) {
      const b = (await loc.boundingBox())!;
      expect(b.y + b.height, `${name} bottom vs ${limit}`).toBeLessThanOrEqual(limit);
    }
  });

  test("top bar, slots and the opponent row", async ({ page }) => {
    await open(page, "race", "as=host");
    await expect(page.locator(".wp-chrome")).toContainText("Round 3 of 7 · Leon 2 · 1 Juno");
    await expect(page.getByRole("img", { name: "Starts with T, ends with H" }).first()).toBeVisible();
    await expect(timer(page)).toHaveText("30");
    await expect(timer(page)).toHaveAttribute("aria-label", "30 seconds left");
    await open(page, "race", "as=guest&opp=submitted");
    await expect(page.getByText("Leon submitted a word")).toBeVisible();
    await expect(page.getByText("checking…")).toBeVisible();
    await open(page, "race", "as=host&away=1");
    await expect(timer(page)).toHaveAttribute("aria-label", "Timer paused at 30 seconds");
    await expect(page.getByText("paused", { exact: true })).toBeVisible();
    await expect(page.getByText("Juno is offline")).toBeVisible();
  });

  test("timer: m:ss from a minute, magenta and hurry at 5 s", async ({ page }, testInfo) => {
    await page.clock.install();
    await open(page, "race", "as=host");
    await page.clock.runFor(25_000);
    await expect(timer(page)).toHaveText("5");
    await expect(page.getByText("hurry!")).toBeVisible();
    const bg = await timer(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(184, 58, 126)");
    await attachScreenshot(page, testInfo, "race-urgent");
    expect(await findLowContrast(page, ".wp-root")).toEqual([]);
    // 1:30 formatting is a pure function of the seconds left.
    await page.goto(`/r/${PREVIEW_ROOM}?phase=lobby&as=host`);
  });

  test("format rejections: message, ring, then cleared by typing", async ({ page }, testInfo) => {
    await open(page, "race", "as=host");
    await expect(message(page)).toHaveText("min 4 letters · Enter to submit");
    await input(page).fill("TEH");
    await input(page).press("Enter");
    await expect(message(page)).toHaveText("Too short, needs at least 4 letters.");
    await expect(input(page)).toHaveAttribute("aria-invalid", "true");
    const ring = await input(page).evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).toContain("inset");
    await attachScreenshot(page, testInfo, "race-rejected");
    expect(await findLowContrast(page, ".wp-root")).toEqual([]);
    await input(page).press("A");
    await expect(message(page)).toHaveText("min 4 letters · Enter to submit");
    await expect(input(page)).not.toHaveAttribute("aria-invalid", "true");
    await input(page).fill("TOOTA");
    await page.getByRole("button", { name: "Submit word" }).click();
    await expect(message(page)).toHaveText("Has to end with H.");
    // The start letter can't be removed: the input re-prefixes it.
    await input(page).fill("GLOVE");
    await expect(input(page)).toHaveValue("TGLOVE");
  });

  test("dictionary rejections use the design copy", async ({ page }) => {
    await open(page, "race", "as=host");
    await page.route("**/api/words/validate", (r) => r.fulfill({ json: { valid: false } }));
    await input(page).fill("TOTH");
    await input(page).press("Enter");
    await expect(message(page)).toHaveText("TOTH isn't in the word list. Slang and proper nouns are off.");
    await page.unroute("**/api/words/validate");
    await page.route("**/api/words/validate", (r) => r.fulfill({ status: 429, body: "{}" }));
    await input(page).press("Enter");
    await expect(message(page)).toHaveText("Checking too fast, wait a second and try again.");
    await page.unroute("**/api/words/validate");
    await page.route("**/api/words/validate", (r) => r.abort("failed"));
    await input(page).press("Enter");
    await expect(message(page)).toHaveText("Connection problem, your word wasn't checked. Try again.");
  });

  test("submitting shows the checking state", async ({ page }) => {
    await open(page, "race", "as=host");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route("**/api/words/validate", async (r) => {
      await gate;
      await r.fulfill({ json: { valid: false } });
    });
    await input(page).fill("TOOTH");
    await input(page).press("Enter");
    await expect(page.getByRole("button", { name: "Checking your word" })).toBeDisabled();
    await expect(message(page)).toHaveText("Checking your word…");
    await expect(input(page)).toHaveAttribute("readonly", "");
    release();
    await expect(page.getByRole("button", { name: "Submit word" })).toBeEnabled();
  });

  test("typing keeps the locked first letter first", async ({ page }) => {
    await open(page, "race", "as=host");
    const el = input(page);
    // Real keystrokes, not fill(): autofocus once left the caret before
    // the "T", and typing OOTH came out as "TOOTHT".
    await expect(el).toBeFocused();
    await page.keyboard.type("OOTH");
    await expect(el).toHaveValue("TOOTH");
    // Caret moved in front of the lock letter (a tap there): the letters
    // go after it, and the caret follows them.
    await el.evaluate((i: HTMLInputElement) => i.setSelectionRange(0, 0));
    await page.keyboard.type("S");
    await expect(el).toHaveValue("TSOOTH");
    await page.keyboard.type("A");
    await expect(el).toHaveValue("TSAOOTH");
    // Deleting the lock letter brings it back without moving others.
    await el.fill("T");
    await el.press("End");
    await page.keyboard.type("RUTH");
    await el.evaluate((i: HTMLInputElement) => i.setSelectionRange(0, 0));
    await page.keyboard.press("Delete");
    await expect(el).toHaveValue("TRUTH");
  });

  test("long words step the type down and stay inside the pill", async ({ page }) => {
    await open(page, "race", "as=host");
    const size = async () => parseFloat(await input(page).evaluate((el) => getComputedStyle(el).fontSize));
    const short = await size();
    await input(page).fill("THOROUGHBREDSMITHH");
    expect(await size()).toBeLessThan(short);
    const fits = await input(page).evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits).toBe(true);
  });

  test("layout: one column at most 720px on desktop", async ({ page }) => {
    await open(page, "race", "as=host");
    test.skip(page.viewportSize()!.width < 1024, "desktop only");
    const frame = (await page.locator(".wp-frame").boundingBox())!;
    expect(frame.width).toBeLessThanOrEqual(720);
    // No keyboard to dodge: the column is centred, not stuck under the bar.
    const vh = page.viewportSize()!.height;
    expect(Math.abs(frame.y + frame.height / 2 - (64 + vh) / 2)).toBeLessThan(40);
  });
});

test.describe("reveal", () => {
  test("beats: flowers 3·2·1, GO star, then the letters", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    // Paused: fake time only moves with runFor, so no beat is skipped.
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
    await open(page, "reveal", "as=host");
    await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", "reveal");
    const beat = page.getByRole("timer");
    await expect(beat).toHaveAttribute("aria-label", "3");
    await expect(beat.locator("[data-shape='flower']:visible")).toHaveCount(1);
    await expect(page.getByText("ready…")).toBeVisible();
    // The pop ends faded out (the next beat replaces it at 700 ms), so
    // check the settled frame instead.
    await page.getByRole("timer").evaluate((el) => ((el as HTMLElement).style.animation = "none"));
    await attachScreenshot(page, testInfo, "reveal-3");
    await clean(page, errors);
    for (const [label, line] of [["2", "set…"], ["1", "almost…"]]) {
      await page.clock.runFor(700);
      await expect(beat).toHaveAttribute("aria-label", label);
      await expect(page.getByText(line)).toBeVisible();
    }
    await page.clock.runFor(700);
    await expect(beat).toHaveAttribute("aria-label", "Go");
    await expect(beat.locator("[data-shape='star']:visible")).toHaveCount(1);
    await expect(page.getByText("pencils up!")).toBeVisible();
    // Freeze the pop at its settled frame (it fades out at the very end).
    await page.getByRole("timer").evaluate((el) => ((el as HTMLElement).style.animation = "none"));
    await attachScreenshot(page, testInfo, "reveal-go");
    expect(await findLowContrast(page, ".wp-root")).toEqual([]);
    await page.clock.runFor(700);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Starts with T,ends with H");
    await expect(page.getByText("At least 4 letters. Get ready to type.")).toBeVisible();
    await finishAnimations(page);
    expect(await page.locator(".slide-up-in").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    await attachScreenshot(page, testInfo, "reveal-letters");
    await clean(page, errors);
  });

  test("beat labels: ink centred (≤0.5px) and ≥12px off the outline", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
    await open(page, "reveal", "as=host");
    const rows: string[] = [];
    for (let i = 0; i < 4; i++) {
      // Measure the settled layout, not a frame of the pop.
      await page.getByRole("timer").evaluate((el) => ((el as HTMLElement).style.animation = "none"));
      const r = await page.locator("[role='timer'] [data-shape]:visible").evaluate((shape) => {
        const sp = shape.querySelector<HTMLElement>("span.font-extrabold")!;
        const cs = getComputedStyle(sp);
        const fs = parseFloat(cs.fontSize);
        // Ink from rendered pixels at 4x (see the kit glyph test).
        const SCALE = 4, W = 2400, X = 300, Y = 1600;
        const c = document.createElement("canvas");
        c.width = W;
        c.height = W;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.font = `${cs.fontWeight} ${fs * SCALE}px ${cs.fontFamily}`;
        ctx.fillText(sp.textContent!, X, Y);
        const d = ctx.getImageData(0, 0, W, W).data;
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (let y = 0; y < W; y++)
          for (let x = 0; x < W; x++)
            if (d[(y * W + x) * 4 + 3] > 40) {
              x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            }
        const m = ctx.measureText(sp.textContent!);
        const asc = m.fontBoundingBoxAscent / SCALE, desc = m.fontBoundingBoxDescent / SCALE;
        // The span's box includes the centring translate.
        const tb = sp.getBoundingClientRect();
        const base = tb.top + asc - (asc + desc - tb.height) / 2;
        const ink = { l: tb.left + (x0 - X) / SCALE, r: tb.left + (x1 + 1 - X) / SCALE, t: base + (y0 - Y) / SCALE, b: base + (y1 + 1 - Y) / SCALE };
        const s = shape.getBoundingClientRect();
        const cx = s.left + s.width / 2, cy = s.top + s.height / 2;
        const far = Math.max(...[[ink.l, ink.t], [ink.r, ink.t], [ink.l, ink.b], [ink.r, ink.b]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
        // Flower: the core circle (r 62) is the innermost edge; star: inner
        // vertices at 62 plus half the 18-unit rounded stroke.
        const inner = (shape.getAttribute("data-shape") === "star" ? 71 : 62) * (s.width / 200);
        return { label: sp.textContent!, clear: inner - far, dx: (ink.l + ink.r) / 2 - cx, dy: (ink.t + ink.b) / 2 - cy };
      });
      rows.push(`${r.label} clear ${r.clear.toFixed(1)} dx ${r.dx.toFixed(2)} dy ${r.dy.toFixed(2)}`);
      expect(r.clear, r.label).toBeGreaterThanOrEqual(12);
      expect(Math.max(Math.abs(r.dx), Math.abs(r.dy)), rows.at(-1)).toBeLessThanOrEqual(0.5);
      await page.clock.runFor(700);
    }
    console.log(`[beats] ${test.info().project.name}: ${rows.join(" | ")}`);
  });

  test("reduced motion: beats swap without the pop", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
    await open(page, "reveal", "as=host");
    expect(await page.getByRole("timer").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await page.clock.runFor(2800);
    expect(await page.locator(".slide-up-in").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  });

  test("away banner shows during the countdown", async ({ page }) => {
    await open(page, "reveal", "as=host&away=1");
    await expect(page.getByText(/Juno disconnected/)).toBeVisible();
  });
});

test.describe("settling", () => {
  test("three shapes and the word you played", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await open(page, "race", "as=host&settling=1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tallyingthe round…");
    await expect(page.getByRole("status")).toContainText("You played tooth. Checking who was faster.");
    await expect(page.locator("[data-settling='shapes'] [data-shape]")).toHaveCount(3);
    await attachScreenshot(page, testInfo, "settling");
    await clean(page, errors);
  });

  test("reduced motion: the shapes hold still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "race", "as=host&settling=1");
    const shapes = page.locator("[data-settling='shapes'] > span");
    const before = await shapes.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    await page.waitForTimeout(500);
    const after = await shapes.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(after).toEqual(before);
  });
});
