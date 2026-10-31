# Redesign step 1: screen inventory and feature triage

Direction: **D · Pastel Pop** (canvas: https://claude.ai/artifact/UxU5iL3Whgc5K2tDWkxdqR).
Status: draft, 31.10.2026. Built from a full read of `src/components/game/*`, `src/app/**` and `src/lib/game/*`. Line references are against commit `c9d0163`.

The goal of the redesign is a **visual reskin with no game-logic changes**. Everything below is sorted against that rule.

---

## 1. Screens and states

Coverage column: what the D canvas already shows. **Yes** = designed, **Partly** = designed but not all states, **No** = nothing yet.

| # | Screen | States the code renders | D coverage |
|---|---|---|---|
| 1 | Landing `landing.tsx` | default · creating ("Creating…") · create error (429 rate limit with retry time, server error, network error) · join error (bad code) · code notice (typed I/O/0/1) · Join disabled until 4 chars | Partly: happy path only, and the shapes show modes that don't exist (see §3) |
| 2 | Room not found `r/[code]/not-found.tsx` | 404, "Room not found", back link | No |
| 3 | Lobby `lobby.tsx` | host vs guest view · guest not joined yet ("Waiting for player…") · needs name hint · inline name editor · copy toast success/fail · 7 settings, host-editable, read-only for guest · Start: "Start game" / "Waiting for host…" / "Waiting for player…" · caption "2 of 2 ready" etc. | Partly: shows 3 of 7 settings, no guest view, no name editor |
| 4 | Pick `pick-phase.tsx` | picking first **or** last letter · typing a letter · locking · locked + waiting · "Change letter" · opponent idle 45 s → "Skip this round" · opponent away banner · score HUD with words-played list | Partly: only "picking first" |
| 5 | Reveal `reveal-phase.tsx` | countdown 3 · 2 · 1 · GO (with tick sound) · letters template + "Type a word that begins with A and ends with B" · opponent away banner | No |
| 6 | Race `race-phase.tsx` | typing (start letter prefilled, can't be deleted) · timer, red at ≤5 s · submitting · 9 reject messages (too short, wrong start/end, already played, not a word, not in list, rate limited, check failed, connection) with shake · opponent: "in the round" / "submitted" / "offline" · paused while opponent away | Partly: typing state only, and the opponent line shows a letter count that doesn't exist |
| 7 | Settling `settling-phase.tsx` | "Tallying the round" + bouncing dots | No |
| 8 | Round result `result-phase.tsx` | 8 title variants (win, near-miss "by N ms", split, split+timeout, nobody, nobody+timeout, forfeit, replay pending) · single winner: big word, IPA, play button (disabled when muted), definitions or "No definition available." · side-by-side (tie or near-miss) · suggestions: loading / empty / list · score count-up with "+1" float · "Next →" (referee only) · "Paused while you read" · auto-advance bar | **No**. This is the largest and most varied screen. |
| 9 | Match end `match-end.tsx` | you win / they win / tie · scoreboard · rounds table (one row per round, up to 15) · Rematch / "Waiting for host…" / "Waiting for {name} to come back…" · Leave · confetti for the winner | Partly: winner view only, and it uses a word list rather than the two-column rounds table |
| 10 | Spectator `spectator-phase.tsx` | "Watching — both seats are taken" banner · own sub-view for lobby, pick, reveal, race, result and match end | No |
| 11 | Opponent away `opponent-away.tsx` | "{name} disconnected · forfeits in 20s" countdown → "still away · ending the round…" | No |
| 12 | Reconnect / role banners `reconnect-banner.tsx` | "Reconnecting…" → after 12 s "Still reconnecting — try refreshing" + Refresh · "Couldn't confirm your seat in this room." + Retry | No |
| 13 | Share dialog `share-dialog.tsx` | URL + copy (icon flips to check) · "Share via…" (only where Web Share exists) · QR · toasts "Link copied" / copy failed | No |
| 14 | Top chrome `top-chrome.tsx` | round progress bar · wordmark · "3/7" counter · theme toggle · mute · share (not on landing/lobby) · leave | No: D has no persistent top bar |
| 15 | Toasts (sonner, bottom centre) | success/error toasts from lobby and share, plus the generic action errors in `lib/game/actions.ts` (rate limit, room gone, not allowed, failed, connection) | No |

### Lobby settings (all 7, host-only)

| Setting | Control | Range / options | Default |
|---|---|---|---|
| Rounds | stepper | 1–15 | 5 |
| Round timer | stepper | 5–300 s, step 5 | 60 s |
| Min word length | stepper | 2–10 | 3 |
| Tie behaviour | 3-way toggle | replay / split / nobody | replay |
| Allow slang & proper nouns | switch | | off |
| Audio definitions | switch | | on |
| +0.5 per extra letter | switch | | off |

The D lobby mockup shows "7 rounds", "30 seconds" and "No repeat letters". The last one isn't a real setting (§3). The real list needs a D treatment that works as a read-only view for the guest too.

---

## 2. Cross-cutting constraints the design must cover

**Dark mode.** The app is system-aware (`layout.tsx`, `defaultTheme="system"`) and has a theme toggle in the top chrome. D is light only today. → Decision 2.

**Breakpoints.** Every big typographic element shrinks at ≤500px (`globals.css:325–421`), and banners shift at 640px. D is only designed at 390px. Desktop needs a design too. → Decision 4.

**Scores can be half points.** With "+0.5 per extra letter" on, a score can be 3.5 (`count-up.tsx` snaps to half steps). The score shapes need room for a decimal.

**Long content** that currently isn't truncated anywhere:
- **Display names (up to 32 chars):** lobby, score HUD, result title, match-end headline, rounds-table header, opponent-away banner, spectator. They are only truncated in the race opponent line.
- **Long winning words:** at 64px with per-letter spans, the result word has no wrap rule, so it can overflow (`globals.css:413`).
- **Rounds table:** shows up to 15 rows with no max height (`rounds-table.tsx:83`).
- **Timer:** "300s" fits, but check it inside a shape.

**Reduced motion gaps** (existing; the redesign should close them, not carry them over):
- lobby room-code stagger (`lobby.tsx:309`)
- result side-by-side columns (`result-phase.tsx:356`; the comment at :338 claims otherwise)
- reveal fade-up (`reveal-phase.tsx:86`)
- typing dots
- advance bar and progress transitions
- reconnect spinner

**Sound and haptics** are tied to UI moments: countdown tick, win ding + vibrate, match chime, auto-pronounce. The redesign moves these moments around, so the sounds must stay attached to them.

**Pre-existing bugs found in passing.** Fix these in the redesign PRs that touch the same files:
- The spectator race view always says both players are "typing", whatever their real state (`spectator-phase.tsx:214,225`).
- A split-on-timeout result renders an empty word for spectators. Unclear, needs a test (`spectator-phase.tsx:240`).
- `?phase=spectator` for a non-spectator renders nothing (`wordpinch-ui.tsx:461`). Dev-only, low priority.

---

## 3. Feature triage

Every feature that appears in the A–D mockups, sorted into three buckets.

### In the redesign (frontend only, uses data that already exists)

| Feature | Why it fits |
|---|---|
| D look on every screen | the point of the redesign |
| Name entry moves from landing to lobby | the lobby already has the inline name editor and the "add your name" hint |
| Round times and "fastest word" callout at match end | `UsedWord.timeMs` is already stored |
| How-to-play sheet | static content |
| Pick: alphabet grid instead of the single-letter input | still sends one letter, no server change. → Decision 3 |
| Score shapes, pastel per-phase backgrounds | visual |

### Later features (need server, game-logic or storage work, each gets its own plan)

| Feature | What it needs |
|---|---|
| Daily pinch + streak | shared daily letters, a solo mode, streak storage |
| Quick match ("142 playing now") | a matchmaking queue and a live player count |
| Reactions / "pass a note" | new realtime broadcast messages, rate limiting |
| Opponent letter count while typing | broadcast keystroke counts. Today the only signals are "in the round" / "submitted" / "offline" |
| Peek 1 letter hint | new game rule, server-side reveal, scoring rules |
| No repeat letters | new setting, server validation, pick UI state |
| Word collection + profile | persistent identity and storage |
| Pass-the-phone | a new local two-player mode |
| Share scorecard image | image generation (e.g. an OG image route) |

### Take out of the D screens for now

These are mocked up but have nothing behind them. The redesign shows the real thing in their place:
- **Landing shapes "Daily pinch" and "Quick match":** replace with the real actions (Start a room, Join with code, How to play).
- **Profile button:** replace with theme / mute, or drop it.
- **Lobby "No repeat letters":** show the real settings.
- **Race "Juno is typing · 4 letters":** show the real three opponent states.
- **Race "Peek 1 letter" and reaction pills:** remove.
- **Match end "2 new words saved to your collection":** remove.
- **Pick "striped = already used":** remove until No repeat letters exists.

---

## 4. Decisions (made 31.10.2026)

1. **Triage: the "later" features are in the redesign too.** The redesign is no longer reskin-only. Every feature in the §3 "later" table is in scope, and each still needs its own server, game-logic or storage design before it is built. Suggested order: visual foundation and existing screens first (game logic unchanged), then the features one by one on top. That way a broken feature never blocks the new look.
2. **Dark mode: yes, design a dark D.** The theme toggle stays (it moves into the settings menu, see 5).
3. **Input: alphabet grid for picking the letter, keyboard for the race.** The race keeps the current text input.
4. **Desktop: wider layouts, but restrained.** Use a wider max width with a 2-column grid where it helps (lobby settings, result, match end). It should still read as clean and calm, not as a full-width dashboard.
5. **Top chrome: one settings icon that opens a dropdown.** Proposal on the canvas (D row, "Menu · light" and "Menu · dark"). The slim top row holds the round progress on the left and a white circle gear on the right. The dropdown holds:
   - the room code with Share
   - Sound on/off
   - Theme (Light / Dark / Auto)
   - How to play
   - Leave room

Consequences for §3: the "Take out of the D screens" list no longer applies. Those mocked parts stay in the designs and become real features.

---

## 5. What D still needs designed (input for step 2)

In order of risk:

1. **Round result.** All 8 title variants: single winner with definitions, side-by-side tie / near-miss, forfeit, replay pending, plus the suggestions loading / empty / list states.
2. **Lobby, complete.** Guest view, not-joined-yet, name editor, all 7 settings (steppers, 3-way toggle, switches), the read-only state.
3. **Race, complete.** Reject states with messages, submitting, the timer at ≤5 s, the three opponent states, paused.
4. **Reveal countdown** and **Settling.**
5. **Pick, complete.** Last-letter variant, locked and waiting, change letter, skip-this-round.
6. **Match end.** Loss and tie views, the rounds table with 15 rounds and outcome rows (forfeit, timeout, no word), waiting-for-host and opponent-gone buttons.
7. **Overlays.** Opponent-away countdown, reconnect banner (both stages), role error, share dialog with QR, toasts.
8. **Spectator.** Banner plus how each phase reads for a viewer.
9. **Landing errors** and the **404 page.**
10. **Top chrome / navigation** (Decision 5), **dark mode** (Decision 2) and **desktop width** (Decision 4).
11. **Stress versions:** a 32-char name, a 12+ letter word, 15 rounds, a 3.5 score.
