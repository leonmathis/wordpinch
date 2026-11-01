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
 * F4 rules via the dev preview: "No repeat letters" (`norepeat=1` marks
 * G E P K as picked in rounds 1–2) and "Peek hint" (`peek=1`, or
 * `peek=used`). The server side is rules.probe.ts.
 */

async function open(page: Page, query: string) {
  await page.goto(`/r/${PREVIEW_ROOM}?${query}`);
  await settle(page);
}

test.describe("lobby rules", () => {
  test("both new rules carry a New tag and toggle", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await open(page, "phase=lobby&as=host");
    for (const name of ["No repeat letters", "Peek hint"]) {
      const sw = page.getByRole("switch", { name: new RegExp(name) });
      await expect(sw).toHaveAttribute("aria-checked", "false");
      await expect(page.locator("label", { hasText: name }).getByText("New", { exact: true })).toBeVisible();
      await sw.click();
      await expect(sw).toHaveAttribute("aria-checked", "true");
    }
    await expect(page.getByText("A letter can only be picked once per match")).toBeVisible();
    await expect(page.getByText("Each player can reveal one letter per match")).toBeVisible();
    await attachScreenshot(page, testInfo, "lobby-rules");
    expect(await findHorizontalOverflow(page)).toEqual([]);
    expect(await findLowContrast(page, ".wp-root")).toEqual([]);
    expectNoErrors(errors);
  });

  test("the guest sees them read-only", async ({ page }) => {
    await open(page, "phase=lobby&as=guest&norepeat=1&peek=1");
    for (const name of ["No repeat letters", "Peek hint"]) {
      await expect(page.getByRole("switch", { name: new RegExp(name) })).toBeDisabled();
    }
  });
});

test.describe("no repeat letters", () => {
  test("used letters are hatched, disabled and named", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await open(page, "phase=pick&as=host&norepeat=1");
    await expect(page.getByText("already picked this match")).toBeVisible();
    for (const l of ["G", "E", "P", "K"]) {
      const key = page.getByRole("radio", { name: `${l}, already picked` });
      await expect(key).toBeDisabled();
      expect(await key.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("repeating-linear-gradient");
    }
    await expect(page.getByRole("radio", { name: "T", exact: true })).toBeEnabled();
    await attachScreenshot(page, testInfo, "pick-norepeat");
    expect(await findHorizontalOverflow(page)).toEqual([]);
    expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
    expect(await findLowContrast(page, ".wp-root")).toEqual([]);
    expectNoErrors(errors);
  });

  test("keys and arrows skip used letters", async ({ page }) => {
    await open(page, "phase=pick&as=host&norepeat=1");
    // Typing a used letter does nothing; a free one picks it.
    await page.keyboard.press("g");
    await expect(page.getByRole("button", { name: "Pick a letter" })).toBeVisible();
    await page.keyboard.press("f");
    await expect(page.getByRole("button", { name: "Lock in F" })).toBeVisible();
    // F → (G used) → H, then back over G to F; D → (E used) → F.
    await page.getByRole("radio", { name: "F", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "Lock in H" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "H", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("button", { name: "Lock in F" })).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("button", { name: "Lock in D" })).toBeVisible();
    // Down from D (index 3) is K (10), used: one more row to R (17).
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("button", { name: "Lock in R" })).toBeVisible();
  });

  test("off: no hatch, no legend", async ({ page }) => {
    await open(page, "phase=pick&as=host");
    await expect(page.getByText("already picked this match")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /already picked/ })).toHaveCount(0);
  });
});

test.describe("peek", () => {
  test("one tap reveals a letter in the gap, then it's spent", async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await open(page, "phase=race&as=host&peek=1");
    const input = page.getByLabel(/Your word/);
    await expect(input).toBeFocused();
    const peek = page.getByRole("button", { name: "Peek a letter · 1" });
    await expect(peek).toBeVisible();
    await peek.click();
    await expect(page.getByRole("button", { name: "Peek used" })).toBeDisabled();
    await expect(input).toBeFocused();
    const slots = page.getByRole("img", { name: /second letter O/ }).filter({ visible: true });
    await expect(slots).toHaveCount(1);
    await expect(slots.locator("[data-peek]")).toHaveText("O");
    await attachScreenshot(page, testInfo, "race-peek");
    expect(await findHorizontalOverflow(page)).toEqual([]);
    expect(await findSmallTargets(page, ".wp-root")).toEqual([]);
    expect(await findLowContrast(page, ".wp-root")).toEqual([]);
    expectNoErrors(errors);
  });

  test("spent in an earlier round: Peek used from the start", async ({ page }) => {
    await open(page, "phase=race&as=guest&peek=used");
    await expect(page.getByRole("button", { name: "Peek used" })).toBeDisabled();
    await expect(page.locator("[data-peek]")).toHaveCount(0);
  });

  test("off: no peek pill", async ({ page }) => {
    await open(page, "phase=race&as=host");
    await expect(page.getByRole("button", { name: /Peek/ })).toHaveCount(0);
  });

  test("the chip's letter sits centred and inside the chip", async ({ page }) => {
    await open(page, "phase=race&as=host&peek=1");
    await page.getByRole("button", { name: "Peek a letter · 1" }).click();
    const chip = page.locator("[data-peek]").filter({ visible: true });
    // Ink box of the glyph against the chip, measured with a Range.
    const m = await chip.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const ink = r.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return { dx: ink.left + ink.width / 2 - (box.left + box.width / 2), inside: ink.top >= box.top - 1 && ink.bottom <= box.bottom + 1 };
    });
    console.log(`[peek chip] ${test.info().project.name}: dx ${m.dx.toFixed(1)}`);
    expect(Math.abs(m.dx)).toBeLessThanOrEqual(1);
    expect(m.inside).toBe(true);
  });
});
