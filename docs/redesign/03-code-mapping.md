# Redesign step 3: mapping the design onto the code

**Inputs:**
- [01-inventory.md](01-inventory.md): what exists.
- [02-design-progress.md](02-design-progress.md): rules, tokens, decisions.
- The canvas: https://claude.ai/artifact/UxU5iL3Whgc5K2tDWkxdqR

**Status:** draft, 31.10.2026, against commit `2cd752e`.

The plan has two parts:
- **Reskin (R-PRs):** game logic stays unchanged.
- **New features (F-PRs):** each has its own server work.

Every PR leaves the game playable.

---

## 1. What the codebase gives us (checked 31.10.)

| Area | Today | Source |
|---|---|---|
| Fonts | Geist Sans + Geist Mono via `next/font/google` | `src/app/layout.tsx:2,8-16` |
| Theme | `next-themes`, `attribute="class"`, `defaultTheme="system"`; `themeColor` #ffffff / #0a0a0a | `layout.tsx:28-32,57-61` |
| Tokens | shadcn neutral oklch values in `:root` and `.dark` | `globals.css:52-121` |
| Component CSS | ~45 game classes (`wp-*`, `room-code`, `pick-input`, `race-input`, `result-word`, `used-row`, `advance-bar`, `qr`, …) | `globals.css:187-514` |
| Primitives | shadcn on `@base-ui/react`: alert, button, dialog, input, label, separator, sonner, switch, toggle, toggle-group | `src/components/ui/` |
| Button variants | default, outline, secondary, ghost, destructive, link; sizes default (h-8), xs, sm, lg (h-9), icon variants up to size-9 | `ui/button.tsx:9-38` |
| Motion | `motion/react`; reduced-motion handled in some places, with 6 gaps | inventory §2 |
| Realtime | private room channel. Clients **can only receive broadcasts and track their own presence**; only the server publishes `state` | `use-room-channel.ts:104-110`, migration `20260518000000_lock_realtime_room_channel.sql` |
| Presence payload | `{ name, role, joinedAt }`, keyed by a per-mount session id. Role is self-reported | `use-room-channel.ts:124-130` |
| Per-player submit signal | `pendingResult.attempts[].by` (host/guest) | `state-schema.ts:138-140`, `wordpinch-ui.tsx:175-182` |
| Anonymous auth | `signInAnonymously` exists in the installed `@supabase/auth-js` | `node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts` |
| Next 16 docs to read first | fonts, metadata and OG images, route handlers | `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`, `14-metadata-and-og-images.md`, `15-route-handlers.md` |

---

## 2. Foundations

### Tokens (`src/app/globals.css`)
- **`:root` and `.dark`:** replace the neutral oklch values with the D tokens from 02 §Tokens. The shadcn names stay so primitives keep working:
  - `--background`, `--foreground`, `--card` (white / `#2A2621`)
  - `--muted`, `--muted-foreground`, `--primary` (ink / cream), `--destructive` (`#B3261E` / `#FF8A80`)
  - `--muted-foreground` is `#4F4A40`, darker than the design grey `#555555`. Measured 31.10.: `#555555` reaches only 4.44:1 on the pick pink, while `#4F4A40` gives ≥5.2:1 on every phase background.
  - `--ring`, `--radius` (pill-first)
- **New tokens:**
  - phase backgrounds: `--phase-landing`, `--phase-lobby`, `--phase-pick`, `--phase-reveal`, `--phase-race`, `--phase-result`, `--phase-matchend`, `--phase-daily`, `--phase-quick`, `--phase-pass`
  - shape fills: `--shape-blue`, `--shape-pink`, `--shape-yellow`, `--shape-sage`, `--shape-magenta`
  - anchor letters: `--anchor-first`, `--anchor-last`
  - inner rows: `--row`
- **Dark mode:** all phase backgrounds resolve to `#1B1915`; shape fills stay pastel.
- **Phase background:** `.wp-root[data-phase="…"]` sets `background: var(--phase-…)`, with a 260 ms colour transition, none under reduced motion. `wordpinch-ui.tsx` sets `data-phase` on `.wp-root` (line 383).

