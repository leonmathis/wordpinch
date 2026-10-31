<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# wordpinch — agent guide

A real-time 2-player word game. Pick a letter, race to type a word that starts/ends with both players' letters. First valid submission wins.

## Current state

Static design implementation — phase 2 of 10. All 8 game phases are built as React components backed by mock data. No realtime, no Supabase, no word validation yet.

## Stack

- Next.js 16.2 (Turbopack, App Router), React 19.2
- Tailwind CSS 4 + shadcn (base-nova preset), restyled to the Pastel Pop redesign (`docs/redesign/`)
- shadcn primitives from `@base-ui/react`: Button (`pill`, `pill-soft`, `circle`), Input (`pill`), Switch, Dialog (`sheet`), ToggleGroup (`segment`), Popover, Label
- `next-themes` for system-aware dark mode
- Urbanist (UI) + Gochi Hand (handwritten lines and game letters) via `next/font/google`
- `lucide-react` icons

## File map

```
src/
├─ app/
│  ├─ layout.tsx              Urbanist + Gochi Hand, ThemeProvider, metadata
│  ├─ not-found.tsx           Pastel Pop 404 (shared with r/[code]/not-found.tsx)
│  ├─ dev/kit/                dev-only kit showcase (404 in production)
│  ├─ page.tsx                renders Landing via WordpinchUI
│  ├─ api/identity/adopt/     moves a pre-F1 clientId's seats onto the account
│  ├─ api/collection/         the caller's word collection (RLS, own rows)
│  ├─ collection/page.tsx     "Your words" page (F2)
│  ├─ globals.css             tokens, phase backgrounds, animations, shell classes
│  └─ r/[code]/page.tsx       Promise.all on params/searchParams → WordpinchUI
├─ components/
│  ├─ theme-provider.tsx      thin wrapper around next-themes
│  ├─ ui/                     shadcn primitives
│  └─ game/                   phase components
│     ├─ wordpinch-ui.tsx     phase switcher; ShareDialog is next/dynamic
│     ├─ top-chrome.tsx       round label + pills (inline score), settings gear
│     ├─ settings-menu.tsx    room/share, sound, theme, how to play, leave
│     ├─ kit/                 Shape, ShapeGlyph (+ measured glyph offsets),
│     │                       LetterSlots, AnchoredWord, StatusPill, ModeGrid
│     └─ (8 phase files + share-dialog, qr, banners, words-played, rounds-table)
└─ lib/
   ├─ utils.ts                cn() — clsx + tailwind-merge
   ├─ hooks.ts                useStoredBool (useSyncExternalStore)
   ├─ features.ts             flags for daily / quick match / pass the phone
   ├─ identity.ts             anonymous sign-in, useIdentity / ensureIdentity / useHasAccount
   ├─ collection.ts           server: collect_word, won words on resolve, reads
   ├─ supabase/identity.ts    server: resolveCallerId (session first, clientId fallback)
   └─ game/
      ├─ preview.ts           dev preview state (see Routes)
      ├─ awards.ts            match-end fastest / longest
      └─ types.ts             GameCtx, GamePhase
```

## Routes

- `/` → Landing
- `/r/[code]` → renders `WordpinchUI` with the room code uppercased
- `/r/[code]?phase=lobby|pick|reveal|race|result|matchend|spectator` → that phase (defaults to `lobby`)
- `?reconnect=1` overlays the reconnect banner
- `/collection` → the player's word collection (F2)
- Dev only, with `?phase=`: `as=host|guest|spectator` seeds a room without network (`lib/game/preview.ts`); `guest=0` empties the guest seat, `stress=1` uses 32-character names and long words, `away=1` drops the opponent, `opp=submitted`, `settling=1`, `result=win|nearmiss|split|splittimeout|nobody|nobodytimeout|forfeit|replay`, `end=win|loss|tie`, `rounds=15`, `collected=3` (match-end banner count). The code must be 4 valid characters, e.g. `/r/K7QM`.

## Conventions

- **shadcn first.** Don't write plain `<button>` or `<input>` when a shadcn primitive fits; use the Pastel Pop variants.
- **Text inside shapes** keeps ≥12px from the real outline and glyphs are optically centred; both are measured in `tests/e2e` (kit, landing, race, matchend).
- **Tailwind for one-offs**, `@layer components` in `globals.css` for repeated patterns or anything needing `::before` / nth-child / pseudo selectors.
- **Phase reset** via `key={sceneKey}` remount — never `setState` in a `useEffect` body (React 19 will lint it).
- **Persisted state** via `useStoredBool` (`useSyncExternalStore` + cross-tab `storage` events). Keys are namespaced `wordpinch:v1:…`.
- **`prefers-reduced-motion`** is honored on all entrance/scene animations.
- **Identity (F1).** Every player has an anonymous Supabase account (session in cookies). Room routes get the caller from `resolveCallerId`, never straight from the body; a body id is only the fallback for browsers without a session and is refused when it is an account id. Nothing signs in until a room is created or opened.
- **Collection (F2).** Writes only on the server through `collect_word` (won words in `resolveRound`, bookmarks via `POST /api/rooms/[code]/save-word`, which reads the word from the room, never the body). Reads run with the caller's session, so RLS returns their own rows. One row per player and word; a win replaces a bookmark.
- **Async params/searchParams.** In Next 16, both are Promises and must be `await Promise.all([params, searchParams])`.
- **Ternaries, not `&&`** for conditional rendering — `&&` with a number type renders `0` as text.
- **Space after an expression:** `{name} still waiting` loses its space when the JSX text runs on to a line break (the toolchain trims it; same line before the closing tag is fine). Use a template string (`{`${name} still waiting`}`) or `{" "}`.

## Common tasks

| Task | Where |
|---|---|
| Add a shadcn component | `npx shadcn@latest add <name>` — drops into `src/components/ui/` |
| Change a design token | `globals.css` `:root` / `.dark` blocks (oklch values) |
| Add a new game phase | New component in `src/components/game/`, add to `GamePhase` in `types.ts`, add to the phase switch in `wordpinch-ui.tsx` and the validator in `r/[code]/page.tsx` |
| Adjust preview data | `src/lib/game/preview.ts` |

## Verify before committing

```bash
npx tsc --noEmit   # typecheck
npm run lint       # eslint
npm run build      # production build (typechecks too)
npm run test:e2e   # Playwright on 6 device profiles (dev server)
```

Screenshots land in `test-results/screens/` (scrolled `.wp-body` segments as `-2`, `-3`…). The per-PR checklist is in `docs/redesign/03-code-mapping.md` §7. If a CSS change doesn't show, check the computed style: the dev server once served a stale `globals.css` until restarted.

## What's coming next (phase 3+)

- Supabase Postgres + Realtime (Broadcast + Presence)
- Server-authoritative phase transitions
- Free Dictionary API for word validation with bundled ENABLE fallback
- Sounds (countdown tick, win ding, reject buzz)
- QR-coded share + Web Share API
- Vercel deploy
