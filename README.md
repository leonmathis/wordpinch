# wordpinch

A real-time 2-player word game. Both players privately pick a letter, the letters reveal at the same instant, then both race to type a word that starts with letter A and ends with letter B. First valid submission wins the round.

![wordpinch](https://img.shields.io/badge/status-phase%202%20of%2010-blue) ![Next.js](https://img.shields.io/badge/Next.js-16.2-black) ![React](https://img.shields.io/badge/React-19.2-61DAFB) ![Tailwind](https://img.shields.io/badge/Tailwind-4-38BDF8) ![shadcn](https://img.shields.io/badge/shadcn-4.7-000000)

## Status

Static design implementation. All 8 game phases are built as React components backed by mock data. No realtime, no persistence, no real word validation yet — those land in later phases.

| Phase | What | State |
|---|---|---|
| 1 | Scaffold (Next 16 + React 19 + Tailwind 4 + shadcn) | ✅ |
| 2 | Static screens for all 8 game phases | ✅ |
| 3 | Supabase + realtime (Broadcast + Presence) | next |
| 4–10 | Word validation, round loop, scoring, polish, deploy | pending |

## Stack

- **Framework**: Next.js 16.2 (Turbopack, App Router) + React 19.2
- **Styling**: Tailwind CSS 4 + shadcn (base-nova preset, neutral palette, oklch tokens)
- **Primitives**: shadcn's Base UI–backed Button, Input, Switch, Dialog, ToggleGroup, Label, Separator
- **Theme**: `next-themes` with CSS-only Sun/Moon swap (no hydration flicker)
- **Fonts**: Geist Sans + Geist Mono via `next/font/google`
- **Icons**: `lucide-react`

## Local development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The dev server uses Turbopack and hot-reloads CSS + components.

### Walking through phases

The eight game phases are gated by a `?phase=` query param on the room route:

| Phase | URL |
|---|---|
| Landing | `/` |
| Lobby | `/r/slate-9f` |
| Pick | `/r/slate-9f?phase=pick` |
| Reveal | `/r/slate-9f?phase=reveal` |
| Race | `/r/slate-9f?phase=race` |
| Result | `/r/slate-9f?phase=result` |
| Match end | `/r/slate-9f?phase=matchend` |
| Spectator | `/r/slate-9f?phase=spectator` |
| Reconnect banner overlay | append `&reconnect=1` to any room URL |

In development, a phase strip appears at the bottom of `/r/[code]` for one-click switching. It's stripped from production builds.

## Project structure

```
src/
├─ app/
│  ├─ layout.tsx              ← Geist fonts, ThemeProvider, metadata
│  ├─ page.tsx                ← Landing
│  ├─ globals.css             ← Design tokens + animations + component classes
│  └─ r/[code]/page.tsx       ← Phase router (Promise.all on params/searchParams)
├─ components/
│  ├─ theme-provider.tsx
│  ├─ ui/                     ← shadcn primitives (Button, Input, Switch, ...)
│  └─ game/                   ← Phase components + shared bits
│     ├─ wordpinch-ui.tsx     ← Phase switcher; dynamic-imports ShareDialog
│     ├─ top-chrome.tsx       ← Progress bar + brand + theme/mute/share icons
│     ├─ score-hud.tsx        ← Score row + expandable used-words panel
│     ├─ letters-display.tsx  ← `T _ _ _ H` shared display
│     ├─ landing.tsx · lobby.tsx · pick-phase.tsx · reveal-phase.tsx
│     ├─ race-phase.tsx · result-phase.tsx · match-end.tsx · spectator-phase.tsx
│     └─ share-dialog.tsx · reconnect-banner.tsx · qr.tsx
└─ lib/
   ├─ utils.ts                ← cn()
   ├─ hooks.ts                ← useStoredBool (useSyncExternalStore + storage events)
   └─ game/
      ├─ mock.ts              ← deepFrozen MOCK data
      └─ types.ts             ← GameCtx, GamePhase
```

## Scripts

```bash
npm run dev      # Turbopack dev server
npm run build    # production build (typechecks too)
npm run lint     # ESLint with eslint-config-next/typescript
```

## Conventions

- **shadcn first.** Always reach for a shadcn primitive before a plain `<button>` / `<input>`. The two giant typographic inputs (`pick-input`, `race-input`) wrap shadcn `Input` with className overrides.
- **Tailwind 4 utilities** for one-off layout. Custom component CSS classes (`globals.css` `@layer components`) for repeated patterns or anything with `::before` / nth-child / pseudo-selectors that aren't ergonomic inline.
- **Subgrid** for cross-row column alignment (see `.used-list` + `.used-row`).
- **Phase reset** via `key={sceneKey}` remount instead of `setState`-in-effect (React 19 `react-hooks/set-state-in-effect`).
- **Persisted client state** via `useStoredBool` (`useSyncExternalStore` + cross-tab `storage` events). Keys are namespaced with `wordpinch:v1:`.
- **`prefers-reduced-motion`** is honored on all entrance/scene animations.

## License

Private — not yet licensed.
