# wordpinch — roadmap

10-phase build plan from scaffold to deployed multiplayer game. Phases 1–2 are done; phase 3 is in progress. Each phase's gate is "everything in the checklist below is green."

| Phase | Title | State |
|---|---|---|
| 1 | Scaffold | ✅ |
| 2 | Static screens | ✅ |
| 3 | Supabase wiring (DB + REST) | 🟡 in progress |
| 4 | Realtime (Broadcast + Presence) | ⏳ |
| 5 | Word validation | ⏳ |
| 6 | Round loop | ⏳ |
| 7 | Rules + scoring | ⏳ |
| 8 | Polish (sound / share / haptic / dots) | ⏳ |
| 9 | Match end + rematch | ⏳ |
| 10 | Deploy | ⏳ |

---

## Phase 3 — Supabase wiring (in progress)

Get persistent room state working end-to-end via Next.js route handlers. No realtime yet; just create-a-room → refresh-and-it's-still-there.

**DB (mostly done)**
- [x] `supabase init` + migration file at `supabase/migrations/*_wordpinch_rooms.sql`
- [x] `.env.example` template
- [x] Single root `.gitignore` (no `supabase/.gitignore`)
- [ ] `supabase db push` — applies migration to `wordpinch-dev`
- [ ] Verify with `supabase migration list` + dashboard Table Editor
- [ ] *(optional)* reconnect the Supabase MCP to `wordpinch-dev` so I can run `apply_migration` / `get_advisors` going forward

**SDK clients**
- [ ] `npm install @supabase/ssr @supabase/supabase-js`
- [ ] `src/lib/supabase/client.ts` — `createBrowserClient` with publishable key (RSC-safe read access)
- [ ] `src/lib/supabase/server.ts` — `createServerClient` with publishable key (cookie-aware for RSC + route handlers)
- [ ] `src/lib/supabase/admin.ts` — `createClient` with secret key (bypasses RLS, server-only, never imported by a client file)

**Client identity**
- [ ] `src/lib/hooks.ts` — add `useClientId()` returning a stable UUID persisted in `localStorage["wordpinch:v1:client-id"]`

**API routes**
- [ ] `POST /api/rooms` — body `{ hostId }`. Generate a 4-char code from `[A-HJ-NP-Z2-9]`, retry on unique-violation. Seed `state` from `initialGameState({ hostId })`. Return `{ code }`.
- [ ] `GET /api/rooms/[code]` — return current row's `state`. 404 on miss.
- [ ] `POST /api/rooms/[code]/state` — body `{ hostId, state }`. Validate `hostId` matches row's `host_id`; replace `state`. 403 on mismatch.

**Wire the UI**
- [ ] `Landing` "Create new room" → `POST /api/rooms` with `useClientId()`, `router.push('/r/' + code)`
- [ ] `Landing` "Join" input → on submit, `router.push('/r/' + value.toUpperCase())`
- [ ] `/r/[code]/page.tsx` → `await fetch('/api/rooms/' + code)`. If 404 in production, render a "room not found" state. In dev with `?phase=…`, keep falling back to MOCK so design previewing still works.
- [ ] Drop `MOCK.you/.them/.roomCode/.url` reads from `WordpinchUI` where real state exists

**Phase 3 gate**
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] `npm run build` clean
- [ ] `get_advisors` (security + performance) reports 0 issues
- [ ] Visual: open `/`, click "Create new room" → URL becomes `/r/XXXX`. Refresh → same room loads. Open in a second browser → same state visible.

---

## Phase 4 — Realtime

Replace "POST to update state, GET to read it" with live channels between players.

- [ ] Pick channel pattern: `room:<code>` per room
- [ ] `src/lib/realtime.ts` — channel factory: `joinRoom(code, clientId, name)` → returns `{ channel, presence, sendIntent }`
- [ ] Broadcast intents: `pick_letter`, `submit_word`, `start_game`, `update_settings`, `next_round`, `rematch`, `leave`
- [ ] Server snapshots: route handler writes new state to DB, then broadcasts `state` event
- [ ] Presence: each client tracks `{ clientId, name, role: 'player' | 'spectator', typing: bool }`. First 2 distinct `clientId`s become `host` / `guest`; subsequent connections become `spectator`.
- [ ] Reconnect logic: detect channel `CLOSED`, show `<ReconnectBanner />`, retry until reconnected, hide banner
- [ ] Replace `setPhase` in `WordpinchUI` with a reducer driven by incoming `state` events
- [ ] Drop the dev phase strip (or keep it gated behind a query flag for design QA)

**Phase 4 gate**
- [ ] Two browsers in different rooms don't see each other's events
- [ ] Two browsers in the same room: clicking Start in one moves both to pick phase
- [ ] Kill one window mid-race → banner appears in the other, disappears on reconnect
- [ ] 3rd browser on same code lands as spectator (read-only race view)

---

## Phase 5 — Word validation

