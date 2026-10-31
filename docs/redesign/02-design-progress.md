# Redesign step 2: designing the remaining D screens

Canvas: https://claude.ai/artifact/UxU5iL3Whgc5K2tDWkxdqR (rows titled "Step 2 · …").
Each step-2 screen is one artboard with **Tweaks**: a variant switch, plus `dark` and `desktop`. The canvas shows three copies of each: phone light, phone dark and desktop.

## Progress

The numbers refer to [01-inventory.md §5](01-inventory.md).

| # | Screen | Status |
|---|---|---|
| 1 | Round result: all 8 variants | Designed: phone, dark, desktop |
| 2 | Lobby, complete: host ready, host waiting, guest; all 7 settings plus the 2 new rules | Designed: phone, dark, desktop. Steppers, toggles and switches work in Play |
| 3 | Race, complete: reject messages, submitting, ≤5 s, opponent states, paused, reactions, peek | Designed: phone, dark, opponent away, desktop |
| 4 | Reveal countdown, Settling | Designed: countdown, dark letters, settling, desktop GO |
| 5 | Pick, complete: last-letter variant, locked, change, skip, no-repeat stripes | Designed: first, dark last, locked + idle, desktop. Grid works in Play |
| 6 | Match end: loss, tie, 15-round table, outcome rows, waiting buttons, awards, collection | Designed: win, dark loss, 15 rounds, desktop tie 3.5 |
| 7 | Overlays: opponent away, reconnect, role error, share dialog, toasts | Designed: share sheet, still reconnecting, dark toasts, desktop dialog. Opponent away is already in race/reveal/pick |
| 8 | Spectator | Designed: race, pick, dark result, desktop match end; all 6 phases in Tweaks |
| 9 | Landing (real actions + daily pinch, quick match, pass-the-phone), errors, 404 | Designed: phone, dark rate-limited, 404, desktop; 9 states in Tweaks |
| 10 | Settings menu | Designed (D row: "Menu · light / dark") |
| 10 | Dark mode, desktop width | Part of every screen above |
| 11 | Stress versions (32-char name, 12+ letter word, 15 rounds, 3.5 score) | Designed: stress sheet light + dark. Overflow checked in the browser (rules below); 15 rounds and 3.5 are in the match-end row |
| – | New-feature screens: daily pinch, quick match queue, collection/profile, pass-the-phone, share image | Designed: light + dark per feature, collection on desktop. Overflow-checked in all 14 states. Game-logic questions below |

## Tokens used so far (input for step 4, the design system)

**Fonts**
- **Urbanist** 500–800 for UI and body.
- **Gochi Hand** only for headline accent lines, game letters and the occasional handwritten aside.

**Light**
- **Phase backgrounds:**
  - landing and race: cream `#F5F0E3`
  - lobby: yellow `#F5D565`
  - pick: pink `#F4B6D5`
  - round result: light sage `#DCE4C3`
  - match end: blue `#B8CDEE`
- **Surfaces:** white `#FFFFFF`, inner rows cream `#F5F0E3`.
- **Text:** ink `#141414`. Secondary text is tuned per background (`#555555` on cream, `#5A4E1E` on yellow, `#4A4F3A` on sage).
- **Primary:** black pill `#141414` with white text.
- **Disabled primary:** a muted tint of the background with ≥4.5:1 text, e.g. `#EFE6C2` / `#6B6040` on the lobby.
- **Danger:** `#B3261E`.

**Dark**
- **Background:** one warm near-black `#1B1915` for every phase. Phase identity comes from the pastel shapes, which stay unchanged with black text.
- **Surfaces:** `#2A2621`, inner rows `#35302A`.
- **Text:** `#F5F0E3`, secondary `#B8B2A6`.
- **Primary:** inverted, cream pill `#F5F0E3` with ink text.
- **Danger:** `#FF8A80`.

**Shapes:**
- the scalloped flower (circle plus 12 petals)
- the 10-point rounded starburst
- rounded squares at 26–30px radius

