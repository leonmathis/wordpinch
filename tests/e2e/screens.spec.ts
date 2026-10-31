import { expect, test } from "@playwright/test";
import {
  PHASES,
  PREVIEW_ROOM,
  attachScreenshot,
  collectConsoleErrors,
  expectNoErrors,
  findHorizontalOverflow,
  settle,
} from "./helpers";

/**
 * Overflow that predates the redesign and is scheduled for the round that
 * rewrites the screen (docs/redesign/01-inventory.md). Matching is by text
 * prefix, so anything new still fails.
 */
const KNOWN_OVERFLOW: Record<string, RegExp[]> = {
  // R5 rewrites the lobby: the "add your name" hint and the tie toggle.
  lobby: [/Add your name/, /nobody/, /replay/, /split/, /^"Tie behavior/, /Players/, /^"Settings/, /Tied round/],
};

function unexpected(found: string[], phase: string) {
  const known = KNOWN_OVERFLOW[phase] ?? [];
  return found.filter((f) => !known.some((re) => re.test(f.replace(/^\w+ \+\d+px /, ""))));
}

test("landing renders cleanly", async ({ page }, testInfo) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  await settle(page);
  await attachScreenshot(page, testInfo, "landing");
  expect(await findHorizontalOverflow(page)).toEqual([]);
  expectNoErrors(errors);
});

for (const phase of PHASES) {
  test(`phase ${phase} renders cleanly`, async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`/r/${PREVIEW_ROOM}?phase=${phase}`);
    await settle(page);
    await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", phase);
    await attachScreenshot(page, testInfo, phase);
    const overflow = await findHorizontalOverflow(page);
    testInfo.annotations.push({ type: "overflow", description: overflow.join(" | ") || "none" });
    expect(unexpected(overflow, phase)).toEqual([]);
    expectNoErrors(errors);
  });
}
