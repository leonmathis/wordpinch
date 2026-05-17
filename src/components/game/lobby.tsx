"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import type { PersistedGameState } from "@/lib/game/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import { useStoredString } from "@/lib/hooks";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "./avatar";
import { motion } from "motion/react";

const SETTINGS_LABEL = "t-label font-mono text-[13px] text-muted-foreground tracking-[0.01em] cursor-pointer";

/**
 * Local-state mirror for a value that's authoritative on the server and
 * propagated back via Realtime broadcast. Returns `[local, update]`:
 *
 *  - `local`: what to display. Updated synchronously by `update` so the UI
 *    is responsive even before the broadcast catches up.
 *  - `update(next)`: applies the change locally, then debounces a single
 *    `commit(next)` call after `delayMs` (default 250 ms) so rapid clicks
 *    coalesce into one server POST.
 *
 * External (broadcasted) prop changes still win — when `value` diverges
 * from `lastSeen`, both local and lastSeen reset to it during render.
 * (Render-phase setState is the canonical React 18 prop-to-state sync
 * pattern; the `react-hooks/refs` lint forbids the ref alternative.)
 */
function useOptimisticSetting<T>(
  value: T,
  commit: (next: T) => void,
  delayMs = 250
) {
  const [local, setLocal] = React.useState(value);
  const [lastSeen, setLastSeen] = React.useState(value);
  if (value !== lastSeen) {
    setLastSeen(value);
    setLocal(value);
  }
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // When an external value arrives mid-debounce, cancel the pending
  // commit so a stale local edit can't land after the broadcast we just
  // synced from and clobber it. Ref mutation lives in an effect (not
  // during render) to satisfy `react-hooks/refs`.
  React.useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [value]);
  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );
  const update = React.useCallback(
    (next: T) => {
      setLocal(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => commit(next), delayMs);
    },
    [commit, delayMs]
  );
  return [local, update] as const;
}