**Optical sizing rule (Leon, 31.10.):** letter containers must look the same size, not measure the same size.
- A rounded square fills its whole box. The starburst and flower only fill about three quarters of theirs.
- So a square that sits next to a star or flower is drawn at **about 74%** of the shared box, centred in it: 62px in an 84px box, 98px in a 132px box. Its corner radius scales with it (16px / 24px).
- The box itself stays the same, so rows don't shift.
- **Circles:** a circle reads bigger than a square of the same width, so a dashed or filled circle next to them is drawn at **about 81%** of the box: 68px in 84px, 96px in 120px.
- **Glyph centring (measured 31.10. with `measureText` on Gochi Hand):** with `line-height: 1`, the ink of each glyph sits above the line-box centre. Measured as a share of the font size:
  - "?": 13% high, 2% left
  - H: 9% high
  - T: 7% high
  - O: 2% high

  Flex centring therefore looks off. Use these corrections:
  - **letters:** `padding-top: 0.16em`, which moves the ink down by 0.08em
  - **"?":** `transform: translate(0.02em, 0.13em)`

  In code this becomes one `<ShapeGlyph>` helper with a per-glyph offset table, so the correction isn't scattered across the screens.
- **Status:** applied to pick, race and reveal/settling (letters T and H plus the "?").
- **Below the threshold:** O (2%) and the avatar initials J (2.6%) and L (3.3%) need no correction. At avatar size (22px) the offset is about half a pixel.
- **Implementation (R2, 31.10.):** `ShapeGlyph` applies the **exact** measured offset for every letter A–Z and "?" (`src/components/game/kit/glyph-offsets.ts`), not just the ones over 5%. Playwright measures the result on 6 device profiles: worst ink-centre error 0.14px (Chromium) and 0.17px (WebKit) over 54 glyphs.
  - **WebKit `measureText` is not reliable for horizontal ink bounds.** A pixel scan shows identical glyph rendering in both engines, but WebKit's `actualBoundingBoxLeft/Right` disagree with its own pixels (L: metrics 1.7% vs pixels 4.2%). Glyph checks therefore scan rendered pixels at 4× size (`tests/e2e/kit.spec.ts`, probe in `tests/e2e/glyph-metrics.probe.ts`).
- **N and Q (measured 31.10. for the daily pinch):** N sits 8% high, so it gets the same correction as T and H. Q is 2% low, below the threshold, so it gets none. Rule of thumb: correct glyphs that are off by 5% or more. The `<ShapeGlyph>` table holds the measured values per letter, and all 26 get measured once at implementation.

**Text inside shapes (Leon, 31.10.):** text must keep a clean margin from the shape's edge, **at least 12px everywhere, aiming for about 20px**.
- **Measure the usable inner area, not the box:**
  - star: the inner vertices sit at 62% of the radius, plus the stroke
  - flower: the gaps between petals sit at about 78%
  - the square is rotated
- **Measured on the landing grid (31.10.):** each line's corners against the real outline. Before: −4px (square), 0px (star), 4.9px (circle). Desktop was also uneven, 9.6–31.9px.
- **Fix:** labels are two-line titles (18px phone / 22px desktop) with a short 12/13px subtitle.
  - **Result:** 20.7–28.6px on phone, 28–39px on desktop. The "Creating room…" state is 17.9px.
  - **Wording:** subtitles had to get shorter. "streak 5" moved off the Daily pinch shape, and "Q _ _ _ N" stays.
- **In code:** each shape component exposes a `safeInset` (square ≈ 13%, circle ≈ 15%, star ≈ 30%, flower ≈ 22% of the box). Label content gets that as padding, so long or translated labels wrap instead of touching the edge.

All shapes take a pastel fill: blue `#B8CDEE`, pink `#F4B6D5`, yellow `#F5D565`, sage `#A9B97C`, plus magenta `#B83A7E` for strong accents.

**Shape and size**
- **Radii:** pills 999px, cards 26–28px.
- **Controls:** circle buttons are 44px, stepper buttons 44px.

**Desktop:**
- Content is capped at 1040px with 40px side padding.
- Screens use a 2-column grid (about 1.1 : 1).
- The full-bleed phase colour fills the rest of the window.

## Design notes from step 2

