import { expect, test, type Page } from "@playwright/test";
import { findHorizontalOverflow, findLowContrast, findSmallTargets } from "./helpers";

/**
 * F5 share image over a real Supabase: a one-round match, then the share
 * sheet at match end, the downloaded PNG, and the room link's Open Graph
 * card. A probe (`--config tests/e2e/probe.config.ts`); needs the dev
 * server on a project with anonymous sign-ins.
 */
test.setTimeout(150_000);

const phase = (p: Page, name: string) =>
  expect(p.locator(".wp-root")).toHaveAttribute("data-phase", name, { timeout: 30_000 });

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buf: Buffer) {
  expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test("match end: share sheet, saved image, link preview", async ({ browser, browserName, playwright }) => {
  test.skip(browserName !== "chromium", "one engine is enough for the live flow");
  const hostCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["clipboard-read", "clipboard-write"] });
  const host = await hostCtx.newPage();
  const guest = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs: string[] = [];
  host.on("console", (m) => m.type() === "error" && errs.push(m.text()));

  for (const [p, name] of [[host, "Hosty"], [guest, "Guesty"]] as const) {
    await p.goto("/");
    await p.evaluate((n) => localStorage.setItem("wordpinch:v1:name", n), name);
  }
  await host.reload();
  await host.locator('[data-landing="modes"]:visible button').first().click();
  await host.waitForURL(/\/r\/[A-Z0-9]{4}$/, { timeout: 20_000 });
  const code = host.url().slice(-4);
  await guest.goto(`/r/${code}`);
  await expect(host.getByRole("button", { name: "Start game" })).toBeEnabled({ timeout: 20_000 });

  // Before the match: the link preview is an invite.
  const api = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  const ogUrl = async () => {
    const html = await (await api.get(`/r/${code}`)).text();
    const url = html.match(/<meta property="og:image" content="([^"]+)"/)![1].replace(/&amp;/g, "&");
    const alt = html.match(/<meta property="og:image:alt" content="([^"]+)"/)![1];
    return { url, alt };
  };
  const before = await ogUrl();
  console.log("og before:", before.alt);
  expect(before.alt).toBe(`Invite card: join Hosty in wordpinch room ${code}`);

  for (let i = 0; i < 4; i++) await host.getByRole("button", { name: "Decrease Rounds" }).click();
  // Start only once the room has the one-round setting.
  await expect
    .poll(async () => ((await (await api.get(`/api/rooms/${code}`)).json()) as { state?: { settings?: { rounds?: number } } }).state?.settings?.rounds)
    .toBe(1);
  await host.getByRole("button", { name: "Start game" }).click();
  for (const p of [host, guest]) await phase(p, "pick");
  await expect(host.getByRole("heading", { level: 1 })).toContainText(/(first|last) letter/);
  const first = (await host.getByRole("heading", { level: 1 }).textContent())!.includes("first") ? host : guest;
  const last = first === host ? guest : host;
  await first.getByRole("radio", { name: "T", exact: true }).click();
  await first.getByRole("button", { name: "Lock in T" }).click();
  await last.getByRole("radio", { name: "H", exact: true }).click();
  await last.getByRole("button", { name: "Lock in H" }).click();
  for (const p of [host, guest]) await phase(p, "race");
  await host.getByLabel(/Your word/).fill("TOOTH");
  await host.getByLabel(/Your word/).press("Enter");
  for (const p of [host, guest]) await phase(p, "result");
  await host.getByRole("button", { name: /Next round/ }).click();
  for (const p of [host, guest]) await phase(p, "matchend");

  // ── The sheet.
  await host.getByRole("button", { name: "Share", exact: true }).click();
  const sheet = host.getByRole("dialog", { name: "Share the result" });
  await expect(sheet).toBeVisible();
  const img = sheet.getByRole("img", { name: "Share card: Hosty beat Guesty 1 to 0" });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1080);
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalHeight)).toBe(1350);
  // The sheet on phone, tablet and desktop, light and dark.
  for (const [w, h] of [[390, 664], [810, 1080], [1280, 800]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      await host.setViewportSize({ width: w, height: h });
      await host.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await expect(img).toBeVisible();
      const box = (await img.boundingBox())!;
      const dlg = (await sheet.boundingBox())!;
      const off = Math.abs(box.x + box.width / 2 - (dlg.x + dlg.width / 2));
      console.log(`[sheet] ${w}x${h} ${scheme}: card ${box.width.toFixed(0)}x${box.height.toFixed(0)}, ${off.toFixed(1)}px off centre`);
      expect(off).toBeLessThanOrEqual(1);
      expect(box.y + box.height).toBeLessThanOrEqual(h);
      expect(await findHorizontalOverflow(host)).toEqual([]);
      expect(await findSmallTargets(host, "[role='dialog']")).toEqual([]);
      expect(await findLowContrast(host, "[role='dialog']")).toEqual([]);
      await host.screenshot({ path: `test-results/screens/share-live-sheet-${w}-${scheme}.png` });
    }
  }
  await host.setViewportSize({ width: 390, height: 844 });

  // Save image: a real PNG download.
  const [download] = await Promise.all([host.waitForEvent("download"), sheet.getByRole("link", { name: "Save image" }).click()]);
  expect(download.suggestedFilename()).toBe(`wordpinch-${code}.png`);
  const saved = await download.path().then((p) => require("node:fs").readFileSync(p) as Buffer);
  expect(pngSize(saved)).toEqual({ width: 1080, height: 1350 });

  // Share…: headless Chromium has no share sheet, so the link is copied.
  await sheet.getByRole("button", { name: "Share…" }).click();
  await expect(host.getByText("Link copied")).toBeVisible();
  expect(await host.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(host.url()).origin}/r/${code}`);

  // ── After the match: the link preview shows the result.
  const after = await ogUrl();
  console.log("og after:", after.alt, after.url);
  expect(after.alt).toBe("Share card: Hosty beat Guesty 1 to 0, fastest word tooth in " + after.alt.split(" in ").pop());
  const og = await api.get(after.url);
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toBe("image/png");
  expect(pngSize(await og.body())).toEqual({ width: 1200, height: 630 });

  // A room that doesn't exist: no card, and a plain preview.
  expect((await api.get("/r/ZZZZ/card")).status()).toBe(404);
  expect(errs.filter((e) => !/Failed to load resource|realtime|room-fx/i.test(e))).toEqual([]);
  await api.dispose();
});
