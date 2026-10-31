import { expect, test, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { findHorizontalOverflow, findLowContrast, findSmallTargets } from "./helpers";

/**
 * F7 quick match over a real Supabase. A probe (`--config
 * tests/e2e/probe.config.ts`); needs NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY of the dev
 * server's project. Runs alone: it empties the queue first.
 */
test.setTimeout(180_000);
// The tests empty and inspect the one shared queue: never in parallel.
test.describe.configure({ mode: "serial" });

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function player(browser: Browser, name: string, width = 390, height = 844) {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  await page.goto("/");
  await page.evaluate((n) => localStorage.setItem("wordpinch:v1:name", n), name);
  return page;
}

async function queue() {
  const { data, error } = await admin().from("match_queue").select("user_id, name, matched_room");
  if (error) throw error;
  return data;
}

test("two strangers get paired into a quick-match game", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "one engine is enough for the live flow");
  await admin().from("match_queue").delete().not("user_id", "is", null);

  // A waits.
  const a = await player(browser, "Ann Quick");
  await a.locator('[data-landing="modes"]:visible').getByRole("button", { name: /Quick/ }).click();
  await a.waitForURL(/\/quick$/);
  await expect(a.getByRole("status", { name: "Searching for an opponent" })).toBeVisible();
  await expect(a.getByText(/^1 waiting · 0:0\d$/)).toBeVisible({ timeout: 15_000 });
  expect((await queue()).map((r) => [r.name, r.matched_room])).toEqual([["Ann Quick", null]]);

  // The orbit dots sit on their rings' stroke lines.
  const offs = await a.locator("[data-orbit-dot]").evaluateAll((dots) =>
    dots.map((d) => {
      const ring = d.parentElement!.previousElementSibling as HTMLElement;
      const rb = ring.getBoundingClientRect();
      const db = d.getBoundingClientRect();
      const r = rb.width / 2 - parseFloat(getComputedStyle(ring).borderTopWidth) / 2;
      const dist = Math.hypot(db.x + db.width / 2 - (rb.x + rb.width / 2), db.y + db.height / 2 - (rb.y + rb.height / 2));
      return Math.abs(dist - r);
    })
  );
  console.log("orbit dot offsets from the stroke line (px):", offs.map((o) => o.toFixed(2)));
  for (const o of offs) expect(o).toBeLessThanOrEqual(0.5);
  await a.screenshot({ path: "test-results/screens/quick-live-searching.png" });
  expect(await findHorizontalOverflow(a)).toEqual([]);
  expect(await findSmallTargets(a, ".wp-root")).toEqual([]);
  expect(await findLowContrast(a, ".wp-root")).toEqual([]);

  // B arrives: both see the match, then land in the same room, seated.
  const b = await player(browser, "Ben Quick", 1280, 800);
  await b.goto("/quick");
  for (const [p, other] of [[a, "Ben Quick"], [b, "Ann Quick"]] as const) {
    await expect(p.getByText("Matched!")).toBeVisible({ timeout: 15_000 });
    await expect(p.getByText(other, { exact: true })).toBeVisible();
  }
  await b.screenshot({ path: "test-results/screens/quick-live-matched.png" });
  await a.waitForURL(/\/r\/[A-Z0-9]{4}$/, { timeout: 15_000 });
  await b.waitForURL(/\/r\/[A-Z0-9]{4}$/, { timeout: 15_000 });
  const code = a.url().slice(-4);
  expect(b.url().slice(-4)).toBe(code);
  for (const p of [a, b]) await expect(p.locator(".wp-root")).toHaveAttribute("data-phase", "pick", { timeout: 20_000 });
  await expect(a.locator(".wp-chrome")).toContainText("Round 1 of 5");

  const { data: room } = await admin().from("rooms").select("host_id, guest_id, state").eq("code", code).single();
  const st = room!.state as { phase: string; round: number; settings: Record<string, unknown>; players: Record<string, { name: string }> };
  console.log("room", code, st.settings);
  // A waited longer, so A hosts.
  expect([st.players.host.name, st.players.guest.name]).toEqual(["Ann Quick", "Ben Quick"]);
  expect(st.settings).toMatchObject({
    rounds: 5, roundTimerSec: 30, minWordLength: 4, tieBehavior: "replay",
    allowProperNouns: false, lengthBonus: false, noRepeat: false, peek: true,
  });
  expect(room!.host_id).not.toBe(room!.guest_id);
  // Neither is waiting any more.
  expect((await queue()).every((r) => r.matched_room === code)).toBe(true);

  // A third player cancels: the queue lets go of them.
  const c = await player(browser, "Cy Quick");
  await c.goto("/quick");
  await expect(c.getByText(/waiting ·/)).toBeVisible({ timeout: 15_000 });
  expect((await queue()).some((r) => r.name === "Cy Quick" && r.matched_room === null)).toBe(true);
  await c.getByRole("button", { name: "Cancel" }).click();
  await c.waitForURL((u) => u.pathname === "/");
  await expect.poll(async () => (await queue()).some((r) => r.name === "Cy Quick")).toBe(false);
});

test("a minute alone: nobody around, then keep waiting or invite", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "one engine is enough for the live flow");
  await admin().from("match_queue").delete().not("user_id", "is", null);
  const d = await player(browser, "Dee Quick");
  await d.clock.install();
  await d.goto("/quick");
  await expect(d.getByText(/waiting ·/)).toBeVisible({ timeout: 15_000 });
  await d.clock.fastForward(61_000);
  await expect(d.getByText("Quiet right now")).toBeVisible({ timeout: 10_000 });
  // The page left the queue, so nobody gets paired with an empty screen.
  await expect.poll(async () => (await queue()).some((r) => r.name === "Dee Quick")).toBe(false);
  await d.screenshot({ path: "test-results/screens/quick-live-none.png" });
  expect(await findSmallTargets(d, ".wp-root")).toEqual([]);
  expect(await findLowContrast(d, ".wp-root")).toEqual([]);

  await d.getByRole("button", { name: "Keep waiting" }).click();
  await expect(d.getByText(/waiting ·/)).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await queue()).some((r) => r.name === "Dee Quick")).toBe(true);

  await d.clock.fastForward(61_000);
  await d.getByRole("button", { name: "Invite a friend" }).click();
  await d.waitForURL(/\/r\/[A-Z0-9]{4}$/, { timeout: 20_000 });
  await expect(d.locator(".wp-root")).toHaveAttribute("data-phase", "lobby", { timeout: 20_000 });
});

test("the queue is server-only", async () => {
  const outsider = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await outsider.auth.signInAnonymously();
  const read = await outsider.from("match_queue").select("*");
  const rpc = await outsider.rpc("quick_match_pair", { p_user_id: crypto.randomUUID(), p_name: "x", p_code: "ZZZZ", p_state: {} });
  console.log("client read:", read.error?.code, "client rpc:", rpc.error?.code);
  expect(read.error?.code).toBe("42501");
  expect(rpc.error?.code).toBe("42501");
});
