/**
 * F3 reaction and cheer ids. A plain module (no "use client") so the dev
 * preview parser on the server can read them too; the realtime side lives
 * in `lib/room-fx.ts`.
 */

export type Seat = "host" | "guest";
export type FxRole = Seat | "spectator";

/** Player reactions during the race, and spectator cheers. */
export const REACTIONS = {
  hurry: { label: "psst, hurry", bubble: "psst, hurry!", by: "player" },
  close: { label: "ooh close", bubble: "ooh close!", by: "player" },
  gg: { label: "gg", bubble: "gg!", by: "player" },
  "go-host": { label: "go {host}!", bubble: "go {host}!", by: "spectator" },
  "go-guest": { label: "go {guest}!", bubble: "go {guest}!", by: "spectator" },
  ooh: { label: "ooh", bubble: "ooh!", by: "spectator" },
} as const;
export type ReactionId = keyof typeof REACTIONS;

export const PLAYER_REACTIONS: ReactionId[] = ["hurry", "close", "gg"];
export const CHEERS: ReactionId[] = ["go-host", "go-guest", "ooh"];

/** Fills `{host}` / `{guest}` with the seat names. */
export function reactionText(id: ReactionId, kind: "label" | "bubble", names: Record<Seat, string>) {
  return REACTIONS[id][kind].replace("{host}", names.host).replace("{guest}", names.guest);
}
