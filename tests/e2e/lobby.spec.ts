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

const VIEWS = {
  "host-ready": "as=host",
  "host-waiting": "as=host&guest=0",
  guest: "as=guest",
  "host-stress": "as=host&stress=1",
  "guest-stress": "as=guest&stress=1",
} as const;

async function open(page: Page, query: string) {
  await page.goto(`/r/${PREVIEW_ROOM}?phase=lobby&${query}`);
  await settle(page);
  await expect(page.locator(".wp-root")).toHaveAttribute("data-phase", "lobby");
}

const cta = (page: Page) => page.locator(".wp-body button").filter({ hasText: /Start game|Waiting for/ });

test.describe("lobby", () => {
  for (const [view, query] of Object.entries(VIEWS)) {
    test(`${view}: renders cleanly`, async ({ page }, testInfo) => {
      const errors = collectConsoleErrors(page);
      await open(page, query);
      await attachScreenshot(page, testInfo, `lobby-${view}`);
      expect(await findHorizontalOverflow(page)).toEqual([]);
      expect(await findSmallTargets(page, ".wp-body")).toEqual([]);
      expect(await findLowContrast(page, ".wp-root")).toEqual([]);
      // No divider lines: rows are separated by spacing only. The dashed
      // "?" seat is the one bordered element allowed.
      const lines = await page.locator(".wp-body").evaluate((body) =>
        Array.from(body.querySelectorAll<HTMLElement>("*")).flatMap((el) => {
          const cs = getComputedStyle(el);
          const visible = (side: "top" | "bottom") =>
            cs.getPropertyValue(`border-${side}-style`) !== "none" &&
            parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0 &&
            !/rgba\(.*, 0\)$|transparent/.test(cs.getPropertyValue(`border-${side}-color`));
          // The unchecked switch keeps its 3:1 track outline (R2); that
          // is a control edge, not a divider.
          return (visible("top") || visible("bottom")) && cs.borderTopStyle !== "dashed" && el.getAttribute("role") !== "switch"
            ? [`${el.tagName} ${(el.textContent ?? "").trim().slice(0, 30)}`]
            : [];
        })
      );
      expect(lines).toEqual([]);
      await expect(page.locator("[data-slot='separator']")).toHaveCount(0);
      expectNoErrors(errors);
    });
  }

  test("host ready: steppers, segments, switches respond; Start enabled", async ({ page }) => {
    await open(page, VIEWS["host-ready"]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(PREVIEW_ROOM);
    await expect(page.getByText("send it to your rival")).toBeVisible();
    await expect(page.getByText("tap to change")).toBeVisible();
    await expect(cta(page)).toHaveText("Start game");
    await expect(cta(page)).toBeEnabled();
    await expect(page.getByText("2 of 2 ready")).toBeVisible();

    const rounds = page.getByRole("group", { name: "Rounds" });
    await expect(rounds).toContainText("7");
    const inc = page.getByRole("button", { name: "Increase rounds" });
    for (let i = 0; i < 8; i++) await inc.click();
    await expect(rounds).toContainText("15");
    await expect(inc).toBeDisabled();
    await page.getByRole("button", { name: "Decrease timer" }).click();
    await expect(page.getByRole("group", { name: "Timer" })).toContainText("25s");

    await page.getByRole("button", { name: "Nobody" }).click();
    await expect(page.getByRole("button", { name: "Nobody" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Nobody scores the point")).toBeVisible();

    const slang = page.getByRole("switch", { name: "Slang & proper nouns" });
    await expect(slang).not.toBeChecked();
    await page.getByText("Slang & proper nouns").click();
    await expect(slang).toBeChecked();
    await expect(page.getByText("Anything the dictionary or word list knows counts")).toBeVisible();
  });

  test("host waiting: empty seat, Start disabled", async ({ page }) => {
    await open(page, VIEWS["host-waiting"]);
    await expect(page.getByText("waiting for a player…", { exact: true })).toBeVisible();
    await expect(cta(page)).toHaveText("Waiting for a player…");
    await expect(cta(page)).toBeDisabled();
    await expect(page.getByText("1 of 2 ready · share the code")).toBeVisible();
  });

  test("guest: read-only rules, own name editable, waits for host", async ({ page }) => {
    await open(page, VIEWS.guest);
    await expect(page.getByText("you're in Leon's room")).toBeVisible();
    await expect(page.getByText("only Leon can change these")).toBeVisible();
    await expect(cta(page)).toHaveText("Waiting for Leon to start…");
    await expect(cta(page)).toBeDisabled();
    const controls = page.locator("section[aria-labelledby='house-rules']").locator("button, [role='switch']");
    const n = await controls.count();
    expect(n).toBeGreaterThanOrEqual(12);
    for (let i = 0; i < n; i++) await expect(controls.nth(i)).toBeDisabled();
    // The guest edits their own name, not the host's.
    const editor = page.getByLabel("Your display name");
    await expect(editor).toHaveCount(1);
    await expect(editor).toHaveValue("Juno");
    await editor.fill("Juniper");
    await editor.press("Enter");
    await expect(editor).not.toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem("wordpinch:v1:name"))).toBe("Juniper");
  });

  test("name nudge reads correctly for host and guest", async ({ page }) => {
    await open(page, VIEWS["host-ready"]);
    await expect(page.getByText("Add your name so your rival knows who’s playing.")).toBeVisible();
    await open(page, VIEWS.guest);
    await expect(page.getByText("Add your name so Leon knows who’s playing.")).toBeVisible();
    await page.evaluate(() => localStorage.setItem("wordpinch:v1:name", "Juno"));
    await page.reload();
    await settle(page);
    await expect(page.getByText(/Add your name/)).toHaveCount(0);
  });

  test("layout: Start under the rules on phones, left column on desktop", async ({ page }) => {
    await open(page, VIEWS["host-ready"]);
    const rules = (await page.locator("section[aria-labelledby='house-rules']").boundingBox())!;
    const start = (await cta(page).boundingBox())!;
    const wide = page.viewportSize()!.width >= 1024;
    if (wide) {
      expect(start.x + start.width).toBeLessThan(rules.x);
      expect(start.y).toBeLessThan(rules.y + rules.height);
    } else {
      expect(start.y).toBeGreaterThan(rules.y + rules.height);
    }
  });

  test("copy link writes the room URL", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only in Playwright");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, VIEWS["host-ready"]);
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText("Room link copied")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/r/${PREVIEW_ROOM}$`));
  });
});
