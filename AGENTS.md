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
- Tailwind CSS 4 + shadcn (base-nova preset, neutral palette)
- shadcn primitives from `@base-ui/react`: Button, Input, Switch, Dialog, ToggleGroup, Label, Separator
- `next-themes` for system-aware dark mode
- Geist Sans + Geist Mono via `next/font/google`
- `lucide-react` icons

## File map

```
src/
├─ app/
│  ├─ layout.tsx              Geist fonts, ThemeProvider, metadata
│  ├─ page.tsx                renders Landing via WordpinchUI
│  ├─ globals.css             tokens, animations, component classes
│  └─ r/[code]/page.tsx       Promise.all on params/searchParams → WordpinchUI
├─ components/
│  ├─ theme-provider.tsx      thin wrapper around next-themes
│  ├─ ui/                     shadcn primitives
│  └─ game/                   phase components
│     ├─ wordpinch-ui.tsx     phase switcher; ShareDialog is next/dynamic
│     ├─ top-chrome.tsx       progress bar, brand, theme/mute/share buttons
│     ├─ score-hud.tsx        score row + expandable used-words list
│     ├─ letters-display.tsx  the `T _ _ _ H` display, shared
│     └─ (8 phase files + share-dialog, qr, reconnect-banner)
└─ lib/
   ├─ utils.ts                cn() — clsx + tailwind-merge
   ├─ hooks.ts                useStoredBool (useSyncExternalStore)
   └─ game/
      ├─ mock.ts              deepFrozen MOCK
      └─ types.ts             GameCtx, GamePhase
```

## Routes

- `/` → Landing
- `/r/[code]` → renders `WordpinchUI` with the room code uppercased
- `/r/[code]?phase=lobby|pick|reveal|race|result|matchend|spectator` → that phase (defaults to `lobby`)
- `?reconnect=1` overlays the reconnect banner

A dev-only phase strip at the bottom of `/r/[code]` is gated by `process.env.NODE_ENV === "development"` and tree-shaken from production.

## Conventions

- **shadcn first.** Don't write plain `<button>` or `<input>` when a shadcn primitive fits. The two giant typographic inputs (`pick-input`, `race-input`) wrap shadcn `Input` with className overrides — see `PICK_INPUT_OVERRIDES` / `RACE_INPUT_OVERRIDES` in their phase files.
- **Tailwind for one-offs**, `@layer components` in `globals.css` for repeated patterns or anything needing `::before` / nth-child / pseudo selectors.
- **Subgrid** for cross-row column alignment (see `.used-list` + `.used-row` in `globals.css`).
- **Phase reset** via `key={sceneKey}` remount — never `setState` in a `useEffect` body (React 19 will lint it).
- **Persisted state** via `useStoredBool` (`useSyncExternalStore` + cross-tab `storage` events). Keys are namespaced `wordpinch:v1:…`.
- **`prefers-reduced-motion`** is honored on all entrance/scene animations.
- **Async params/searchParams.** In Next 16, both are Promises and must be `await Promise.all([params, searchParams])`.
- **Ternaries, not `&&`** for conditional rendering — `&&` with a number type renders `0` as text.

## Common tasks

| Task | Where |
|---|---|
| Add a shadcn component | `npx shadcn@latest add <name>` — drops into `src/components/ui/` |
| Change a design token | `globals.css` `:root` / `.dark` blocks (oklch values) |
| Add a new game phase | New component in `src/components/game/`, add to `GamePhase` in `types.ts`, add to the phase switch in `wordpinch-ui.tsx` and the validator in `r/[code]/page.tsx` |
| Adjust mock data | `src/lib/game/mock.ts` — re-`deepFreeze`d on edit |

## Verify before committing

```bash
npx tsc --noEmit   # typecheck
npm run lint       # eslint
npm run build      # production build (typechecks too)
```

Visual: open the dev server and click through the phase strip at the bottom of `/r/slate-9f`. CSS Grid `max-content` is per-grid-container, so any change to `.used-row` needs verification across multiple rows.

## What's coming next (phase 3+)

- Supabase Postgres + Realtime (Broadcast + Presence)
- Server-authoritative phase transitions
- Free Dictionary API for word validation with bundled ENABLE fallback
- Sounds (countdown tick, win ding, reject buzz)
- QR-coded share + Web Share API
- Vercel deploy
