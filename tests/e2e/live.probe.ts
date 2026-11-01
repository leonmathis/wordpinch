import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Two real players over Supabase: create, join, start, pick, reveal, race,
 * result. Writes a room to the configured database, so it is a probe
 * (`--config tests/e2e/probe.config.ts`), not part of the suite.
 */
test.setTimeout(120_000);

function errorsOf(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  return errs;
}

test("two players play a round", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "one engine is enough for the live flow");
  const host = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const guest = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const hostErrs = errorsOf(host), guestErrs = errorsOf(guest);

  await host.goto("/");
  await host.evaluate(() => localStorage.setItem("wordpinch:v1:name", "Hosty"));
  await guest.goto("/");
  await guest.evaluate(() => localStorage.setItem("wordpinch:v1:name", "Guesty"));
  await host.reload();

  await host.locator('[data-landing="modes"]:visible button').first().click();
  await host.waitForURL(/\/r\/[A-Z0-9]{4}$/, { timeout: 20_000 });
  const code = host.url().slice(-4);
  console.log("room", code);
  await expect(host.getByRole("heading", { level: 1 })).toHaveText(code);

  await guest.getByLabel("Got a code from a friend?").fill(code);
  await guest.getByRole("button", { name: "Join" }).click();
  await guest.waitForURL(new RegExp(`/r/${code}$`));
  await expect(guest.getByText("you're in Hosty's room")).toBeVisible({ timeout: 20_000 });
  await expect(host.getByRole("button", { name: "Start game" })).toBeEnabled({ timeout: 20_000 });
  await expect(host.getByText("Guesty", { exact: true })).toBeVisible();

  await host.getByRole("button", { name: "Start game" }).click();
  for (const p of [host, guest]) await expect(p.locator(".wp-root")).toHaveAttribute("data-phase", "pick", { timeout: 20_000 });
  // Read the heading only once the pick screen is in: during the phase
  // cross-fade the lobby's heading (the room code) is still showing.
  await expect(host.getByRole("heading", { level: 1 })).toContainText(/(first|last) letter/);
  const first = (await host.getByRole("heading", { level: 1 }).textContent())!.includes("first") ? host : guest;
  const last = first === host ? guest : host;
  await first.getByRole("radio", { name: "T", exact: true }).click();
  await first.getByRole("button", { name: "Lock in T" }).click();
  await expect(first.getByText(/Locked in\. Waiting for/)).toBeVisible();
  await last.getByRole("radio", { name: "H", exact: true }).click();
  await last.getByRole("button", { name: "Lock in H" }).click();

  for (const p of [host, guest]) await expect(p.locator(".wp-root")).toHaveAttribute("data-phase", "reveal", { timeout: 20_000 });
  for (const p of [host, guest]) await expect(p.locator(".wp-root")).toHaveAttribute("data-phase", "race", { timeout: 20_000 });
  await expect(guest.getByText("Hosty is in the round")).toBeVisible();
  console.log("host inputs", await host.locator("input").evaluateAll((els) => els.map((e) => `${e.getAttribute("aria-label")} | ${(e as HTMLInputElement).value}`)));
  console.log("host timer", await host.getByRole("timer").getAttribute("aria-label").catch(() => "none"));
  await host.screenshot({ path: "test-results/screens/live-host-race.png" });

  const input = host.getByLabel("Your word, starting with T and ending with H");
  await input.fill("TOOTH");
  await input.press("Enter");
  for (const p of [host, guest]) await expect(p.locator(".wp-root")).toHaveAttribute("data-phase", "result", { timeout: 30_000 });
  await expect(host.getByText("Hosty won round 1", { exact: true })).toBeVisible();
  await expect(guest.getByText("Hosty won round 1", { exact: true })).toBeVisible();
  await expect(guest.getByRole("heading", { level: 1, name: "tooth" })).toBeVisible();
  await host.screenshot({ path: "test-results/screens/live-host-result.png" });
  await guest.screenshot({ path: "test-results/screens/live-guest-result.png" });

  const noise = /Failed to load resource|vibrate|realtime/i;
  console.log("host errors", hostErrs.filter((e) => !noise.test(e)));
  console.log("guest errors", guestErrs.filter((e) => !noise.test(e)));
  expect(hostErrs.filter((e) => !noise.test(e))).toEqual([]);
  expect(guestErrs.filter((e) => !noise.test(e))).toEqual([]);
});

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

test("a stale snapshot can't undo the host's settings", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "one engine is enough for the live flow");
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await host.goto("/");
  await host.locator('[data-landing="modes"]:visible button').first().click();
  await host.waitForURL(/\/r\/[A-Z0-9]{4}$/, { timeout: 20_000 });
  const code = host.url().slice(-4);
  await guest.goto(`/r/${code}`);
  await expect(host.getByRole("button", { name: "Start game" })).toBeEnabled({ timeout: 20_000 });
  const rounds = async () => (await admin().from("rooms").select("state").eq("code", code).single()).data!.state.settings.rounds;
  // The guest holds a lobby snapshot from before the host's change.
  const stale = await guest.evaluate(async (c) => (await (await fetch(`/api/rooms/${c}`)).json()).state, code);
  expect(stale.settings.rounds).toBe(5);
  for (let i = 0; i < 4; i++) await host.getByRole("button", { name: "Decrease Rounds" }).click();
  await expect.poll(rounds).toBe(1);

  // The guest posts that old snapshot, as a referee's late transition would.
  const status = await guest.evaluate(
    async ([c, st]) => (await fetch(`/api/rooms/${c}/state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId: localStorage.getItem("wordpinch:v1:client-id"), state: st }) })).status,
    [code, stale] as const
  );
  console.log("stale post", status, "db rounds", await rounds());
  expect(status).toBe(200);
  expect(await rounds()).toBe(1);

  // Both screens still run a one-round match.
  await host.waitForTimeout(1500);
  await host.getByRole("button", { name: "Start game" }).click();
  for (const p of [host, guest]) await expect(p.locator(".wp-chrome")).toContainText("Round 1 of 1", { timeout: 20_000 });
  expect(await rounds()).toBe(1);
});
