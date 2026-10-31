"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { REACTION_COOLDOWN_MS, reactionText, type ReactionId } from "@/lib/room-fx";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * F3: a row of reaction (player) or cheer (spectator) pills. After a tap
 * the row rests briefly, so a held finger can't flood the room.
 */
export function ReactionPills({ ctx, ids, label }: { ctx: GameCtx; ids: ReactionId[]; label: string }) {
  const [resting, setResting] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const names = { host: ctx.hostName, guest: ctx.guestName };
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <Button
          key={id}
          type="button"
          variant="pill-soft"
          size="pill-md"
          className="max-w-full min-w-0 font-semibold"
          aria-disabled={resting || undefined}
          // Keep focus where it is: in the race that is the word input, and
          // moving it would close the phone keyboard mid-word.
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            // Taps inside the race frame would otherwise refocus the input.
            e.stopPropagation();
            if (resting) return;
            ctx.fx.react(id);
            setResting(true);
            timer.current = setTimeout(() => setResting(false), REACTION_COOLDOWN_MS);
          }}
        >
          <span className="truncate">{reactionText(id, "label", names)}</span>
        </Button>
      ))}
    </div>
  );
}

/** Who sent a reaction, for the bubble's screen-reader line. */
function senderName(ctx: GameCtx, from: "host" | "guest" | "spectator") {
  return from === "spectator" ? "Someone watching" : from === "host" ? ctx.hostName : ctx.guestName;
}

/**
 * The latest incoming reaction or cheer as a yellow handwritten bubble.
 * Keyed by arrival, so each one replays the pop; it fades out by itself.
 * Reactions that arrived before this screen mounted are not replayed.
 * `hidden` keeps it off while it would cover something that matters (a
 * rejected word's message in the race).
 */
export function ReactionBubble({ ctx, className, hidden = false }: { ctx: GameCtx; className?: string; hidden?: boolean }) {
  const [mountedAt] = React.useState(() => Date.now());
  const rx = hidden ? null : ctx.fx.incoming;
  const fresh = rx && (ctx.collection.preview || rx.at >= mountedAt - 1500) ? rx : null;
  const text = fresh ? reactionText(fresh.id, "bubble", { host: ctx.hostName, guest: ctx.guestName }) : "";
  return (
    <>
      {fresh ? (
        <span
          key={fresh.at}
          aria-hidden
          data-hold={ctx.collection.preview || undefined}
          className={cn(
            "fx-bubble pointer-events-none absolute z-[1] max-w-[calc(100%-40px)] truncate rounded-[18px_18px_18px_4px] bg-shape-yellow px-3.5 py-1.5 font-hand text-[22px] leading-tight text-[#141414]",
            className
          )}
        >
          {text}
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {fresh ? `${senderName(ctx, fresh.from)}: ${text}` : ""}
      </span>
    </>
  );
}
