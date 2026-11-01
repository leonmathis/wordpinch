import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * F2 collection over a real Supabase (anonymous sign-ins on): the
 * winner's word is collected on resolve, the other player bookmarks it,
 * the match-end banner counts only words new to this match, and the
 * collection page shows each player their own words. Two one-round
 * matches in one room, so the second checks that a rematch starts the
 * count again. Writes rooms and accounts: a probe
 * (`--config tests/e2e/probe.config.ts`) that needs
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY of the dev server's project.
 */
test.setTimeout(180_000);

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function rows(userId: string) {
  const { data, error } = await admin()
    .from("collected_words")
    .select("word, source, opponent, time_ms, room_code")
    .eq("user_id", userId)
    .order("word");
  if (error) throw error;
  return data;
}

async function seats(code: string) {
  const { data, error } = await admin().from("rooms").select("host_id, guest_id, state").eq("code", code).single();
  if (error) throw error;
  return data as { host_id: string; guest_id: string; state: { matchStartedAt?: number } };
}

function errorsOf(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  return errs;
}

const phase = (p: Page, name: string) =>
  expect(p.locator(".wp-root")).toHaveAttribute("data-phase", name, { timeout: 30_000 });

/** Pick T…H, then `winner` plays `word`; ends on the result screen. */
async function playRound(host: Page, guest: Page, winner: Page, word: string) {
  for (const p of [host, guest]) await phase(p, "pick");
  await expect(host.getByRole("heading", { level: 1 })).toContainText(/(first|last) letter/);
  const first = (await host.getByRole("heading", { level: 1 }).textContent())!.includes("first") ? host : guest;
  const last = first === host ? guest : host;
  await first.getByRole("radio", { name: "T", exact: true }).click();
  await first.getByRole("button", { name: "Lock in T" }).click();
  await last.getByRole("radio", { name: "H", exact: true }).click();
  await last.getByRole("button", { name: "Lock in H" }).click();
  for (const p of [host, guest]) await phase(p, "race");
  const input = winner.getByLabel("Your word, starting with T and ending with H");
  await input.fill(word.toUpperCase());
  await input.press("Enter");
  for (const p of [host, guest]) await phase(p, "result");
}

