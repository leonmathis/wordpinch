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
import { Share2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "./avatar";
import { motion } from "motion/react";

// `cursor-pointer` only belongs on rows whose text is a real <Label> bound
// to a control — it used to be on every settings label, including the ones
// that are inert <span>s next to steppers.
const SETTINGS_LABEL =
  "t-label font-mono text-[13px] text-muted-foreground tracking-[0.01em]";
const SETTINGS_LABEL_CLICKABLE = `${SETTINGS_LABEL} cursor-pointer`;
/**
 * Secondary line under a settings label. Uses `muted-foreground`, not the
 * softer `muted-soft`: at 11px this is small text and needs the 4.5:1 ratio
 * (muted-soft only clears the 3:1 large-text bar in light mode). The
 * hierarchy comes from the size difference instead.
 */
const SETTINGS_HINT = "font-mono text-[11px] text-muted-foreground mt-0.5";

/** Plain-language gloss for each tie option, shown under the toggle group. */
const TIE_HINTS: Record<"replay" | "split" | "nobody", string> = {
  replay: "Tied round is played again",
  split: "Both players score the point",
  nobody: "Nobody scores the point",
};

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
  // `pending` mirrors the existence of an in-flight debounced commit. It
  // lives in state (not a ref) because we read it during render to gate
  // the external-sync — `react-hooks/refs` disallows reading ref values
  // during render.
  const [pending, setPending] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only sync from the broadcast when we have no pending optimistic
  // edit. Without this gate a roundtrip broadcast for a previous click
  // would snap the display back to that intermediate value while the
  // user is still tapping — visible "5 → 6 → glitch back to 5 → 7"
  // flicker. With it the user's local sequence stays smooth; once the
  // last click's debounced commit fires and the broadcast for that
  // value lands, `pending` is false and the sync runs (no-op visually
  // since local already matches).
  if (value !== lastSeen && !pending) {
    setLastSeen(value);
    setLocal(value);
  }

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );
  const update = React.useCallback(
    (next: T) => {
      setLocal(next);
      setPending(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        commit(next);
        // Clear pending *after* dispatching so the next render unblocks
        // future external syncs.
        setPending(false);
      }, delayMs);
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

  // `role="group"` makes the aria-label announce; on a bare <div> it was
  // ignored, so all three steppers read as an identical pair of
  // "Decrease"/"Increase" buttons with no idea which setting they moved.
  // The value gets the same treatment via aria-live so a change is spoken.
  return (
    <div className="flex items-center gap-2" role="group" aria-label={ariaLabel}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={dec}
        disabled={disabled || local <= min}
        aria-label={ariaLabel ? `Decrease ${ariaLabel.toLowerCase()}` : "Decrease"}
        className="h-9 w-9 rounded-full font-mono text-[14px] relative after:absolute after:-inset-1 after:content-['']"
      >
        −
      </Button>
      <span
        className="font-mono text-[14px] tabular-nums w-10 text-center"
        aria-live="polite"
      >
        {local}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={inc}
        disabled={disabled || local >= max}
        aria-label={ariaLabel ? `Increase ${ariaLabel.toLowerCase()}` : "Increase"}
        className="h-9 w-9 rounded-full font-mono text-[14px] relative after:absolute after:-inset-1 after:content-['']"
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
  const [storedName, setStoredName] = useStoredString("name");
  // Someone who arrives on an invite link never passes the landing page, so
  // they sit in the roster as the fallback "guest" with no idea they can
  // change it. Nudge them (and a host who created a room without a name).
  const needsName = !storedName.trim();
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
  const commitLengthBonus = React.useCallback(
    (v: boolean) => {
      if (actions.ready) void actions.setSettings({ lengthBonus: v });
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
  // Legacy rooms (settings written before this field existed) read as
  // `undefined` here — coerce to false so the Switch always renders a
  // concrete boolean.
  const [lengthBonus, setLengthBonus] = useOptimisticSetting(
    ctx.settings.lengthBonus ?? false,
    commitLengthBonus
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
          <div className="flex items-end justify-between gap-3">
            {/* The `.room-code` font-size lives in @layer components, which
             *  Tailwind's utilities layer outranks — the Button's own
             *  `text-sm` was silently shrinking the room code (the single
             *  most important thing on this screen) from 48px to 14px.
             *  Restating the size as utilities here wins the cascade; the
             *  spectator lobby renders the same class on a plain div and
             *  was never affected. */}
            <Button
              variant="ghost"
              onClick={copy}
              aria-label={`Copy room code ${ctx.roomCode.split("").join(" ")}`}
              className="room-code h-auto gap-3 px-2 py-1 -ml-2 text-[48px] max-[500px]:text-[36px] leading-none tracking-[0.05em] hover:bg-muted"
            >
              {/* Per-character stagger so the code feels like it just got
               *  pulled out of a hat. Single animation, no layout shift —
               *  motion.span uses inline-block to honour the y-transform. */}
              <motion.span
                aria-hidden
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
              {/* Visible copy affordance. The only cue before was a `title`
               *  tooltip — invisible on touch and to keyboard users. */}
              <Copy
                strokeWidth={1.7}
                className="size-[16px] text-muted-foreground"
                aria-hidden
              />
            </Button>
            {/* One sharing control per screen: the identical icon button
             *  that used to sit here duplicated the one in the top chrome,
             *  which is hidden in the lobby for exactly this reason. */}
            <Button
              variant="outline"
              onClick={ctx.openShare}
              className="h-9 gap-2 rounded-[var(--radius)] px-3 text-[13px] font-medium shrink-0"
            >
              <Share2 strokeWidth={1.7} className="size-[15px]" />
              Share link
            </Button>
          </div>
          <div className="t-label" style={{ marginTop: 8 }}>
            Your friend joins with this code — tap it to copy.
          </div>

          <section style={{ marginTop: 28 }}>
            <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: 8 }}>
              <div className="t-label-up">Players</div>
              {needsName ? (
                <div className="t-label text-right">
                  Add your name below so {isHost ? "your guest" : hostName}{" "}
                  knows who they&rsquo;re playing
                </div>
              ) : null}
            </div>
            <div>
              <Separator />
              <div className="players-row">
                <div className="flex items-center gap-3">
                  <Avatar name={hostName} side="host" />
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
                    <Avatar name={guestName} side="guest" />
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
                <div className="min-w-0 pr-3">
                  <span id={tieLabelId} className={SETTINGS_LABEL}>
                    Tie behavior
                  </span>
                  {/* replay / split / nobody meant nothing without a gloss;
                   *  the line tracks the current selection. */}
                  <div className={SETTINGS_HINT}>{TIE_HINTS[tieBehavior]}</div>
                </div>
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
                <div className="min-w-0 pr-3">
                  {/* Renamed: with this off, validation requires the word to
                   *  be in the ENABLE game lexicon — which rejects plenty of
                   *  ordinary words ("tech") that have nothing to do with
                   *  proper nouns. The old label promised something the
                   *  setting doesn't do. */}
                  <Label
                    htmlFor="lobby-allow-proper"
                    className={SETTINGS_LABEL_CLICKABLE}
                  >
                    Allow slang &amp; proper nouns
                  </Label>
                  <div className={SETTINGS_HINT}>
                    {allowProperNouns
                      ? "Anything the dictionary knows counts"
                      : "Strict: only words in the game word list"}
                  </div>
                </div>
                <Switch
                  id="lobby-allow-proper"
                  disabled={!isHost}
                  checked={allowProperNouns}
                  onCheckedChange={setAllowProperNouns}
                />
              </div>
              <Separator />
              <div className="settings-row">
                <div className="min-w-0 pr-3">
                  <Label
                    htmlFor="lobby-audio-defs"
                    className={SETTINGS_LABEL_CLICKABLE}
                  >
                    Audio definitions
                  </Label>
                  <div className={SETTINGS_HINT}>
                    Play the winning word out loud
                  </div>
                </div>
                <Switch
                  id="lobby-audio-defs"
                  disabled={!isHost}
                  checked={audioDefinitions}
                  onCheckedChange={setAudioDefinitions}
                />
              </div>
              <Separator />
              <div className="settings-row">
                <div className="min-w-0 pr-3">
                  <Label
                    htmlFor="lobby-length-bonus"
                    className={SETTINGS_LABEL_CLICKABLE}
                  >
                    +0.5 per extra letter
                  </Label>
                  <div className={SETTINGS_HINT}>
                    Longer words than the minimum score more
                  </div>
                </div>
                <Switch
                  id="lobby-length-bonus"
                  disabled={!isHost}
                  checked={lengthBonus}
                  onCheckedChange={setLengthBonus}
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
