import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * F6 over a real Supabase: letters hidden until start, the server's clock,
 * one try, the board and "faster than", the streak, the collection and the
 * share card. A probe (`--config tests/e2e/probe.config.ts`); needs
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY of the dev server's project.
 */
test.setTimeout(150_000);

type Status = {
  number: number;
  day: string;
  state: "new" | "playing" | "done";
  streak: number;
  letters?: { start: string; end: string; minLength: number };
  startedAt?: number;
  result?: { word: string; timeMs: number; players: number; fasterThan: number; board: { name: string; timeMs: number }[] };
};

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const call = (p: Page, method: string, path: string, body?: unknown) =>
  p.evaluate(
    async ({ method, path, body }) => {
      const r = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const type = r.headers.get("content-type") ?? "";
      return { status: r.status, type, json: type.includes("json") ? await r.json() : null };
    },
    { method, path, body }
  );

async function player(browser: import("@playwright/test").Browser, name: string) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto("/");
  await page.evaluate((n) => localStorage.setItem("wordpinch:v1:name", n), name);
  await page.goto("/daily");
  return page;
}

test("daily pinch: one try on the server's clock", async ({ browser, browserName, playwright }) => {
  test.skip(browserName !== "chromium", "one engine is enough for the live flow");
  const api = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });

  // No session: today's number, but no letters.
  const anon = (await (await api.get("/api/daily")).json()) as Status;
  expect(anon.state).toBe("new");
  expect(anon.letters).toBeUndefined();
  expect((await api.post("/api/daily/start", { data: {} })).status()).toBe(401);
  expect((await api.get("/api/daily/card")).status()).toBe(401);

  const a = await player(browser, "Ada Probe");
  await a.getByRole("button", { name: "I'm ready" }).click();
  await expect(a.getByLabel(/Your word, starting with/)).toBeVisible({ timeout: 15_000 });
  let s = (await call(a, "GET", "/api/daily")).json as Status;
  expect(s.state).toBe("playing");
  const { start, end, minLength } = s.letters!;
  const startedAt = s.startedAt!;
  console.log("today", s.day, `#${s.number}`, `${start}…${end}`, "min", minLength);

  // Reloading or starting again doesn't reset the clock.
  await a.reload();
  await expect(a.getByLabel(/Your word, starting with/)).toBeVisible({ timeout: 15_000 });
  expect(((await call(a, "POST", "/api/daily/start", { name: "x" })).json as Status).startedAt).toBe(startedAt);

  // Rejections say why and stop nothing.
  const { suggestions } = (await (await api.get(`/api/words/suggest?start=${start}&end=${end}&min=${minLength}`)).json()) as {
    suggestions: string[];
  };
  expect(suggestions.length).toBeGreaterThanOrEqual(2);
  const wrongStart = `${start === "Z" ? "Y" : "Z"}${suggestions[0].slice(1)}`;
  for (const [word, reason] of [
    [`${start}${end}`, "too_short"],
    [wrongStart, "wrong_start"],
    [`${suggestions[0]}s`.replace(/s$/, end === "S" ? "x" : "s"), "wrong_end"],
    [`${start}qqqqx${end}`, "not_a_word"],
  ] as const) {
    const r = await call(a, "POST", "/api/daily/submit", { word });
    expect([word, r.status, r.json]).toEqual([word, 422, { error: reason }]);
  }
  expect(((await call(a, "GET", "/api/daily")).json as Status).state).toBe("playing");

  // A real word, through the page.
  const before = Date.now();
  await a.getByLabel(/Your word/).fill(suggestions[0].toUpperCase());
  await a.getByLabel(/Your word/).press("Enter");
  await expect(a.getByRole("heading", { level: 1, name: suggestions[0] })).toBeVisible({ timeout: 15_000 });
  s = (await call(a, "GET", "/api/daily")).json as Status;
  const aTime = s.result!.timeMs;
  console.log("A:", suggestions[0], aTime, "ms; players", s.result!.players);
  // The server measured from its own start stamp.
  expect(aTime).toBeGreaterThanOrEqual(before - startedAt - 50);
  expect(aTime).toBeLessThanOrEqual(Date.now() - startedAt + 50);
  // One try.
  expect(await call(a, "POST", "/api/daily/submit", { word: suggestions[1] })).toMatchObject({ status: 409, json: { error: "done" } });

  // B plays fast: the board and "faster than" follow.
  const b = await player(browser, "Bo Probe");
  expect(((await call(b, "GET", "/api/daily")).json as Status).letters).toBeUndefined();
  await b.getByRole("button", { name: "I'm ready" }).click();
  await expect(b.getByLabel(/Your word/)).toBeVisible({ timeout: 15_000 });
  const rb = await call(b, "POST", "/api/daily/submit", { word: suggestions[1] });
  expect(rb.status).toBe(200);
  const sb = (rb.json as { status: Status }).status;
  console.log("B:", sb.result!.timeMs, "ms, faster than", sb.result!.fasterThan, "% of", sb.result!.players);
  expect(sb.result!.timeMs).toBeLessThan(aTime);
  const times = sb.result!.board.map((r) => r.timeMs);
  expect(times).toEqual([...times].sort((x, y) => x - y));
  const sa = (await call(a, "GET", "/api/daily")).json as Status;
  expect(sa.result!.players).toBe(sb.result!.players);
  expect(sa.result!.fasterThan).toBeLessThan(100);

  // Streak: a finished pinch yesterday makes today the second day.
  const db = admin();
  // The newest "Ada Probe" today is this run's (earlier runs leave theirs).
  const { data: users } = await db
    .from("daily_attempts")
    .select("user_id")
    .eq("day", s.day)
    .eq("name", "Ada Probe")
    .order("started_at", { ascending: false })
    .limit(1);
  const aId = users![0].user_id as string;
  const yesterday = new Date(Date.parse(`${s.day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  await db.from("daily_puzzles").upsert(
    { day: yesterday, number: s.number - 1, start_letter: "T", end_letter: "H", min_length: 4 },
    { onConflict: "day", ignoreDuplicates: true }
  );
  await db.from("daily_attempts").insert({
    user_id: aId,
    day: yesterday,
    name: "Ada Probe",
    started_at: new Date(Date.now() - 86_400_000).toISOString(),
    finished_at: new Date(Date.now() - 86_390_000).toISOString(),
    word: "tooth",
    time_ms: 10_000,
  });
  expect(((await call(a, "GET", "/api/daily")).json as Status).streak).toBe(2);
  await a.reload();
  await expect(a.getByRole("img", { name: "2-day streak" })).toBeVisible({ timeout: 15_000 });

  // The word is in A's collection as a daily pinch.
  const col = (await call(a, "GET", "/api/collection")).json as { words: { word: string; daily_number: number | null; source: string }[] };
  expect(col.words.find((w) => w.word === suggestions[0])).toMatchObject({ source: "won", daily_number: s.number });

  // The card: A's PNG; nothing for someone who hasn't finished.
  const card = await call(a, "GET", "/api/daily/card");
  expect([card.status, card.type]).toEqual([200, "image/png"]);
  await a.goto("/api/daily/card");
  const size = await a.evaluate(() => {
    const img = document.querySelector("img");
    return img ? [img.naturalWidth, img.naturalHeight] : null;
  });
  expect(size).toEqual([1080, 1350]);
  await a.screenshot({ path: "test-results/screens/daily-live-card.png" });
  const c = await player(browser, "Cy Probe");
  // Before starting, Cy has no account yet (the page signs in on start).
  expect((await call(c, "GET", "/api/daily/card")).status).toBe(401);
  await c.getByRole("button", { name: "I'm ready" }).click();
  await expect(c.getByLabel(/Your word/)).toBeVisible({ timeout: 15_000 });
  expect((await call(c, "GET", "/api/daily/card")).status).toBe(404);
  await api.dispose();
});