- [ ] `src/lib/words/validate.ts` — server-side: hit `https://api.dictionaryapi.dev/api/v2/entries/en/<word>`, parse phonetic + meanings
- [ ] `src/lib/words/wordlist.ts` — lazy-load `public/wordlist.en.txt.gz` as a `Set<string>` for fallback (when API 5xx)
- [ ] `POST /api/words/validate` — body `{ word }`. Return `{ valid: bool, phonetic?, meanings? }`
- [ ] Wire `RacePhase` to call validate on Enter; show shake + flash on invalid; broadcast `submit_word` on first valid
- [ ] Source the ENABLE wordlist (~170K words, ~1MB gzipped) and add to `public/`

**Phase 5 gate**
- [ ] Submitting a real word → result phase with definition
- [ ] Submitting gibberish → shake animation, input stays focused
- [ ] API 5xx → still accepts valid words via fallback (no definition shown)

---

## Phase 6 — Round loop

- [ ] Wire phase transitions via realtime: lobby → pick → reveal → race → result → next round or matchend
- [ ] Server-side countdown (sync the 3-2-1-GO across both clients precisely)
- [ ] Server-side race timer; broadcasts `time_up` event when 0
- [ ] After result, auto-advance after 5s (or "Next →" link)

**Phase 6 gate**
- [ ] Full single match plays through round 1 → match end with both clients in sync

---

## Phase 7 — Rules + scoring

- [ ] Apply lobby settings to the running match: `rounds`, `roundTimerSec`, `minWordLength`, `tieBehavior`, `noRepeatWords`
- [ ] Scoring: simple +1 per round win; +1 length bonus per letter beyond `minWordLength` (toggle)
- [ ] Tie behavior: `replay` (re-run round), `split` (both +1), `nobody` (no points)
- [ ] No-repeat: reject words already in `state.usedWords`
- [ ] Alternating first-picker (host first round, guest round 2, …)
- [ ] Rematch swaps host/guest (so the "host" label rotates and `firstPicker` calc stays correct)

**Phase 7 gate**
- [ ] Configure each rule in Lobby → start match → behavior matches setting
- [ ] Tie path tested by forcing same word in both players (or via simulate-reject toggle)

---

## Phase 8 — Polish

- [ ] **Sounds**: countdown tick, win ding, reject buzz, match-end chime
  - [ ] 4 CC0 mp3s in `public/sounds/`
  - [ ] `src/lib/sound.ts` lazy-load + mute gate (already have `useStoredBool("muted")`)
- [ ] **Share dialog**: replace decorative QR with `qrcode` lib rendering the real room URL
- [ ] **Web Share API**: detect `navigator.share` and show a Share… button on mobile
- [ ] **Mobile haptic**: `navigator.vibrate(10)` on round win
- [ ] **Match progress bar**: wire `(round / total) * 100%` to real round (already in `TopChrome`, just needs real `round`/`total`)
- [ ] **Used-words panel**: wire to `state.usedWords` (already in UI shell, just needs real data plumbing)
- [ ] **Presence dots**: green when typing (use `presence.typing` from realtime)
- [ ] **Keyboard polish**: Esc clears race input, focus auto-returns on phase change (most of this is already in)

**Phase 8 gate**
- [ ] All 4 sounds play (audible, not muted)
- [ ] Real QR scans to `https://wordpinch.app/r/<code>` (or whatever the prod URL is)
- [ ] Web Share button visible on mobile, hidden on desktop
- [ ] Match progress bar reflects real round count

---

## Phase 9 — Match end + rematch

- [ ] After last round's result, auto-advance to matchend
- [ ] Final scoreboard reflects real scores
- [ ] Used-words list reflects real `state.usedWords`
- [ ] Rematch button: reset state, swap host/guest, navigate both clients back to lobby

**Phase 9 gate**
- [ ] Full 5-round match from lobby to matchend, then rematch starts a fresh match with swapped host

---

## Phase 10 — Deploy

- [ ] Vercel project linked to GitHub repo (push triggers preview deploy)
- [ ] Add Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- [ ] Buy/configure domain (e.g. `wordpinch.app`)
- [ ] Create separate `wordpinch-prod` Supabase project (or use Supabase branches off `wordpinch-dev`)
- [ ] Smoke test: full match on 2 real devices over LTE

**Phase 10 gate**
- [ ] Real match plays cleanly between 2 devices on the deployed URL

---

## Open items (decide as we hit them)

These are flagged in the original plan; revisit during the relevant phase:

- **Reconnect grace period**: how long to pause the race timer if a player drops mid-race before auto-forfeiting (proposed: 10s).
- **Letter input filter**: A–Z only, no diacritics (v1).
- **Race input first-letter pre-fill**: pre-fill locked (current behavior) vs hint-only (cleaner?). Current is locked.
- **Audio sourcing**: CC0 from freesound vs synth-generated. Decide in phase 8.
- **Wordlist size**: ENABLE (~170K, ~1MB gz) vs SOWPODS vs custom. ENABLE is the v1 pick.
