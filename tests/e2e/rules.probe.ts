import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * F4 over a real Supabase: "No repeat letters" and "Peek hint" are
 * enforced by the server. A probe (`--config tests/e2e/probe.config.ts`);
 * needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY of the dev
 * server's project.
 */
test.setTimeout(180_000);

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function roomState(code: string) {
  const { data, error } = await admin().from("rooms").select("state").eq("code", code).single();
  if (error) throw error;
  return data.state as {
    phase: string;
    round: number;
    settings: { noRepeat?: boolean; peek?: boolean; rounds: number };
    usedLetters?: { round: number; letters: string[] }[];
    peeks?: Record<string, number>;
    pick: { firstPicker: "host" | "guest" };
  };
}

function errorsOf(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  return errs;
}

const phase = (p: Page, name: string) =>
  expect(p.locator(".wp-root")).toHaveAttribute("data-phase", name, { timeout: 30_000 });

const post = (p: Page, path: string, body: unknown) =>
  p.evaluate(
    async ({ path, body }) => {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    { path, body }
  );

/** Pick `a`…`b` (first picker's letter first) and wait for the race. */
async function pickRound(host: Page, guest: Page, a: string, b: string) {
  for (const p of [host, guest]) await phase(p, "pick");
  await expect(host.getByRole("heading", { level: 1 })).toContainText(/(first|last) letter/);
  const first = (await host.getByRole("heading", { level: 1 }).textContent())!.includes("first") ? host : guest;
  const last = first === host ? guest : host;
  await first.getByRole("radio", { name: a, exact: true }).click();
  await first.getByRole("button", { name: `Lock in ${a}` }).click();
  await last.getByRole("radio", { name: b, exact: true }).click();
  await last.getByRole("button", { name: `Lock in ${b}` }).click();
  for (const p of [host, guest]) await phase(p, "race");
  return { first, last };
}

test("no-repeat and peek are enforced by the server", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "one engine is enough for the live flow");
  const host = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const guest = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = [errorsOf(host), errorsOf(guest)];

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
  for (let i = 0; i < 3; i++) await host.getByRole("button", { name: "Decrease Rounds" }).click();
  await host.getByRole("switch", { name: /No repeat letters/ }).click();
  await host.getByRole("switch", { name: /Peek hint/ }).click();
  await expect.poll(async () => {
    const s = await roomState(code);
    return [s.settings.rounds, s.settings.noRepeat, s.settings.peek];
  }).toEqual([2, true, true]);
  // The guest's lobby shows them on, read-only.
  await expect(guest.getByRole("switch", { name: /Peek hint/ })).toHaveAttribute("aria-checked", "true");

  await host.getByRole("button", { name: "Start game" }).click();

  // ── Round 1: T…H. The host peeks.
  await pickRound(host, guest, "T", "H");
  let s = await roomState(code);
  expect(s.usedLetters).toEqual([{ round: 1, letters: expect.arrayContaining(["T", "H"]) }]);
  await host.getByRole("button", { name: "Peek a letter · 1" }).click();
  await expect(host.getByRole("button", { name: "Peek used" })).toBeDisabled();
  const chip = host.locator("[data-peek]").filter({ visible: true });
  await expect(chip).toHaveText(/^[A-Z]$/);
  const letter = (await chip.textContent())!;
  console.log("round 1 peek letter", letter);
  // The letter reaches nobody else: not the row, not the guest's screen.
  s = await roomState(code);
  expect(s.peeks).toEqual({ host: 1 });
  await expect(guest.locator("[data-peek]")).toHaveCount(0);
  await expect(guest.getByRole("button", { name: "Peek a letter · 1" })).toBeEnabled();
  // A reload in the same round shows the same letter again.
  await host.reload();
  await phase(host, "race");
  await expect(host.locator("[data-peek]").filter({ visible: true })).toHaveText(letter, { timeout: 10_000 });
  await expect(host.getByRole("button", { name: "Peek used" })).toBeDisabled();
  // Asking the server again the same round: same letter, nothing new spent.
  expect((await post(host, `/api/rooms/${code}/peek`, {})).body).toEqual({ letter });

  await host.getByLabel("Your word, starting with T and ending with H").fill("TOOTH");
  await host.getByLabel("Your word, starting with T and ending with H").press("Enter");
  for (const p of [host, guest]) await phase(p, "result");
  await host.getByRole("button", { name: /Next round/ }).click();

  // ── Round 2: T and H are now used.
  for (const p of [host, guest]) await phase(p, "pick");
  for (const p of [host, guest]) {
    for (const l of ["T", "H"]) await expect(p.getByRole("radio", { name: `${l}, already picked` })).toBeDisabled();
    await expect(p.getByText("already picked this match")).toBeVisible();
  }
  // The server refuses a used letter even when the client asks directly.
  const refused = await post(host, `/api/rooms/${code}/lock-letter`, { letter: "T" });
  console.log("lock used letter ->", refused);
  expect(refused).toEqual({ status: 409, body: { error: "letter_used" } });
  // The peek record survived the referee's state writes (result, next round).
  expect((await roomState(code)).peeks).toEqual({ host: 1 });

  await pickRound(host, guest, "S", "P");
  // Spent in round 1: the host's button says so, the server agrees.
  await expect(host.getByRole("button", { name: "Peek used" })).toBeDisabled();
  expect(await post(host, `/api/rooms/${code}/peek`, {})).toEqual({ status: 409, body: { error: "used" } });
  // The guest still has theirs.
  await guest.getByRole("button", { name: "Peek a letter · 1" }).click();
  await expect(guest.locator("[data-peek]").filter({ visible: true })).toHaveText(/^[A-Z]$/);
  expect((await roomState(code)).peeks).toEqual({ host: 1, guest: 2 });
  await guest.screenshot({ path: "test-results/screens/rules-live-guest-peek.png" });

  // ── A rematch starts the letters and peeks fresh.
  await host.getByLabel(/Your word, starting with S/).fill("SHIP");
  await host.getByLabel(/Your word, starting with S/).press("Enter");
  for (const p of [host, guest]) await phase(p, "result");
  await host.getByRole("button", { name: /Next round/ }).click();
  for (const p of [host, guest]) await phase(p, "matchend");
  await host.getByRole("button", { name: "Rematch" }).click();
  for (const p of [host, guest]) await phase(p, "lobby");
  await host.getByRole("button", { name: "Start game" }).click();
  for (const p of [host, guest]) await phase(p, "pick");
  s = await roomState(code);
  expect([s.usedLetters, s.peeks]).toEqual([[], {}]);
  await expect(host.getByRole("radio", { name: /already picked/ })).toHaveCount(0);

  const noise = /Failed to load resource|vibrate|realtime|room-fx|409/i;
  for (const e of errs) expect(e.filter((x) => !noise.test(x))).toEqual([]);
});