/**
 * Mobile-friendly numeric stepper. Uses `useOptimisticSetting` so rapid
 * clicks compound on the displayed value rather than the (lagging)
 * broadcast prop — that lag previously made the +/- buttons feel dead
 * mid-tap-sequence.
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
  const [local, update] = useOptimisticSetting(value, onChange);

  const dec = () => {
    const next = Math.max(min, local - step);
    if (next !== local) update(next);
  };
  const inc = () => {
    const next = Math.min(max, local + step);
    if (next !== local) update(next);
  };

  return (
    <div className="flex items-center gap-2" aria-label={ariaLabel}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={dec}
        disabled={disabled || local <= min}
        aria-label="Decrease"
        className="h-8 w-8 rounded-full font-mono text-[14px]"
      >
        −
      </Button>
      <span className="font-mono text-[14px] tabular-nums w-10 text-center">
        {local}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={inc}
        disabled={disabled || local >= max}
        aria-label="Increase"
        className="h-8 w-8 rounded-full font-mono text-[14px]"
      >
        +
      </Button>
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
  const tieLabelId = React.useId();
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

  // Settings commits — wrapped through useOptimisticSetting so clicks feel
  // instant even though setSettings round-trips through the server. The
  // commit closures depend on ctx.actions, which re-binds whenever the
  // broadcast lands; that's fine because within a single debounce window
  // the broadcast hasn't fired yet, so ctx.actions stays stable.
  const actions = ctx.actions;
  const commitTie = React.useCallback(
    (v: PersistedGameState["settings"]["tieBehavior"]) => {
      if (actions.ready) void actions.setSettings({ tieBehavior: v });
    },
    [actions]
  );
  const commitProper = React.useCallback(
    (v: boolean) => {
      if (actions.ready) void actions.setSettings({ allowProperNouns: v });
    },
    [actions]
  );
  const commitAudio = React.useCallback(
    (v: boolean) => {
      if (actions.ready) void actions.setSettings({ audioDefinitions: v });
    },
    [actions]
  );
  const [tieBehavior, setTieBehavior] = useOptimisticSetting(
    ctx.settings.tieBehavior,
    commitTie
  );
  const [allowProperNouns, setAllowProperNouns] = useOptimisticSetting(
    ctx.settings.allowProperNouns,
    commitProper
  );
  const [audioDefinitions, setAudioDefinitions] = useOptimisticSetting(
    ctx.settings.audioDefinitions,
    commitAudio
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ctx.roomCode);
      toast.success("Room code copied", { duration: 1500 });
    } catch {
      toast.error("Couldn't copy — try the share dialog");
    }
  };

  return (
    <>
      <div className="wp-body">
        <div className="wp-frame scene">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={copy}
              title="click to copy"
              className="room-code h-auto p-0 hover:bg-transparent"
            >
              {/* Per-character stagger so the code feels like it just got
               *  pulled out of a hat. Single animation, no layout shift —
               *  motion.span uses inline-block to honour the y-transform. */}
              <motion.span
                aria-label={ctx.roomCode}
                initial="initial"
                animate="animate"
                variants={{
                  initial: {},
                  animate: { transition: { staggerChildren: 0.06 } },
                }}
              >
                {ctx.roomCode.split("").map((c, i) => (
                  <motion.span
                    key={`${ctx.roomCode}-${i}`}
                    aria-hidden
                    variants={{
                      initial: { opacity: 0, y: 8, scale: 0.85 },
                      animate: { opacity: 1, y: 0, scale: 1 },
                    }}
                    transition={{
                      duration: 0.42,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    style={{ display: "inline-block" }}
                  >
                    {c}
                  </motion.span>
                ))}
              </motion.span>
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
                  <Avatar name={hostName} />
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
                  {ctx.guestPresent ? (
                    <Avatar name={guestName} />
                  ) : (
                    <Avatar
                      name="?"
                      dim
                      className="!bg-transparent border border-dashed border-border !text-muted-foreground"
                    />
                  )}
                  {ctx.guestPresent && !isHost ? (
                    <NameEditor
                      key={guestName}
                      initialName={guestName}
                      onSave={handleRename}
                    />
                  ) : (
                    <span className={ctx.guestPresent ? undefined : "text-muted-foreground italic"}>
                      {ctx.guestPresent ? guestName : "Waiting for player…"}
                    </span>
                  )}
                  {ctx.guestPresent && !isHost ? (
                    <span className="t-label">(you)</span>
                  ) : null}
                </div>
                <span
                  className="font-mono text-muted-foreground"
                  style={{ fontSize: 12 }}
                >
                  {ctx.guestPresent ? "online" : "—"}
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
                  value={[tieBehavior]}
                  onValueChange={(v) => {
                    const next = v[0];
                    if (
                      next === "replay" ||
                      next === "split" ||
                      next === "nobody"
                    ) {
                      setTieBehavior(next);
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
                  checked={allowProperNouns}
                  onCheckedChange={setAllowProperNouns}
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
                  checked={audioDefinitions}
                  onCheckedChange={setAudioDefinitions}
                />
              </div>
              <Separator />
            </div>
          </section>

          <Button
            className="w-full h-[38px] rounded-[var(--radius)] text-[14px] font-medium"
            style={{ marginTop: 32 }}
            disabled={!isHost || !ctx.guestPresent}
            onClick={() => {
              if (!isHost) return;
              if (ctx.actions.ready) {
                void ctx.actions.startMatch();
              } else {
                ctx.setPhase("pick");
              }
            }}
          >
            {!isHost
              ? "Waiting for host…"
              : ctx.guestPresent
              ? "Start game"
              : "Waiting for player…"}
          </Button>
          <div className="t-label text-center" style={{ marginTop: 12 }}>
            {!isHost
              ? "Host will start the match"
              : ctx.guestPresent
              ? "2 of 2 ready"
              : "1 of 2 ready · share the room code"}
          </div>
        </div>
      </div>
    </>
  );
}
