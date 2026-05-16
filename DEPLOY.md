# Deploying wordpinch

End-to-end checklist for getting wordpinch live on Vercel + Supabase. v1 ships **single-host-drives-the-game** (Phase 6 round loop). Phase 7 (guest dual-auth) is planned as a follow-up; until then, both browsers see the host's state in real-time but only the host can advance phases.

## 1 · Supabase (prod project, optional)

You already have `wordpinch-dev`. For production you can either:

- **Reuse `wordpinch-dev`** — free tier, fine for low traffic. Skip this section.
- **Create `wordpinch-prod`** — clean isolation.

If creating a separate prod project:

```bash
# In the Supabase dashboard, create org → Leon Mathis, project → wordpinch-prod.
# Set: auto-RLS ON, auto-expose ON, Data API enabled.

# Locally, swap the link:
supabase link --project-ref <PROD_REF>
supabase db push    # applies all migrations under supabase/migrations/

# Verify
supabase migration list
```

Either way: copy the publishable + secret keys from `Settings → API` for the env step below.

## 2 · Vercel project

```bash
# In repo root:
npx vercel link          # picks up the repo, asks for project name
npx vercel               # one-off preview deploy to smoke-test

# After preview is green:
npx vercel --prod        # production push
```

Or via the dashboard: New Project → import `leonmathis/wordpinch` → Framework: Next.js (autodetect).

## 3 · Environment variables (Vercel dashboard)

Settings → Environment Variables. Add all three:

| Name | Value | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (Supabase: Settings → API) | All scopes |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` (Supabase: Settings → API) | **Production + Preview only**, NOT Development |

> ⚠️ `SUPABASE_SECRET_KEY` must NEVER be exposed to the browser. Vercel doesn't ship non-`NEXT_PUBLIC_` vars to client bundles, but double-check anyway by inspecting the deployed `_next/static/chunks/*.js` doesn't contain `sb_secret_`.

Trigger a redeploy after setting env vars (push, or "Redeploy" in the dashboard).

## 4 · Domain (optional)

Buy / point a domain (e.g. `wordpinch.app`) → Vercel project → Settings → Domains. Vercel handles TLS automatically.

## 5 · Smoke test

On two real devices (or two browsers in incognito):

1. Device A opens `https://wordpinch.app`
2. Device A clicks **Create new room** → URL becomes `/r/XXXX`
3. Device A shares the URL with Device B (paste / scan QR from share dialog)
4. Device B opens the same URL → also lands in lobby with the host shown
5. Device A clicks **Start game** → both devices transition to Pick
6. Device A types a letter + Enter → both transition through Reveal → Race
7. Device A types a valid word + Enter → both go to Result
8. Device A clicks **Next** until matchend
9. Device A clicks **Rematch** → both reset to a fresh lobby

Pass = full match plays on the deployed URL without errors in the browser console.

## 6 · Operational notes

- **Realtime quota**: Supabase free tier is 200 concurrent connections + 2M messages/month. Plenty for v1.
- **DB cleanup**: rooms accumulate forever. Add a cron job (Vercel cron or Supabase scheduled function) to `DELETE FROM rooms WHERE updated_at < now() - interval '24 hours'` once usage justifies it.
- **Wordlist bundle**: `src/lib/words/data/enable1.txt.gz` (~440 KB) ships with the `/api/words/validate` serverless function via `outputFileTracingIncludes` in `next.config.ts`. First call per cold start pays ~80 ms to decompress; subsequent calls are O(1).
- **Sounds + haptics**: synthesized in-browser via Web Audio (no audio files). Mute persists via `wordpinch:v1:muted` in localStorage.
- **Theme**: system-aware light/dark via next-themes. CSS `dark:`-toggled Sun/Moon icons — no hydration flicker.

## 7 · What's not yet shipped (follow-ups for v1.1+)

| | Why deferred |
|---|---|
| Guest dual-auth (`rooms.guest_id` column + `/api/rooms/[code]/join` + auth on POST state) | Phase 7 — non-blocking for solo demo |
| Length-bonus / tie-behavior / no-repeat scoring rules | Phase 7 — settings UI exists, rules engine pending |
| 10s race-timer grace period on disconnect | Phase 7 — depends on dual-auth (so we know whose disconnect to grace) |
| Web Share API mobile sheet | Nice-to-have — copy + QR cover most cases |
| Cron-based room expiry | Operational — wait for real usage data |

When you tackle these, the existing scaffold (action helpers + realtime channel + state shape) should make each a focused PR.