- **Round result:**
  - **Anchor letters (changed 31.10., Leon's feedback on spacing):** the winning word marks its first and last letter by **colour only**: first = blue, last = pink/magenta. There are no chips behind the letters.
    - **Why no chips:** measured in the browser, a fixed chip (1.05em = 63px at 60px) is three times wider than a "t" (18px of ink). That tore the word apart, and chips taller than the line broke it into blocks. Chips that hug the glyph were uneven, small chips clipped the "h", and a highlighter stroke sat below the baseline.
    - **Colours:**
      - dark: pastels `#B8CDEE` / `#F4B6D5` (10:1)
      - light: the same hues deepened, `#3A62B0` / `#B83A7E`
    - **Light contrast:** 4.0–5.9 on cream, sage and white; 3.2–3.7 on the pastel backgrounds. That is ≥3:1, which is enough for large bold text only. Never use these colours for body text on pastel backgrounds.
  - Long words wrap (`overflow-wrap: anywhere`) instead of overflowing, which fixes the bug listed in the inventory.
  - New: a "save to collection" button next to pronunciation.
- **Lobby:**
  - Settings are grouped into three cards (Game, Rules, Sound), with no divider lines between rows; spacing alone separates them (Leon, 31.10.).
  - The guest sees the same cards dimmed and read-only, with "only Leon can change these".
  - The two new rules (No repeat letters, Peek hint) carry a "New" tag.
  - The phone lobby is taller than one screen (1240px), so it scrolls. The Start button sits at the end of the page on phone and in the left column on desktop.
- **Race:**
  - **Keyboard:** on phone, the system keyboard (about 291px) is drawn as a neutral block. Everything that matters fits above it: letters, timer, input, message line, opponent line, reactions. Nothing important may sit in the bottom 300px.
  - **Top bar:** it carries the score inline ("Round 3 of 7 · Leon 2 · 1 Juno") to save height. The current round's progress pill is blue.
  - **Timer:** a yellow circle. At ≤5 s it turns magenta `#B83A7E` with white text and "hurry!". When paused it's a neutral surface reading "paused".
  - **Reject:**
    - the input gets a 2px magenta ring
    - the message replaces the hint line under the input (`role="status"`), using the existing 9 messages
    - the shake animation stays (reduced-motion: ring only)
  - **Opponent line:** "is in the round", "submitted a word · checking…" or "is offline" (dimmed avatar). Incoming reactions appear as a yellow handwritten bubble above it.
  - **Peek:** the revealed letter sits in a sage chip in the gap. The peek pill turns into a disabled "Peek used".
  - **Desktop:** a single centred column capped at 720px, with bigger letters and no grid. The race is about focus, so it stays narrow.
  - **Dark rejection:** in dark mode, rejections use pink `#F4B6D5` instead of magenta.
- **Reveal:**
  - **Background:** blue `#B8CDEE` in light mode.
  - **Countdown:** each number sits in a big flower whose colour changes per beat: 3 yellow "ready…", 2 pink "set…", 1 sage "almost…". GO is a magenta starburst with white text and "pencils up!".
  - **Timing:** the numbers keep the current 700 ms rhythm and tick sound. For screen readers: `role="timer"` with `aria-live`.
  - **Letters view:** the T square and H star at the optical-size rule, a headline ("Starts with T," plus handwritten "ends with H") and the minimum length, so you know the rule before the race starts.
  - **Opponent away:** the race's pink pause banner also appears here.
  - **Reduced motion:** the numbers swap without scale or pop.
- **Settling:**
  - **Background:** cream, the race colour, so it reads as part of the race.
  - **Loader:** the three shapes (blue circle, yellow square, pink star) bob at staggered heights instead of the current grey dots.
  - **Text:** "Tallying the round…", plus a reminder of the word you played.
- **Pick:**
  - **Background:** pink `#F4B6D5`.
  - **Alphabet grid:** 7 columns, 44px round keys on phone and 60px on desktop. It's a `radiogroup`, so arrow keys and screen readers work.
  - **Key states:** selected = black (cream in dark). Used under No repeat letters = magenta hatch stripes (pink in dark), disabled, with the label "already picked".
  - **Slots:** your slot shows the chosen letter live. The opponent's slot is a dashed circle with only a big "?" and no caption (Leon, 31.10.). For screen readers it says "Juno's letter, hidden until the reveal".
  - **Locked:**
    - the headline changes to "Nice pick, now we wait"
    - the grid dims to 45%
    - a lock badge appears on your shape
    - the CTA becomes a "Locked in. Waiting for Juno…" pill, with "Change letter" as an underlined text button below it
  - **Opponent idle 45 s:** a white card reads "Juno still hasn't picked." with a "Skip this round" pill.
  - **Words played:**
    - on phone: a small pill below the CTA that expands into the list
    - on desktop: an expandable card under the CTA in the left column
  - **Desktop:** a 2-column layout. The left column holds the headline, slots, CTA and words played. The right column holds the bigger grid.

- **Match end:**
  - **Background:** blue `#B8CDEE`.
  - **Headline:**
    - win: "You pinched it!"
    - loss: "Juno pinched it, rematch?"
    - tie: "Dead heat! nobody blinks"
  - **Scores:**
    - two flowers of the same size
    - the winner's flower is yellow; the loser's is pink when you win and cream when you lose
    - in a tie both are yellow
    - half points ("3.5") fit
  - **Confetti:** stays winner-only and is skipped under reduced motion. The design adds a handwritten "confetti time!".
  - **Awards (new):** "Fastest" (word + time) and "Longest" (word + letters), worked out from the stored `timeMs` and word lengths. No backend needed.
  - **Collection banner:** a sage pill reading "3 new words in your collection →" (part of the collection feature).
  - **Rounds table:**
    - **Columns:** #, Leon, Juno, with avatars in the header. Names are truncated with "…".
    - **Rows:** alternate with a very light stripe; there are no divider lines.
    - **Word cells:** word plus time. The slower or empty side is dimmed to 55%.
    - **Outcome rows:** rounds without a word span both columns in handwriting ("out of time, nobody scored", "no word played", "Juno won, Leon left the round").
    - **Length:** 15 rounds just make the page longer; the table has no inner scroll box. On phone, 15 rounds fit in about 1500px of page.
  - **Buttons:** Share (white) plus a primary that changes state: "Rematch", "Waiting for Leon…" (guest) or "Waiting for Juno to come back…" (opponent away). "Leave room" is a text link below.
  - **Desktop:** 2 columns. Headline, scores, awards, collection and buttons on the left; the table on the right.

- **Overlays:**
  - **Share:**
    - **Shape:** a bottom sheet on phone (rounded top, grab handle) and a centred 440px dialog on desktop, over a 28% dark scrim.
    - **Heading:** "Invite a friend", with a handwritten "they join with K7QM".
    - **Link:** a read-only pill with a copy circle. After copying, the circle turns sage with a check.
    - **"Share via…":** a black pill, shown only where Web Share exists, as today.
    - **QR:** a yellow card reading "Scan to join". The QR on the canvas is a placeholder pattern; the real one stays the existing `qr.tsx` (black on white).
  - **Banners:** they sit under the top bar, in normal flow so they push content down (as today), styled as status pills:
    - "Reconnecting…": white pill with a blue spinner icon.
    - "Still reconnecting. Try refreshing.": white pill, yellow refresh icon, black "Refresh" pill.
    - "Couldn't confirm your seat in this room.": pink pill with a black "Retry".
    - The opponent-away banner is the pink pause pill already designed in race, reveal and pick.
  - **Toasts:**
    - ink pills at the bottom centre (cream in dark), each with a small coloured dot: sage check = success, pink "!" = error
    - errors get a close button
    - copy without dashes ("Connection problem, couldn't lock your letter.")
    - Sonner stays the engine; only the styling changes.

- **Spectator:**
  - **Background:** each phase keeps its own colour, the same as for players.
  - **Banner:** a white pill with a blue eye icon, "You're watching. Both seats are taken.", plus "3 here" on the right. It replaces today's absolutely positioned banner, so the old `pt-[120px]` workaround goes away.
  - **Per phase:**
    - **Lobby:** code and players with "the match hasn't started yet".
    - **Pick:** two dashed "?" circles (both letters stay secret) with "Locked" / "Picking" per player.
    - **Reveal:** the letters.
    - **Race:** the letters, the timer and one status row per player.
    - **Result:** the word with coloured first and last letters, and both scores.
    - **Match end:** the headline and the scores.
  - **Bug fix (race):** each player shows their real state ("is in the round", "submitted a word", "is offline") instead of both "typing" always. Words stay hidden until the round ends ("words stay secret until the round ends").
  - **Bug fix (match end):** the winner comes first ("Leon 4 · Juno 3") instead of host-first.
  - **New:** spectators can cheer ("go Leon!", "go Juno!", "ooh"). Same realtime channel as the player reactions.
  - **Desktop:** a single centred column at most 720px, like race and reveal.

- **Landing:**
  - **Background:** cream `#F5F0E3`.
  - **Top bar:** wordmark, plus two circle buttons: word collection (bookmark) and the settings menu.
  - **Headline:** "Two letters, one scribbled word, go!" (bold / handwritten / bold).
  - **Modes:** four tappable shapes in a 2×2 grid. Each is a real `<button>` and follows the optical sizing rule:
    - Play a friend: yellow square, 74% of the cell
    - Daily pinch: pink star, full cell, shows "Q _ _ _ N"
    - Quick match: blue circle, 81% of the cell, shows "142 online"
    - Pass the phone: sage flower, full cell
  - **Name entry** lives in the lobby now, as decided in step 1.
  - **Join:** "Got a code from a friend?", a code pill input (4 characters, wide letter spacing), and a black "Join" that stays disabled until 4 characters are typed. The hint line "4 characters · no I, O, 0 or 1" doubles as the message line.
  - **States:**
    - creating: Play a friend shows "Creating…" and the other shapes dim
    - create errors (rate limited with retry time, server, network): a pink alert pill under the grid, so it no longer appears next to the join field
    - code notice (typed I/O/0/1): ink text, `role=status`
    - invalid code: magenta ring plus message, `role=alert`
  - **404:** a pink starburst "404", "This room went missing", "K7QM doesn't exist or has expired." and a black "Back to start" pill. It uses the same top bar, so the menu works there too.
  - **Desktop:** 2 columns. Headline and join row on the left, the mode grid (200px cells) on the right.

**Long content rules (stress sheet, checked 31.10.):**

The sheet was rendered at 390px with the real fonts, using two 32-character names ("Maximiliana Wolkenstein-Haberlin", "Bartholomew-Alexandria Fitzgeral"), the 19-letter word "straightforwardness", scores 3.5 / 12.5 and a 300 s timer. After the two fixes below, no element is wider than its container and nothing sticks out past the content edge.
- **Names in compact places** truncate on one line with "…": top bar, lobby rows, opponent line, score cards, table header. The full name stays in `title`.
  - **Scores never sit inside the truncated span.** Before the fix, the top bar cut off "2" together with the name.
- **Names in headlines and sentences** wrap with `overflow-wrap: anywhere`: match-end headline, "… still hasn't picked.", outcome rows. Sentences use only the first name ("Bartholomew-Alexandria won, Maximiliana left the round").
- **Winning word:** the size steps by length, 60px up to 8 letters, 48px for 9–12, 38px for 13+. `overflow-wrap: anywhere` stays as a last resort. 19 letters fit on one line at 38px.
- **Race input:** 24px up to 13 letters, 19px beyond. At 24px a 19-letter word ran 11px past the field.
- **Round-table cells:** the word truncates ("STRAIGHTFO…"), and the time never does.
- **Suggestions:** pills wrap onto new lines.
- **Timer:** values of 60 s or more show as m:ss ("5:00") at 20px, so they fit the 64px circle.
- **Scores:** "3.5" and "12.5" fit the score cards at 40px.

- **New features (designed 31.10.):**
  - **Daily pinch (pink):**
    - **Header:** "Daily pinch #128", a streak pill with a flame, and the Q / N shapes.
    - **Play:** "Same letters for everyone today", a count-up timer and the keyboard area.
    - **Done:**
      - the word with coloured first and last letters, plus the time
      - "faster than 72% of the 1,204 people who played today"
      - today's fastest 3, with truncated names
      - "Share my pinch"
      - "next pinch in 14:22:05"
  - **Quick match (blue):**
    - **Searching:** your avatar in dashed rings, "142 online · usually under 10 s · waiting 0:07", Cancel.
      - **Orbit dots (Leon, 31.10.):** both dots sit centred on their ring's stroke line, measured at 0 px off. Their position is computed from the ring radius minus half the stroke, not placed by eye. If they animate, they orbit along that same radius.
    - **Matched:** "You vs Juno", "starting in 3…", plus the fixed quick-match rules.
    - **Nobody around:** after 60 s, "Invite a friend" (primary) or "Keep waiting".
  - **Word collection (cream):**
    - **Top:** the player chip, "Your words · 23 pinched so far", and three stat tiles (words, fastest, day streak).
    - **List:** All / Won / Saved filter, then word cards with coloured anchor letters, a won/saved tag, a one-line definition and the context ("vs Juno · 2.4 s · 31.10."). On desktop the cards sit in a 3-column grid.
    - **Empty state:** a sage flower with a bookmark and "Play a game".
  - **Pass the phone (light sage `#C8D5A2`):**
    - **Setup:** two name fields, "How it works", Start.
    - **Handoff:** a cover screen, "Hand the phone to Juno · no peeking, Leon!", with a big yellow flower button "I'm Juno · tap when ready" (35px text clearance, measured).
    - **Turn:** "Juno's turn · Leon played · time hidden", the letters, the timer and the input.
  - **Share image:** a share sheet with a 4:5 card preview, "Save image" and "Share…". The image has `alt` text.
    - **Match card (blue):** the winner, both scores, three highlight words, the room link and "your turn?".
    - **Daily card (pink):** the letters, the time, "faster than 72% today · word hidden" (spoiler-free) and the streak squares.

**Game-logic decisions (Leon, 31.10.):**
1. **Daily pinch clock starts at the reveal.**
   - **Flow:** a 3 · 2 · 1 countdown, then the letters and the clock appear together, like the reveal phase in the normal game.
   - **Why:** reading the letters before typing can't be used to game the leaderboard.
   - **Copy:** the daily screen says "The clock started with the letters."
2. **Identity: anonymous accounts, linkable later.**
   - **Setup:** everyone gets an anonymous Supabase account automatically, with no form. Streaks, the collection and leaderboard entries live server-side on that account.
   - **Later:** an optional "link an email" step makes them work across devices.
   - **Today's `clientId`:** gets migrated onto the anonymous user.
   - **Before building:** check the current Supabase anonymous sign-in API and its rate limits in the docs.
3. **Pass the phone: turns, fastest valid time wins.**
   - **Turns:** each player races alone against the same letters while the other looks away. The faster valid time takes the round, and the times stay hidden until both have played.
   - **Still to define with the build:**
     - equal times count as a tie under the room's tie rule
     - the length bonus and "no repeat letters" apply as in online play
     - a player who runs out of time scores nothing for that turn
4. **Quick match: fixed rules.**
   - **Rules:** 5 rounds, 30 s, minimum 4 letters, ties replayed, no slang, length bonus off, no repeat letters off, peek on.
   - **Matching:** after 60 s without a match, "nobody around" appears. No region or skill matching in the first version.
5. **Share image: rendered on the server.**
   - **How:** a Next.js image route (`next/og`) renders the match and daily cards.
   - **Link previews:** the same images serve as Open Graph previews for room and daily links. "Save image" downloads the server render.
   - **Before building:** check the current `next/og` API in `node_modules/next/dist/docs/`, per AGENTS.md.

**Shape rule (first vs last):**
- **Form fixes the meaning:** the first letter always sits in a rounded square, the last letter always in a starburst. That holds on every screen.
- **Colour can adapt:** the fill may change so the shape stays visible on the phase background. Pick is pink, so the last-letter star there is yellow. Reveal is blue, so the first-letter square there is yellow. Elsewhere the defaults are blue square and pink star.
