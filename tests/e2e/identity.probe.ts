import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * F1 identity against a real Supabase (anonymous sign-ins enabled): who
 * holds a seat, the clientId → account move, and that an account id is
 * worthless without its session. Writes rooms and accounts, so it is a
 * probe (`--config tests/e2e/probe.config.ts`) and needs
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY of the same project the
 * dev server uses.
 */
test.setTimeout(60_000);

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function seats(code: string) {
  const { data, error } = await admin().from("rooms").select("host_id, guest_id").eq("code", code).single();
  if (error) throw error;
  return data as { host_id: string; guest_id: string | null };
}

async function account(id: string) {
  const { data } = await admin().auth.admin.getUserById(id);
  return data.user;
}

const authCookies = async (ctx: BrowserContext) =>
  (await ctx.cookies()).filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

const legacyId = (page: Page) => page.evaluate(() => localStorage.getItem("wordpinch:v1:client-id"));

async function createRoom(page: Page) {
  await page.goto("/");
  await page.locator('[data-landing="modes"]:visible button').first().click();
  await page.waitForURL(/\/r\/[A-Z0-9]{4}$/, { timeout: 20_000 });
  return page.url().slice(-4);
}

test("a fresh visitor gets an anonymous account and holds the host seat", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  expect(await authCookies(ctx), "the landing page alone signs nobody in").toEqual([]);

  const code = await createRoom(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(code);
  const { host_id } = await seats(code);
  const user = await account(host_id);
  console.log("room", code, "host", host_id, "anonymous", user?.is_anonymous);
  expect(user?.is_anonymous).toBe(true);
  expect((await authCookies(ctx)).length).toBeGreaterThan(0);
  expect(await legacyId(page), "no clientId is minted when sign-in works").toBeNull();
  // Reload: same account, still the host.
  await page.reload();
  await expect(page.getByText("send it to your rival")).toBeVisible({ timeout: 20_000 });
  expect((await seats(code)).host_id).toBe(host_id);
  await ctx.close();
});

test("a pre-F1 clientId's seat moves onto the new account", async ({ browser, playwright }) => {
  const legacy = crypto.randomUUID();
  const api = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  const res = await api.post("/api/rooms", { data: { hostId: legacy } });
  expect(res.status()).toBe(201);
  const { code } = (await res.json()) as { code: string };
  expect((await seats(code)).host_id).toBe(legacy);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((id) => localStorage.setItem("wordpinch:v1:client-id", id), legacy);
  await page.goto(`/r/${code}`);
  await expect(page.getByText("send it to your rival")).toBeVisible({ timeout: 20_000 });
  const { host_id } = await seats(code);
  console.log("room", code, "legacy", legacy, "→", host_id);
  expect(host_id).not.toBe(legacy);
  expect((await account(host_id))?.is_anonymous).toBe(true);
  await expect.poll(() => legacyId(page)).toBeNull();

  // The old id no longer opens the seat.
  const me = await api.post(`/api/rooms/${code}/me`, { data: { clientId: legacy } });
  expect(await me.json()).toEqual({ role: "guest_unclaimed" });
  await ctx.close();
  await api.dispose();
});

test("an account id is refused without that account's session", async ({ browser, playwright }) => {
  const hostCtx = await browser.newContext();
  const code = await createRoom(await hostCtx.newPage());
  const { host_id } = await seats(code);

  // No cookie, the host's account id in the body.
  const api = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  for (const [path, data] of [
    [`/api/rooms/${code}/me`, { clientId: host_id }],
    [`/api/rooms/${code}/rename`, { clientId: host_id, name: "Mallory" }],
    ["/api/rooms", { hostId: host_id }],
  ] as const) {
    const r = await api.post(path, { data });
    console.log(path, r.status());
    expect(r.status(), path).toBe(401);
  }
  expect((await api.post("/api/identity/adopt", { data: { clientId: host_id } })).status()).toBe(401);

  // Another signed-in player: the body id is ignored, and adopting the
  // host's account id is refused.
  const other = await (await browser.newContext()).newPage();
  await other.goto(`/r/${code}`);
  await expect.poll(async () => (await seats(code)).guest_id, { timeout: 20_000 }).not.toBeNull();
  const probe = await other.evaluate(async ({ code, hostId }) => {
    const post = (url: string, body: unknown) =>
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const me = await (await post(`/api/rooms/${code}/me`, { clientId: hostId })).json();
    const adopt = (await post("/api/identity/adopt", { clientId: hostId })).status;
    return { me, adopt };
  }, { code, hostId: host_id });
  console.log("other player", probe);
  expect(probe.me).toEqual({ role: "guest" });
  expect(probe.adopt).toBe(403);
  expect((await seats(code)).host_id).toBe(host_id);
  await api.dispose();
});

test("when anonymous sign-in fails the browser plays on its clientId", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.route("**/auth/v1/signup**", (r) =>
    r.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ code: "anonymous_provider_disabled", msg: "Anonymous sign-ins are disabled" }),
    })
  );
  const page = await ctx.newPage();
  const code = await createRoom(page);
  await expect(page.getByText("send it to your rival")).toBeVisible({ timeout: 20_000 });
  const legacy = await legacyId(page);
  const { host_id } = await seats(code);
  console.log("room", code, "fallback host", host_id);
  expect(legacy).toMatch(/^[0-9a-f-]{36}$/);
  expect(host_id).toBe(legacy);
  expect(await account(host_id)).toBeNull();
  expect(await authCookies(ctx)).toEqual([]);
  await ctx.close();
});