test("won and saved words land in each player's collection", async ({ browser, browserName, playwright }) => {
  test.skip(browserName !== "chromium", "one engine is enough for the live flow");
  const host = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const guest = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const hostErrs = errorsOf(host), guestErrs = errorsOf(guest);

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
  for (let i = 0; i < 4; i++) await host.getByRole("button", { name: "Decrease Rounds" }).click();
  await expect
    .poll(async () => (await admin().from("rooms").select("state").eq("code", code).single()).data?.state.settings.rounds)
    .toBe(1);

  const s0 = await seats(code);
  expect(s0.state.matchStartedAt, "no match started yet").toBeUndefined();
  await host.getByRole("button", { name: "Start game" }).click();

  // ── Match 1: the host wins with "tooth", the guest bookmarks it. ──
  await playRound(host, guest, host, "tooth");
  // The host's pointer on the result holds the auto-advance while we look.
  await host.mouse.move(1, 1);
  await host.locator(".wp-frame").hover();
  await expect(host.getByText("Paused while you read")).toBeVisible();
  const { host_id, guest_id, state } = await seats(code);
  const start1 = state.matchStartedAt!;
  console.log("room", code, "host", host_id, "guest", guest_id, "matchStartedAt", start1);
  expect(start1).toBeGreaterThan(Date.now() - 120_000);

  // Winner: collected on resolve, bookmark already filled.
  await expect(host.getByRole("button", { name: "In your word collection" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => rows(host_id)).toEqual([
    expect.objectContaining({ word: "tooth", source: "won", opponent: "Guesty", room_code: code }),
  ]);
  const hostTime = (await rows(host_id))[0].time_ms;
  console.log("host tooth time_ms", hostTime);
  expect(hostTime).toBeGreaterThan(0);
  expect(hostTime).toBeLessThan(60_000);

  // Loser: nothing until the bookmark.
  expect(await rows(guest_id)).toEqual([]);
  const save = guest.getByRole("button", { name: "Save to your word collection" });
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(guest.getByRole("button", { name: "In your word collection" })).toHaveAttribute("aria-pressed", "true");
  await expect(guest.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  expect(await rows(guest_id)).toEqual([
    expect.objectContaining({ word: "tooth", source: "saved", opponent: "Hosty", time_ms: null, room_code: code }),
  ]);
  await guest.screenshot({ path: "test-results/screens/collection-live-guest-saved.png" });

  // Wrong round → 409; no session → 401.
  const wrongRound = await guest.evaluate(
    async (c) => (await fetch(`/api/rooms/${c}/save-word`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ round: 2 }) })).status,
    code
  );
  expect(wrongRound).toBe(409);
  const api = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  expect((await api.post(`/api/rooms/${code}/save-word`, { data: { round: 1 } })).status()).toBe(401);
  expect(await (await api.get("/api/collection")).json()).toEqual({ words: [] });
  expect(await (await api.get(`/api/rooms/${code}/collected`)).json()).toEqual({ count: 0 });

  // A signed-in stranger (spectator) can't bookmark into the room.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`/r/${code}`);
  await expect(stranger.locator(".wp-root")).toHaveAttribute("data-phase", /result|spectator/, { timeout: 20_000 });
  await expect(stranger.getByRole("button", { name: /word collection/ })).toHaveCount(0);
  await expect
    .poll(async () => (await stranger.context().cookies()).some((c) => c.name.includes("auth-token")), { timeout: 20_000 })
    .toBe(true);
  const strangerSave = await stranger.evaluate(
    async (c) => (await fetch(`/api/rooms/${c}/save-word`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ round: 1 }) })).status,
    code
  );
  console.log("stranger save", strangerSave);
  expect(strangerSave).toBe(403);
  await stranger.context().close();

  // Match end: one new word each.
  await host.getByRole("button", { name: /Next round/ }).click();
  for (const p of [host, guest]) await phase(p, "matchend");
  for (const p of [host, guest]) await expect(p.getByRole("link", { name: "1 new word in your collection" })).toBeVisible({ timeout: 10_000 });
  await host.screenshot({ path: "test-results/screens/collection-live-host-matchend.png", fullPage: true });
  // Too late to bookmark once the result is gone.
  expect(
    await guest.evaluate(
      async (c) => (await fetch(`/api/rooms/${c}/save-word`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ round: 1 }) })).status,
      code
    )
  ).toBe(409);

  // ── Match 2: a rematch restarts the count. The guest wins with a new
  // word ("teeth"); the host's "tooth" from match 1 is not new. ──
  await host.getByRole("button", { name: "Rematch" }).click();
  for (const p of [host, guest]) await phase(p, "lobby");
  await expect(host.getByRole("button", { name: "Start game" })).toBeEnabled({ timeout: 20_000 });
  await host.getByRole("button", { name: "Start game" }).click();
  await playRound(host, guest, guest, "teeth");
  const start2 = (await seats(code)).state.matchStartedAt!;
  console.log("match 2 started", start2, "after match 1", start2 > start1);
  expect(start2).toBeGreaterThan(start1);
  await expect.poll(() => rows(guest_id)).toEqual([
    expect.objectContaining({ word: "teeth", source: "won", opponent: "Hosty" }),
    expect.objectContaining({ word: "tooth", source: "saved" }),
  ]);
  for (const p of [host, guest]) await phase(p, "matchend");
  await expect(guest.getByRole("link", { name: "1 new word in your collection" })).toBeVisible({ timeout: 10_000 });
  // The host collected nothing new in match 2.
  await expect.poll(async () => host.evaluate(async (c) => (await (await fetch(`/api/rooms/${c}/collected`)).json()).count, code)).toBe(0);
  await expect(host.getByRole("link", { name: /in your collection/ })).toHaveCount(0);

  // ── The collection page, from the banner. ──
  await guest.getByRole("link", { name: "1 new word in your collection" }).click();
  await guest.waitForURL(/\/collection$/);
  await expect(guest.getByRole("heading", { level: 1 })).toContainText("2 pinched so far");
  const cards = guest.locator("main li, ul li");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("teeth");
  await expect(cards.nth(0)).toContainText("won");
  await expect(cards.nth(0)).toContainText(/vs Hosty · \d+\.\d s · \d+\.\d+\./);
  await expect(cards.nth(1)).toContainText("tooth");
  await expect(cards.nth(1)).toContainText(/saved from Hosty · \d+\.\d+\./);
  await expect(guest.getByText("day streak")).toBeVisible();
  await guest.getByRole("radio", { name: "Saved" }).or(guest.getByRole("button", { name: "Saved" })).first().click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("tooth");
  await guest.screenshot({ path: "test-results/screens/collection-live-guest-page.png", fullPage: true });

  await host.goto("/collection");
  await expect(host.getByRole("heading", { level: 1 })).toContainText("1 pinched so far");
  await expect(host.locator("ul li")).toHaveCount(1);
  await expect(host.locator("ul li").first()).toContainText("tooth");
  await expect(host.locator("ul li").first()).toContainText("vs Guesty");
  await host.screenshot({ path: "test-results/screens/collection-live-host-page.png", fullPage: true });

  const noise = /Failed to load resource|vibrate|realtime/i;
  console.log("host errors", hostErrs.filter((e) => !noise.test(e)));
  console.log("guest errors", guestErrs.filter((e) => !noise.test(e)));
  expect(hostErrs.filter((e) => !noise.test(e))).toEqual([]);
  expect(guestErrs.filter((e) => !noise.test(e))).toEqual([]);
  await api.dispose();
});
