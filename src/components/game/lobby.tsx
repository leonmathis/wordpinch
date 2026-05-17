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
import { useStoredString } from "@/lib/hooks";
import { Share2 } from "lucide-react";

const SETTINGS_LABEL = "t-label font-mono text-[13px] text-muted-foreground tracking-[0.01em] cursor-pointer";

/**
 * Mobile-friendly numeric stepper. The HTML `<input type="number">` hides
 * spin buttons on iOS / mobile Chrome and the on-screen numeric keypad has
 * no easy "clear" — both make small adjustments fiddly. This component
 * uses explicit -/+ buttons clamped to [min, max] and keeps a tabular
 * value display in between.
 */
function NumberStepper({
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  ariaLabel?: string;
}) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  const baseBtn =
    "h-7 w-7 rounded-full border border-border bg-background text-foreground " +
    "flex items-center justify-center font-mono text-[14px] " +
    "disabled:opacity-30 disabled:cursor-not-allowed " +
    "hover:bg-foreground hover:text-background transition-colors";
  return (
    <div className="flex items-center gap-2" aria-label={ariaLabel}>
      <button
        type="button"
        onClick={dec}
        disabled={disabled || value <= min}
        aria-label="Decrease"
        className={baseBtn}
      >
        −
      </button>
      <span className="font-mono text-[14px] tabular-nums w-10 text-center">
        {value}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={disabled || value >= max}
        aria-label="Increase"
        className={baseBtn}
      >
        +
      </button>
    </div>
  );
}

/**
 * Inline name editor for the local player. `key={initialName}` on the parent
 * makes external name changes (e.g., the other tab renamed) reset the draft
 * to the canonical value; otherwise the draft is owned locally until blur.
 */
function NameEditor({
  initialName,
  onSave,
}: {
  initialName: string;
  onSave: (next: string) => void;
}) {
  const [name, setName] = React.useState(initialName);
  return (
    <Input
      aria-label="Your display name"
      value={name}
      maxLength={32}
      onChange={(e) => setName(e.target.value.slice(0, 32))}
      onBlur={() => {
        const trimmed = name.trim();
        if (trimmed && trimmed !== initialName) onSave(trimmed);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-7 w-[140px] rounded-[6px] text-[14px] px-2"
    />
  );
}

export function Lobby({ ctx }: { ctx: GameCtx }) {
  const [copied, setCopied] = React.useState(false);
  const tieLabelId = React.useId();
  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Host renders settings as editable controls and owns the Start button;
  // the guest sees a read-only view and a "waiting for host" hint. Names
  // come straight from canonical ctx fields — the viewer-perspective flip
  // on ctx.you/ctx.them isn't useful here, where rows are labelled by role.
  const isHost = ctx.meIsHost;
  const { hostName, guestName } = ctx;
  const [, setStoredName] = useStoredString("name");
  const handleRename = React.useCallback(
    (next: string) => {
      setStoredName(next);
      if (ctx.actions.ready) void ctx.actions.renameMe(next);
    },
    [setStoredName, ctx.actions]
  );

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
                  {isHost ? (
                    <NameEditor
                      key={hostName}
                      initialName={hostName}
                      onSave={handleRename}
                    />
                  ) : (
                    <span>{hostName}</span>
                  )}
                  <span className="t-label">
                    (host{isHost ? " · you" : ""})
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
                  {!isHost ? (
                    <NameEditor
                      key={guestName}
                      initialName={guestName}
                      onSave={handleRename}
                    />
                  ) : (
                    <span>{guestName}</span>
                  )}
                  {!isHost ? (
                    <span className="t-label">(you)</span>
                  ) : null}
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
                <span className={SETTINGS_LABEL}>Rounds</span>
                <NumberStepper
                  value={ctx.settings.rounds}
                  min={1}
                  max={15}
                  disabled={!isHost}
                  ariaLabel="Rounds"
                  onChange={(n) => {
                    if (ctx.actions.ready) void ctx.actions.setSettings({ rounds: n });
                  }}
                />
              </div>
              <Separator />
              <div className="settings-row">
                <span className={SETTINGS_LABEL}>Round timer (s)</span>
                <NumberStepper
                  value={ctx.settings.roundTimerSec}
                  min={5}
                  max={300}
                  step={5}
                  disabled={!isHost}
                  ariaLabel="Round timer in seconds"
                  onChange={(n) => {
                    if (ctx.actions.ready) void ctx.actions.setSettings({ roundTimerSec: n });
                  }}
                />
              </div>
              <Separator />
              <div className="settings-row">
                <span className={SETTINGS_LABEL}>Min word length</span>
                <NumberStepper
                  value={ctx.settings.minWordLength}
                  min={2}
                  max={10}
                  disabled={!isHost}
                  ariaLabel="Minimum word length"
                  onChange={(n) => {
                    if (ctx.actions.ready) void ctx.actions.setSettings({ minWordLength: n });
                  }}
                />
              </div>
              <Separator />
              <div className="settings-row">
                <span id={tieLabelId} className={SETTINGS_LABEL}>
                  Tie behavior
                </span>
                <ToggleGroup
                  aria-labelledby={tieLabelId}
                  disabled={!isHost}
                  value={[ctx.settings.tieBehavior]}
                  onValueChange={(v) => {
                    const next = v[0];
                    if (
                      next === "replay" ||
                      next === "split" ||
                      next === "nobody"
                    ) {
                      if (ctx.actions.ready)
                        void ctx.actions.setSettings({ tieBehavior: next });
                    }
                  }}
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
                  disabled={!isHost}
                  checked={ctx.settings.allowProperNouns}
                  onCheckedChange={(v) => {
                    if (ctx.actions.ready)
                      void ctx.actions.setSettings({ allowProperNouns: v });
                  }}
                />
              </div>
              <Separator />
              <div className="settings-row">
                <Label htmlFor="lobby-audio-defs" className={SETTINGS_LABEL}>
                  Audio definitions
                </Label>
                <Switch
                  id="lobby-audio-defs"
                  disabled={!isHost}
                  checked={ctx.settings.audioDefinitions}
                  onCheckedChange={(v) => {
                    if (ctx.actions.ready)
                      void ctx.actions.setSettings({ audioDefinitions: v });
                  }}
                />
              </div>
              <Separator />
            </div>
          </section>

          <Button
            className="w-full h-[38px] rounded-[var(--radius)] text-[14px] font-medium"
            style={{ marginTop: 32 }}
            disabled={!isHost}
            onClick={() => {
              if (!isHost) return;
              if (ctx.actions.ready) {
                void ctx.actions.startMatch();
              } else {
                ctx.setPhase("pick");
              }
            }}
          >
            {isHost ? "Start game" : "Waiting for host…"}
          </Button>
          <div className="t-label text-center" style={{ marginTop: 12 }}>
            {isHost ? "2 of 2 ready" : "Host will start the match"}
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
