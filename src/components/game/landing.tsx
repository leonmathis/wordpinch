"use client";

import type { GameCtx } from "@/lib/game/types";
import { TopChrome } from "./top-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Landing({ ctx }: { ctx: GameCtx }) {
  return (
    <>
      <TopChrome
        total={ctx.total}
        muted={ctx.muted}
        onToggleMute={ctx.toggleMute}
        showShare={false}
      />
      <div className="wp-body">
        <div className="wp-frame scene">
          <p
            className="text-foreground text-center mx-auto"
            style={{ fontSize: 15, lineHeight: 1.7, maxWidth: "50ch", marginBottom: 28 }}
          >
            A two-player word game. You pick a letter, your opponent picks a letter,
            and you both race to type a word that starts and ends with them.
          </p>

          <div className="mx-auto w-full" style={{ maxWidth: 360 }}>
            <Label htmlFor="room" className="t-label-up block mb-2">
              Join a room
            </Label>
            <Input
              id="room"
              className="font-mono h-[38px] rounded-[var(--radius)] text-[14px]"
              placeholder="SLATE-9F"
              defaultValue=""
            />
            <Button
              className="w-full h-[38px] rounded-[var(--radius)] text-[14px] font-medium mt-3"
              onClick={() => ctx.setPhase("lobby")}
            >
              Join
            </Button>
            <div className="text-center mt-3">
              <Button
                variant="link"
                onClick={() => ctx.setPhase("lobby")}
                className="link-underline h-auto p-0 font-mono text-[13px] text-foreground no-underline hover:no-underline"
              >
                Create new room
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
