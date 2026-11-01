import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * F3 over a real Supabase: two players and a spectator. Reactions, cheers
 * and letter counts arrive on the other screens; the typed letters never
 * leave the browser; the count is throttled; forged messages on either
 * topic change nothing. A probe (`--config tests/e2e/probe.config.ts`);
 * needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY of
 * the dev server's project, with migration 20261031140000 applied.
 */
test.setTimeout(150_000);

function errorsOf(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  return errs;
}

const phase = (p: Page, name: string | RegExp) =>
  expect(p.locator(".wp-root")).toHaveAttribute("data-phase", name, { timeout: 30_000 });

test("reactions, cheers and letter counts reach the other screens", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "one engine is enough for the live flow");
  const host = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const guest = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [errorsOf(host), errorsOf(guest)];

  // Every frame the host's browser sends on the fx topic. Broadcasts go
  // out as binary frames (topic, event and JSON payload in one buffer).
  const sent: { t: number; text: string }[] = [];
  host.on("websocket", (ws) => ws.on("framesent", (f) => {
    const text = typeof f.payload === "string" ? f.payload : f.payload.toString("latin1");
    if (text.includes("fx:")) sent.push({ t: Date.now(), text });
  }));

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
  const spec = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  errs.push(errorsOf(spec));
  await spec.goto(`/r/${code}`);
  await expect(spec.getByText("You’re watching. Both seats are taken.")).toBeVisible({ timeout: 20_000 });

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
  await phase(spec, /race|spectator/);
  await expect(spec.getByRole("timer")).toBeVisible({ timeout: 20_000 });

  // ── Letter count: the host types; the others see a number, not letters.
  const input = host.getByLabel("Your word, starting with T and ending with H");
  await expect(input).toBeFocused();
  const typeStart = Date.now();
  await host.keyboard.type("RAVELLINGBRO", { delay: 30 }); // 12 letters in ~0.4 s
  const typeEnd = Date.now();
  await expect(input).toHaveValue("TRAVELLINGBRO");
  await expect(guest.getByText("13 letters", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(spec.getByText("13 letters", { exact: true })).toBeVisible({ timeout: 5000 });
  for (const p of [guest, spec]) expect(await p.locator("body").innerText()).not.toContain("RAVELLING");
  const typingFrames = sent.filter((f) => f.text.includes("typing"));
  console.log("typing frames", typingFrames.length, "over", typeEnd - typeStart, "ms:", typingFrames.map((f) => f.text.slice(f.text.indexOf("{"))));
  expect(typingFrames.length).toBeGreaterThan(0);
  for (const f of typingFrames) expect(f.text).not.toMatch(/RAVEL|TRAVEL/);
  // Leading + trailing at 250 ms: at most one frame per 250 ms, plus one.
  expect(typingFrames.length).toBeLessThanOrEqual(Math.ceil((Date.now() - typeStart) / 250) + 1);
  const gaps = typingFrames.slice(1).map((f, i) => f.t - typingFrames[i].t);
  console.log("gaps between typing frames (ms)", gaps);
  for (const g of gaps) expect(g).toBeGreaterThanOrEqual(200);

  // ── A player's reaction reaches the other player and the spectator.
  await guest.getByRole("button", { name: "ooh close" }).click();
  await expect(host.locator(".fx-bubble")).toHaveText("ooh close!", { timeout: 5000 });
  await expect(host.locator("[aria-live='polite']").filter({ hasText: "Guesty: ooh close!" })).toHaveCount(1);
  await expect(spec.locator(".fx-bubble")).toHaveText("ooh close!", { timeout: 5000 });
  await expect(input).toBeFocused();
  // The bubble fades by itself.
  await expect(host.locator(".fx-bubble")).toBeHidden({ timeout: 5000 });

  // ── A spectator's cheer reaches the players.
  await spec.getByRole("button", { name: "go Hosty!" }).click();
  await expect(host.locator(".fx-bubble")).toHaveText("go Hosty!", { timeout: 5000 });
  await expect(guest.locator(".fx-bubble")).toHaveText("go Hosty!", { timeout: 5000 });
  await host.screenshot({ path: "test-results/screens/fx-live-host-cheer.png" });
  await expect(host.locator(".fx-bubble")).toBeHidden({ timeout: 5000 });

  // From here on, every bubble the host's screen shows is recorded.
  await host.evaluate(() => {
    const seen: string[] = ((window as unknown as { __bubbles: string[] }).__bubbles = []);
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of Array.from(r.addedNodes))
          if (n instanceof HTMLElement && n.classList.contains("fx-bubble")) seen.push(n.textContent ?? "");
    }).observe(document.body, { childList: true, subtree: true });
  });
  const bubblesSeen = () => host.evaluate(() => (window as unknown as { __bubbles: string[] }).__bubbles);

  // ── Forgeries from an outside client with the publishable key.
  const outsider = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await outsider.auth.signInAnonymously();
  await outsider.realtime.setAuth();
  const join = (topic: string) =>
    new Promise<ReturnType<typeof outsider.channel>>((resolve) => {
      const ch = outsider.channel(topic, { config: { private: true } });
      ch.subscribe((s) => s === "SUBSCRIBED" && resolve(ch));
    });
  const fx = await join(`fx:${code}`);
  // Free text, a cheer claimed by a player, an absurd count: all dropped.
  for (const payload of [
    { event: "react", payload: { id: "<b>hi</b>", from: "guest" } },
    { event: "react", payload: { id: "go-host", from: "guest" } },
    { event: "typing", payload: { from: "guest", round: 1, len: 9999 } },
  ]) {
    const r = await fx.send({ type: "broadcast", ...payload });
    console.log("forged fx", payload.event, "->", r);
  }
  // A forged game state on the room topic: refused by the policy.
  const room = outsider.channel(`room:${code}`, { config: { private: true } });
  await new Promise<void>((resolve) => room.subscribe((s) => (s === "SUBSCRIBED" || s === "CHANNEL_ERROR") && resolve()));
  const forged = await room.send({
    type: "broadcast",
    event: "state",
    payload: { state: { phase: "matchend", round: 99 }, sentAt: Date.now() },
  });
  console.log("forged room state ->", forged);
  await host.waitForTimeout(1500);
  expect(await bubblesSeen(), "no forged reaction was shown").toEqual([]);
  // Positive control: a valid fx message from the same outsider does
  // arrive, so its sends work and the room topic is what refused it.
  await fx.send({ type: "broadcast", event: "react", payload: { id: "gg", from: "guest" } });
  await expect(host.locator(".fx-bubble")).toHaveText("gg!", { timeout: 5000 });
  await expect(host.locator(".fx-bubble")).toBeHidden({ timeout: 5000 });
  expect(await bubblesSeen()).toEqual(["gg!"]);
  // Nothing else arrived: the faded control bubble is still the last.
  await expect(host.locator(".fx-bubble")).toHaveText("gg!");
  await expect(host.locator(".fx-bubble")).toBeHidden();
  expect(await host.locator("body").innerHTML()).not.toContain("&lt;b&gt;hi");
  await expect(host.locator(".wp-root")).toHaveAttribute("data-phase", "race");
  await expect(guest.getByText("13 letters", { exact: true })).toBeVisible();
  // The host's own count is unaffected by the forged one either.
  await expect(spec.getByText(/9999/)).toHaveCount(0);
  await outsider.removeAllChannels();

  const noise = /Failed to load resource|vibrate|realtime|room-fx/i;
  for (const e of errs) expect(e.filter((x) => !noise.test(x))).toEqual([]);
});
