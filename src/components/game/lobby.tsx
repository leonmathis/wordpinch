"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { TopChrome } from "./top-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import { Share2 } from "lucide-react";

const SETTINGS_LABEL = "t-label font-mono text-[13px] text-muted-foreground tracking-[0.01em] cursor-pointer";

export function Lobby({ ctx }: { ctx: GameCtx }) {
  const [copied, setCopied] = React.useState(false);
  const [tie, setTie] = React.useState<string[]>(["replay"]);
  const [allowProper, setAllowProper] = React.useState(false);
  const [audioDefs, setAudioDefs] = React.useState(true);
  const tieLabelId = React.useId();
  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    []
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ctx.roomCode);
    } catch {
      /* ignore */
    }
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <>
      <TopChrome
        total={ctx.total}
        muted={ctx.muted}
        onToggleMute={ctx.toggleMute}
        onShare={ctx.openShare}
      />
      <div className="wp-body">
        <div className="wp-frame scene">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={copy}
              title="click to copy"
              className="room-code h-auto p-0 hover:bg-transparent"
            >
              {ctx.roomCode}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Share room"
              onClick={ctx.openShare}
              className="h-9 w-9 text-muted-foreground"
            >
              <Share2 strokeWidth={1.7} className="size-[15px]" />
            </Button>
          </div>

          <section style={{ marginTop: 28 }}>
            <div className="t-label-up" style={{ marginBottom: 8 }}>
              Players
            </div>
            <div>
              <Separator />
              <div className="players-row">
                <div className="flex items-center gap-3">
                  <span className="wp-dot" aria-hidden />
                  <span>
                    {ctx.you.name}{" "}
                    <span className="t-label">(host)</span>
                  </span>
                </div>
                <span className="font-mono text-muted-foreground" style={{ fontSize: 12 }}>
                  online
                </span>
              </div>
              <Separator />
              <div className="players-row">
                <div className="flex items-center gap-3">
                  <span className="wp-dot" aria-hidden />
                  <span>{ctx.them.name}</span>
                </div>
                <span className="font-mono text-muted-foreground" style={{ fontSize: 12 }}>
                  online
                </span>
              </div>
              <Separator />
            </div>
          </section>

          <section style={{ marginTop: 32 }}>
            <div className="t-label-up" style={{ marginBottom: 8 }}>
              Settings
            </div>
            <div>
              <Separator />
              <div className="settings-row">
                <Label htmlFor="lobby-rounds" className={SETTINGS_LABEL}>
                  Rounds
                </Label>
                <Input
                  id="lobby-rounds"
                  className="font-mono text-center h-[34px] w-16 rounded-[var(--radius)] text-[14px]"
                  defaultValue="5"
                />
              </div>
              <Separator />
              <div className="settings-row">
                <Label htmlFor="lobby-timer" className={SETTINGS_LABEL}>
                  Round timer
                </Label>
                <Input
                  id="lobby-timer"
                  className="font-mono text-center h-[34px] w-16 rounded-[var(--radius)] text-[14px]"
                  defaultValue="20s"
                />
              </div>
              <Separator />
              <div className="settings-row">
                <Label htmlFor="lobby-min-length" className={SETTINGS_LABEL}>
                  Min word length
                </Label>
                <Input
                  id="lobby-min-length"
                  className="font-mono text-center h-[34px] w-16 rounded-[var(--radius)] text-[14px]"
                  defaultValue="3"
                />
              </div>
              <Separator />
              <div className="settings-row">
                <span id={tieLabelId} className={SETTINGS_LABEL}>
                  Tie behavior
                </span>
                <ToggleGroup
                  aria-labelledby={tieLabelId}
                  value={tie}
                  onValueChange={(v) => v.length && setTie(v)}
                  className="rounded-md border border-border overflow-hidden"
                >
                  <ToggleGroupItem
                    value="replay"
                    className="font-mono text-[12px] h-7 px-2.5 rounded-none data-[state=on]:bg-foreground data-[state=on]:text-background"
                  >
                    replay
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="split"
                    className="font-mono text-[12px] h-7 px-2.5 rounded-none data-[state=on]:bg-foreground data-[state=on]:text-background"
                  >
                    split
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="nobody"
                    className="font-mono text-[12px] h-7 px-2.5 rounded-none data-[state=on]:bg-foreground data-[state=on]:text-background"
                  >
                    nobody
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <Separator />
              <div className="settings-row">
                <Label htmlFor="lobby-allow-proper" className={SETTINGS_LABEL}>
                  Allow proper nouns
                </Label>
                <Switch
                  id="lobby-allow-proper"
                  checked={allowProper}
                  onCheckedChange={setAllowProper}
                />
              </div>
              <Separator />
              <div className="settings-row">
                <Label htmlFor="lobby-audio-defs" className={SETTINGS_LABEL}>
                  Audio definitions
                </Label>
                <Switch
                  id="lobby-audio-defs"
                  checked={audioDefs}
                  onCheckedChange={setAudioDefs}
                />
              </div>
              <Separator />
            </div>
          </section>

          <Button
            className="w-full h-[38px] rounded-[var(--radius)] text-[14px] font-medium"
            style={{ marginTop: 32 }}
            onClick={() => ctx.setPhase("pick")}
          >
            Start game
          </Button>
          <div className="t-label text-center" style={{ marginTop: 12 }}>
            2 of 2 ready
          </div>
        </div>
      </div>
      {copied && (
        <div className="toast" role="status" aria-live="polite">
          copied
        </div>
      )}
    </>
  );
}