### Fonts (`src/app/layout.tsx`)
- Replace Geist with **Urbanist** (500–800) as `--font-sans` and **Gochi Hand** (400) as `--font-hand`. Check `13-fonts.md` for the current `next/font/google` API first.
- **Geist Mono stays until R10.** Not only the room-code input uses `font-mono`: so do the `.t-label`/`.t-label-up` helpers and several screens. It goes once the last of them is migrated.
- **`themeColor`:** `#F5F0E3` light, `#1B1915` dark.

### Toasts (`src/components/ui/sonner.tsx`)
Restyle to ink pills (cream in dark) with the coloured status dot. Keep `richColors` off so the D colours win.

---

## 3. Shared building blocks (new)

All live in `src/components/game/kit/` unless noted. They're shadcn-first: primitives get variants, they aren't re-implemented.

| Building block | What it is | Rules it encodes |
|---|---|---|
| `ui/button.tsx` variants | add `variant: pill` (ink), `pill-soft` (white/surface), `circle` (44px icon); sizes `pill-lg` (56px), `pill-md` (44px). Keep the existing variants for anything not yet migrated | 44px minimum touch target |
| `ui/input.tsx` variant | `pill` (52–60px, surface background, 2px magenta ring when `aria-invalid`) | race input font steps (24 → 19px past 13 letters) via a prop |
| `ui/switch.tsx` | restyle to 48×28, ink track on, knob light | none |
| `ui/toggle-group.tsx` | segmented pill (tie behaviour, theme, collection filter) | segments are 44px tall, not the canvas's 38px (touch-target rule); `variant="segment"` defaults to a 4px gap |
| `ui/dialog.tsx` | add `variant: sheet`: bottom sheet below 640px, centred 440px dialog above | none |
| `Shape` (`square`, `star`, `flower`, `circle`) | inline SVG / div shapes with a fill prop | optical sizing (square 74%, circle 81% of the box); `safeInset` per shape (square 13%, circle 15%, star 30%, flower 22%) |
| `ShapeGlyph` | Gochi Hand letter inside a `Shape` | per-glyph offset table: T, H, N `padding-top: .16em`; "?" `translate(.02em,.13em)`; correct when ≥5% off. Measure all 26 once with the `measureText` script from 02 |
| `LetterSlots` | first-letter square + `_ _ _` + last-letter star; replaces `letters-display.tsx` | form = meaning, colour adapts to the phase |
| `AnchoredWord` | a word with coloured first and last letters | size steps 60 / 48 / 38px by length; `overflow-wrap:anywhere` |
| `Avatar` (restyle `avatar.tsx`) | pastel circle + Gochi initial | no glyph correction for initials |
| `TopBar` + `SettingsMenu` | round label + inline score + progress pills + gear menu (room/share, sound, theme, how to play, leave); replaces `top-chrome.tsx` | names truncate, scores never |
| `StatusPill` | banner pill with icon circle + text + optional action | used by reconnect, role error, opponent away, spectator |
| `ScoreCard`, `AwardCard`, `Stepper`, `SettingRow` | small composites for result, match end and lobby | no divider lines; spacing only |
| `KeyboardSpacer` | none (design-only grey block) | real layout: content above the fold; use `interactive-widget=resizes-content` in the viewport meta. Check `layout.tsx` viewport support in the Next 16 docs first |

A dev-only route `src/app/dev/kit/page.tsx` (gated like the phase strip, `NODE_ENV === "development"`) renders every kit component in light and dark. Baseline and regression screenshots come from there.

---

## 4. Screen by screen

Legend:
- **R:** restyle in place.
- **RW:** rewrite the render tree, keep the logic.
- **N:** new file.

| File | Design (canvas row) | Action | Notes |
|---|---|---|---|
| `top-chrome.tsx` | D · Menu | RW → `TopBar` + `SettingsMenu` | theme toggle, mute, share and leave move into the menu. The 2px progress bar becomes round pills. The counter moves into the label. **Done in R3:** the component keeps the name `TopChrome` and its absolute slot (so `.wp-body` spacing is unchanged). The inline score stays in `ScoreHud` until R6–R8, to avoid showing it twice. `.wp-banners` starts at 66px because the 44px gear ends at 58px. The popover comes from `npx shadcn add popover`; the CLI wrongly imported `cn` from an npm package of that name and installed it, which was reverted to `@/lib/utils` |
| `score-hud.tsx` | race/pick top bar | RW | inline score moves into `TopBar`; "Words played" becomes a pill (phone) / card (desktop) |
| `letters-display.tsx` | everywhere | replace with `LetterSlots` | delete once unused |
| `landing.tsx` | Step 2 · Landing | RW | mode grid of 4 `Shape` buttons + join row. **Name input removed** (lobby already has `NameEditor`, `lobby.tsx:182-206`, and the "add your name" hint, `lobby.tsx:363-368`). Create errors move under the grid. Daily, Quick and Pass shapes stay behind a feature flag until their F-PR ships. **Done in R4:** flags in `src/lib/features.ts` (plain consts, no env switch); with only "Play a friend" on, it renders as one 1.25× shape. The grid lives in `kit/mode-grid.tsx` so `/dev/kit` tests the same buttons. Fixed a latent `Shape` bug: Button's `[&_svg]:size-4` icon rule shrank star and flower backdrops to 16px, so SVG backdrops now size inline. The short-code join error is unreachable once hydrated, because Join stays disabled below 4 characters, as before |
| `app/r/[code]/not-found.tsx` | Step 2 · 404 | RW | starburst 404 + `TopBar`. **Done in R4:** shared `not-found-screen.tsx`, also used by a new root `app/not-found.tsx`. In dev, `/r/XXXX` 404s log next-themes' "script tag" warning (predates R4, absent in `next start`) |
| `lobby.tsx` | Step 2 · Lobby | R | settings in 3 cards (Game / Rules / Sound), no dividers; `NumberStepper` → `Stepper` (44px); guest view dimmed with "only {host} can change these"; New rows (no repeat, peek) added in F4. **Done in R5:** controls dim once via their own `disabled` style (the artboard's extra 0.6 on top made them near invisible in dark). Copy link copies the URL, QR opens the share sheet, Share uses the Web Share API with the sheet as fallback. The CTA wraps for 32-character names. The name nudge reads "so your rival / {host} knows". Fixed in passing: `.wp-chrome` is now opaque in the phase colour (64px), because scrolled content ran through the wordmark and gear. Dev preview: `?as=host|guest&guest=0&stress=1` seeds a room without network (`lib/game/preview.ts`) |
| `pick-phase.tsx` | Step 2 · Pick | RW | single-letter input → **alphabet grid** (`role=radiogroup`). Typing a letter on a physical keyboard still selects it (keep a keydown handler); Enter locks. Locked state, "Change letter" and the 45s skip card keep their logic (`pick-phase.tsx:23,135-178`). **Done in R6:** slots follow word order (picking last puts your star on the right; the artboard always drew yours left). No key is preselected; the CTA reads "Pick a letter" until one is. Phone key gap 4px so keys stay ≥44px wide. Typed letters are ignored inside menus and dialogs, and Enter on another button keeps its own meaning. The away banner is white on the pink ground (pink in dark). The top bar shows the inline score in pick only; ScoreHud is gone from pick, replaced by `WordsPlayed`. No-repeat stripes wait for F4 |
| `reveal-phase.tsx` | Step 2 · Reveal | RW | flower per beat (yellow/pink/sage), GO starburst, letters view with min-length line; **fix**: the inline fade-up has no reduced-motion guard (`reveal-phase.tsx:86`). **Done in R7:** beats are Urbanist 800 in a 240/300px flower (GO 0.32× in a `--shape-magenta` star), with measured ink offsets for "1" and "2" (pixel test ≤0.5px, clearance 22–42px). The letters view uses `.slide-up-in`, which is reduced-motion guarded |
| `settling-phase.tsx` | Step 2 · Settling | R | three bobbing shapes + word reminder. **Done in R7:** the word comes from `pendingResult` or from `setSubmitInFlight(true, word)` |
| `race-phase.tsx` | Step 2 · Race | R | timer circle (m:ss ≥60s, magenta ≤5s), pill input with font steps, reject ring + existing 9 messages, opponent row (3 states). Reactions, peek and the letter count arrive in F3/F4. **Done in R7:** top-aligned on phones so timer, input, message and opponent row end above a 291px keyboard (tested); centred from 1024px. Reject copy follows the artboard (commas, no dashes). The submit circle stays enabled below the minimum so Enter or a tap explains why. The race progress bar is gone. Score moved into the top bar for reveal and race |
| `result-phase.tsx` | Step 2 · Round result | RW | title pill (8 variants, logic unchanged `:305-320`), `AnchoredWord`, definition card, side-by-side cards, empty-state hero shapes, suggestion pills, `ScoreCard` + "+1", advance bar + Next; **fix**: side-by-side stagger ignores reduced motion (`:356`). **Done in R8:** titles use colons ("Tied round 3: both score"). The near-miss loser card steps back with a 45% card fill instead of 0.55 opacity, so its text keeps ≥4.5:1. Race times ("2.40 s · winner") come from `raceStartedAt`. The forfeit hero reads "{loser} left" plus "the point is yours" or "the point goes to {winner}". Save-to-collection waits for F2 (done in F2). The guest sees "Next round in a moment…" instead of a button. Fixed in passing: `CountUp` hydration mismatch under reduced motion, and `navigator.vibrate` called without a user gesture (console intervention) |
| `match-end.tsx` + `rounds-table.tsx` | Step 2 · Match end | RW | score flowers, awards (pure function over `used[]`: fastest = min `timeMs`, longest = max length), table with stripes and no dividers, truncation rules; button states unchanged (`match-end.tsx:121-139`). **Done in R9:** awards in `lib/game/awards.ts` (ties go to the earlier round). Score flowers step half points down (0.24× vs 0.33×) and cap the name at 42% of the flower, because the canvas sizes sat 6–7px from the scallops (now 13.7–19.6px, tested). The loser's cream flower is a literal `#f5f0e3`, because phase tokens go dark in dark mode. The slower table cell uses muted ink, not 0.55 opacity (contrast). Share (F5) and the collection banner (F2) wait for their F-PRs. The guest reads "Waiting for {host}…" |
| `spectator-phase.tsx` | Step 2 · Spectator | RW | banner in normal flow (drop `top-[60px]` / `pt-[120px]`, `:31,323`); **fix**: per-player status from `pendingResult.attempts[].by` + presence instead of the hard-coded "typing" (`:214,225`); **fix**: winner-first match-end order (`:283-295`). **Done in R10:** per-seat status comes from `ctx.seats` (presence + `pendingResult`), and the watcher count from presence. Pick shows two "?" with first/last but no Locked/Picking chip: lock status is stripped from client state during pick (`lib/game/sanitize.ts`), and exposing it is a game decision (open point). Cheers wait for F3. Also in R10: dead CSS removed (globals.css 586 → 353 lines, `.scene` spacing included, which had added a hidden 22px between redesigned blocks), Geist Mono dropped, `score-hud.tsx` and `letters-display.tsx` deleted, the wordmark link made a 44px target |
| `opponent-away.tsx` | race/reveal/pick | R → `StatusPill` | copy unchanged |
| `reconnect-banner.tsx` | Step 2 · Overlays | R → `StatusPill` | **fix**: spinner has no reduced-motion guard (`:59`) |
| `share-dialog.tsx` | Step 2 · Overlays | R | `Dialog variant=sheet`; QR in a yellow card; copy → check state |
| `qr.tsx` | Step 2 · Overlays | keep | stays black on white for scanning |
| `avatar.tsx` | everywhere | R | pastel seat colours. Initials in bold Urbanist, not Gochi Hand: at avatar size Gochi's "G" reads as "6" (seen on the race screen in R3) |
| `count-up.tsx`, `phase-shell.tsx` | none | keep | phase-shell keeps the transition timing |
| `wordpinch-ui.tsx` | none | small | `data-phase` on `.wp-root`; `TopBar` instead of `TopChrome`; no logic changes |
| `globals.css` component classes | none | delete as each screen migrates | grep for each class before deleting; `.used-row` subgrid needs multi-row verification (AGENTS.md) |

---

## 5. New features: where they touch the code

| Feature | Client | Server / data | Notes |
|---|---|---|---|
| **F1 Identity** (anonymous accounts) | sign in anonymously on first visit; keep the `clientId` until migrated | Supabase anonymous auth (`signInAnonymously` present in installed auth-js); migration linking `clientId` → `auth.uid()` for room seats (`supabase/migrations/*dual_auth*`); RLS review | read the current Supabase docs before building; check anonymous sign-in rate limits **Done in F1:** the browser signs in anonymously the first time it creates or opens a room (`lib/identity.ts`; the landing page and dev previews make no account). Room routes take the caller from the verified session (`getClaims`, `lib/supabase/identity.ts`); the body id only counts without a session, and never when it is an account id. `adopt_client_seats` (migration `20261031120000`) moves an old clientId's seats onto the account via `POST /api/identity/adopt`, then the key is dropped. If sign-in fails (setting off, 30 per hour per IP) the browser keeps playing on its clientId. No RLS change: `rooms` has no client policies and the realtime policies already cover `authenticated` |
| **F2 Collection** | bookmark on the result screen, collection page, match-end banner | table `collected_words (user_id, word, defs, source, time_ms, created_at)` + RLS; route handler | needs F1 **Done in F2:** migration `20261031130000_collected_words` (one row per player and word, `opponent` and `room_code` added; players can only `select` their own rows; `collect_word()` is server-only and a win replaces a bookmark, keeping the fastest time). `resolveRound` collects the winner's word, or both words of a split. The bookmark sits next to the pronunciation on a single-winner result: filled for the winner, a tap for the other player (`POST /api/rooms/[code]/save-word` takes only the round number). The match-end banner counts words new to this match, counted from `matchStartedAt` (stamped by the server when a match leaves the lobby). `/collection`: stats, All / Won / Saved filter, cards; the day streak counts local days in a row with a collected word (F6 may switch it to the daily-pinch streak). Hidden for spectators and clientId-fallback players. Fixed in passing: "Match over · 1 rounds" |
| **F3 Reactions, cheers, letter count** | reaction pills (race), cheers (spectator), "Juno · 4 letters" | **no new server route needed:** clients may update their own **presence payload** (policy `extension = 'presence'`). Add `{ reaction?, reactionAt?, typedLen? }` to the tracked payload | presence role is self-reported, so these stay purely cosmetic; throttle `typedLen` updates (e.g. 4/s); never send the typed text **Done in F3, not via presence:** Realtime allows a client 5 presence events per 30 s (Context7, `supabase/realtime` presence_handler), so a 4/s letter count would have broken presence itself. Instead a second private topic `fx:<CODE>` (migration `20261031140000_room_fx_channel`) that any client may broadcast on; `room:` stays server-only. Receivers validate everything (fixed reaction ids, cheers only from spectators, a 0–50 count tagged with the round). The count is throttled to 4/s (leading and trailing; measured 3 frames for 12 keystrokes, 252 ms apart, `len` only). Race: three pills under the opponent line, a yellow bubble above it (fades after 2.8 s, opacity only under reduced motion, held back while a rejection message shows), "N letters" from 2 letters on. Spectators: "Cheer from the sidelines" in every phase, and the count on each row. Accepted risk: anyone in the room can forge a cosmetic reaction or count. Fixed in passing: the race input's caret started before the locked first letter, so typing "OOTH" gave "TOOTHT"; pills no longer take focus from the input |
| **F4 No repeat letters + peek** | lobby rows (New tag), pick stripes, race peek pill | `state-schema.ts` settings `noRepeat`, `peek` (+ defaults); enforce no-repeat in `lockPlayerLetter` (`rooms.ts:347`); peek as a new server action that reveals one letter of a valid word for that round and marks it used | server-authoritative; quick match presets peek on **Done in F4:** settings `noRepeat`, `peek` (default off, "New" tags in the Rules card). No-repeat: `lockPlayerLetter` records each round's two letters in `usedLetters` (per round, so a replayed round can pick its letters again) and refuses an earlier round's letter with 409 `letter_used`; `lib/game/rules.ts` lets go once all 26 are used (a 14-round match can get there). Pick: used keys hatched (magenta, pink in dark), letter on a solid patch so it stays readable, disabled, "X, already picked", skipped by arrows and typing; legend "already picked this match". Peek: `POST /api/rooms/[code]/peek` returns the second letter of the shortest valid word (middle one alphabetically, skipping played words), once per player per match; the state keeps only `peeks: { host: round }`, the letter goes to the caller alone, and asking again in that round returns the same letter. Race: "Peek a letter · 1" pill first in the action row (the row scrolls sideways on phones so it stays above the keyboard), the letter in a sage chip in the gap |
| **F5 Share image** | "Share the result" / "Share my pinch" sheet, Save image | `app/r/[code]/opengraph-image.tsx` + a download route via `ImageResponse` | read `14-metadata-and-og-images.md` first; fonts must be loaded for the image renderer **Done in F5 (match card):** `lib/og/match-card.tsx` draws the card in two shapes: 1080×1350 at `/r/[code]/card` (`?download=1` for "Save image") and 1200×630 as the room's `opengraph-image` (alt per room via `generateImageMetadata`). After the match: winner headline, score pills (winner first), fastest / longest / latest words; before: an invite with the code. Fonts: Urbanist 700/800 and Gochi Hand fetched at render time from Google Fonts, subset to the card's text (next/og can't use next/font's woff2); falls back to the built-in font. Names cap at 11 characters in pills, words at 13. Match end gets "Share" beside the primary; the sheet shows the server render with "Save image" and "Share…" (the PNG itself where the browser can share files, else the link, else copy). Not done: the daily card (F6), and a result-screen share. Note: chat apps cache the preview per URL, so a link shared before the match keeps showing the invite there |
| **F6 Daily pinch** | `/daily` route: countdown → letters + clock → result, streak, leaderboard | tables `daily_puzzles`, `daily_attempts (user_id unique per day)`; server issues the start time at reveal and computes the duration; leaderboard query | needs F1; the clock starts at the reveal (decision 1) **Done in F6:** migration `20261031150000_daily_pinch` (`daily_puzzles`, `daily_attempts`, both server-only; `collected_words.daily_number`; `collect_word` gains `p_daily_number` and now also takes the opponent / daily number of a faster win). One puzzle per UTC day, #128 on 31.10.2026, letters drawn from the date among pairs with ≥12 valid words (min 4 letters). `/daily`: intro with hidden letters, "I'm ready", 3·2·1, then `POST /api/daily/start` reveals the letters and stamps the start; a reload keeps that start. Play is compact (letters and clock in one row, no headline) so the field stays above the phone keyboard. Submit checks letters, length and the strict word list; rejections say why and the clock runs on; one accepted word per day. Done: word, time, "faster than X% of N", today's fastest three, "Share my pinch" (pink card at `/api/daily/card`, spoiler-free), countdown to the next UTC midnight; the word lands in the collection as "Daily pinch #128". Streak = consecutive days with a finished pinch. The landing tile is on and says "one try a day" instead of the letters the artboard showed (they'd give the puzzle away before the clock) |
| **F7 Quick match** | search / matched / nobody screens | matchmaking queue (table + server function pairing two waiting users) → `createRoom` with fixed rules (5 × 30s, min 4, replay ties, no slang, peek on) | needs F1 for fairness; 60s timeout |
| **F8 Pass the phone** | `/pass` route: setup, handoff cover, turns | **no room, no realtime:** a local state machine reusing `/api/words/validate` | new rule: turns, fastest valid time wins; times hidden until both played |

---

## 6. Order of work (each line is one PR)

**Before R1:** take baseline screenshots of every phase via the dev phase strip (`/r/K7QM?phase=…`, `?reconnect=1`; the code must be 4 valid characters, the `slate-9f` in AGENTS.md now 404s) at 390px and 1280px, light and dark. Commit them under `docs/redesign/baseline/`, or keep them local if they're too large.

| PR | Contents | Depends on |
|---|---|---|
| R1 | tokens, fonts, `themeColor`, `data-phase` background, toasts | none |
| R2 | kit: button/input/switch/toggle-group/dialog variants, `Shape`, `ShapeGlyph` (with measured table), `LetterSlots`, `AnchoredWord`, `Avatar`, `StatusPill`, `/dev/kit` page | R1 |
| R3 | `TopBar` + `SettingsMenu`, banners (reconnect, role error, opponent away), share sheet | R2 |
| R4 | landing (mode grid, extra modes flagged off) + 404 | R2 |
| R5 | lobby | R2 |
| R6 | pick (alphabet grid + keyboard) | R2 |
| R7 | reveal + settling + race | R2 |
| R8 | round result | R2 |
| R9 | match end + rounds table + awards | R2 |
| R10 | spectator (+ the two bug fixes, + "playersin this room": `spectator-phase.tsx:39` loses its space, see AGENTS.md) and removal of dead CSS classes | R3–R9 |
| F1 → F2 | identity, then collection | R10 |
| F3 | reactions, cheers, letter count | R7 |
| F4 | no repeat letters + peek | R5, R6, R7 |
| F5 | share image | R9 |
| F6 | daily pinch | F1, F5 |
| F7 | quick match | F1 |
| F8 | pass the phone | R6, R7 |

R5–R9 only depend on R2 and touch separate files, so they can run in parallel.

---

## 7. Checklist for every PR

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` pass (AGENTS.md).
- [ ] `npm run test:e2e` passes on all six Playwright profiles: iPhone, iPhone dark, Android, iPad, desktop, desktop dark (`playwright.config.ts`). The suite covers console errors and horizontal overflow on every screen, and kit geometry (glyph centring, label clearance, touch targets, contrast, sheet placement). Screenshots land in `test-results/screens/`.
- [ ] Screenshots (`attachScreenshot` also saves each scrolled segment of `.wp-body` as `-2`, `-3`…) at 390 and 1280px, light and dark, compared against the canvas artboard and the baseline.
- [ ] **Overflow check:** run the overflow script from step 2 (`scratchpad/render`, to be moved into `scripts/` with R2) on the changed screens with the stress data (32-char names, 19-letter word, 3.5, 300s).
- [ ] **Shapes:** text inside shapes ≥12px from the real outline (shape clearance script); glyphs use `ShapeGlyph`.
- [ ] `prefers-reduced-motion` honoured for every new animation.
- [ ] **Contrast:** body text ≥4.5:1, large text ≥3:1 (anchor colours on pastels are large-text only).
- [ ] **Touch and keyboard:** targets ≥44px; keyboard reachable; `aria-*` as in the artboards.
- [ ] **Dev server serves what you wrote:** Turbopack once kept serving a stale `globals.css` (R8). After a CSS change, check one computed style in the browser; restart the dev server if it is old.
- [ ] **Conventions:** no `&&` rendering of numbers, phase reset via `key`, no `setState` in effects (AGENTS.md conventions).

---

## 8. Open points for the implementation start

00. **Hosted migrations pending:** `20261031130000_collected_words.sql` (F2), `20261031140000_room_fx_channel.sql` (F3) and `20261031150000_daily_pinch.sql` (F6) are not on wordpinch-dev yet (the daily pinch can't work without the last one) (without the F3 one the fx channel can't be joined and reactions silently don't arrive); run `npx supabase db push --linked`, then turn on anonymous sign-ins (0a). Without the push, won words are skipped with a logged error and the collection stays empty; the game itself is unaffected.
0a. **Anonymous sign-ins on the hosted project (from F1):** off until switched on under Authentication → Sign In / Providers → "Allow anonymous sign-ins". Until then every browser plays on its clientId, as before. Consider a CAPTCHA (Supabase recommends one for anonymous sign-ins) and a periodic delete of old anonymous users without seats.
0b. **Migrations don't replay on a fresh database (found in F1):** `20260517075653_harden_functions.sql` revokes grants on `public.rls_auto_enable()`, which only exists on the hosted project, so `supabase start` / `db reset` stops there. Fix with a guarded revoke (`if exists`) when convenient.
0. **Spectator pick status (from R10):** showing "Locked" / "Picking" per player needs `sanitize.ts` to expose lock booleans (not letters). That also tells players whether the opponent has locked. Decide before F3.

1. ~~**Feature flags**~~ done in R4 as a const map; no env switch.
2. **Baseline screenshots:** commit them, or keep them local only?
3. **`.claude/launch.json`:** keep only the `wordpinch-dev` entry (the design-scratch entry points at a session temp folder) and commit it, or leave it untracked.
