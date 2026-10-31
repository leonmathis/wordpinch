"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import type { PersistedGameState } from "@/lib/game/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useStoredString } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Minus, Pencil, Plus, QrCode, Send } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "./avatar";

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
 * Numeric stepper with 44px buttons. Uses `useOptimisticSetting` so rapid
 * clicks compound on the displayed value rather than the (lagging)
 * broadcast prop — that lag previously made the +/- buttons feel dead
 * mid-tap-sequence.
 */
function Stepper({
  value,
  min,
  max,
  step = 1,
  unit = "",
  disabled,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (next: number) => void;
  /** Names the group and the buttons ("Decrease rounds"). */
  label: string;
}) {
  const [local, update] = useOptimisticSetting(value, onChange);
  const set = (next: number) => {
    if (next !== local) update(next);
  };
  const name = label.toLowerCase();

  // `role="group"` makes the label announce with the buttons, and the
  // value is aria-live so a change is spoken.
  return (
    <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={label}>
      <Button
        variant="circle"
        size="circle"
        className="bg-row"
        onClick={() => set(Math.max(min, local - step))}
        disabled={disabled || local <= min}
        aria-label={`Decrease ${name}`}
      >
        <Minus strokeWidth={2.6} />
      </Button>
      <span className="min-w-11 text-center text-lg font-extrabold tabular-nums" aria-live="polite">
        {local}
        {unit}
      </span>
      <Button
        variant="circle"
        size="circle"
        className="bg-row"
        onClick={() => set(Math.min(max, local + step))}
        disabled={disabled || local >= max}
        aria-label={`Increase ${name}`}
      >
        <Plus strokeWidth={2.6} />
      </Button>
    </div>
  );
}

/** One setting: label and hint on the left, its control on the right. */
function SettingRow({
  label,
  hint,
  htmlFor,
  labelId,
  control,
  below,
}: {
  label: string;
  hint: string;
  /** Binds the label to a switch so the whole label toggles it. */
  htmlFor?: string;
  labelId?: string;
  control?: React.ReactNode;
  below?: React.ReactNode;
}) {
  const text = "text-[15px] font-bold";
  return (
    <div className="flex flex-col gap-2 py-2.5">
      <div className="flex min-h-11 items-center gap-2.5">
        <div className="min-w-0 flex-1">
          {htmlFor ? (
            <Label htmlFor={htmlFor} id={labelId} className={cn(text, "cursor-pointer")}>
              {label}
            </Label>
          ) : (
            <div id={labelId} className={text}>
              {label}
            </div>
          )}
          <div className="text-[13px] font-medium text-muted-foreground">{hint}</div>
        </div>
        {control}
      </div>
      {below}
    </div>
  );
}

const CARD = "rounded-[28px] bg-card";

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
    <div className="relative min-w-0 flex-1">
      <Input
        variant="pill"
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
        className="h-11 bg-row pr-10 pl-4 text-base"
      />
      <Pencil aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-3.5 -translate-y-1/2" />
    </div>
  );
}

function PlayerRow({
  name,
  side,
  sub,
  editor,
}: {
  name: string;
  side: "host" | "guest";
  sub: string;
  editor?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={name} side={side} size={44} />
      {editor ?? (
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold">{name}</div>
          <div className="text-[13px] font-semibold text-muted-foreground">{sub}</div>
        </div>
      )}
      <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[13px] font-extrabold text-primary-foreground">
        Ready
      </span>
    </div>
  );
}

export function Lobby({ ctx }: { ctx: GameCtx }) {
  const tieLabelId = React.useId();
  const ids = { slang: React.useId(), bonus: React.useId(), audio: React.useId() };
  // Host renders settings as editable controls and owns the Start button;
  // the guest sees the same cards read-only. Names come straight from
  // canonical ctx fields — the viewer-perspective flip on ctx.you/ctx.them
  // isn't useful here, where rows are labelled by role.
  const isHost = ctx.meIsHost;
  const readOnly = !isHost;
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
  const commit = React.useCallback(
    (patch: Partial<PersistedGameState["settings"]>) => {
      if (actions.ready) void actions.setSettings(patch);
    },
    [actions]
  );
  const commitTie = React.useCallback(
    (v: PersistedGameState["settings"]["tieBehavior"]) => commit({ tieBehavior: v }),
    [commit]
  );
  const commitProper = React.useCallback((v: boolean) => commit({ allowProperNouns: v }), [commit]);
  const commitAudio = React.useCallback((v: boolean) => commit({ audioDefinitions: v }), [commit]);
  const commitLengthBonus = React.useCallback((v: boolean) => commit({ lengthBonus: v }), [commit]);
  const [tieBehavior, setTieBehavior] = useOptimisticSetting(ctx.settings.tieBehavior, commitTie);
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

  const roomLink = () => `${window.location.origin}/r/${ctx.roomCode}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomLink());
      toast.success("Room link copied", { duration: 1500 });
    } catch {
      toast.error("Couldn't copy. Try the share sheet.");
    }
  };
  const share = async () => {
    if (typeof navigator.share !== "function") return ctx.openShare();
    try {
      await navigator.share({ title: "wordpinch", text: `Join my wordpinch room ${ctx.roomCode}`, url: roomLink() });
    } catch {
      // Dismissing the system sheet rejects; nothing to report.
    }
  };

  const canStart = isHost && ctx.guestPresent;
  const cta = !isHost ? `Waiting for ${hostName} to start…` : ctx.guestPresent ? "Start game" : "Waiting for a player…";
  const caption = !isHost
    ? "The host starts the match"
    : ctx.guestPresent
      ? "2 of 2 ready"
      : "1 of 2 ready · share the code";
  const other = isHost ? "your rival" : hostName;

  return (
    <div className="wp-body">
      <div className="wp-frame lg:max-w-[1040px]">
        <div className="grid grid-cols-1 gap-[22px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:[grid-template-areas:'room_rules''cta_rules']">
          <div className="flex min-w-0 flex-col gap-[18px] lg:[grid-area:room]">
            <div>
              <h1
                className="m-0 text-[56px] leading-none font-extrabold tracking-[3px] lg:text-[72px]"
                aria-label={`Room ${ctx.roomCode.split("").join(" ")}`}
              >
                {ctx.roomCode}
              </h1>
              <div className="font-hand text-[30px] leading-[1.1]">
                {isHost ? "send it to your rival" : `you're in ${hostName}'s room`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="pill" size="pill-md" onClick={copyLink}>
                Copy link
              </Button>
              <Button variant="circle" size="circle" aria-label="Show QR code" onClick={ctx.openShare}>
                <QrCode />
              </Button>
              <Button variant="circle" size="circle" aria-label="Share" onClick={share}>
                <Send />
              </Button>
            </div>

            <section aria-label="Players" className={cn(CARD, "flex flex-col gap-2.5 p-3.5")}>
              <PlayerRow
                name={hostName}
                side="host"
                sub="host"
                editor={
                  isHost ? <NameEditor key={hostName} initialName={hostName} onSave={handleRename} /> : undefined
                }
              />
              {ctx.guestPresent ? (
                <PlayerRow
                  name={guestName}
                  side="guest"
                  sub="joined"
                  editor={
                    isHost ? undefined : (
                      <NameEditor key={guestName} initialName={guestName} onSave={handleRename} />
                    )
                  }
                />
              ) : (
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground font-hand text-[22px] text-muted-foreground"
                  >
                    ?
                  </span>
                  <span className="font-hand text-2xl text-muted-foreground">waiting for a player…</span>
                </div>
              )}
              {needsName ? (
                <p className="m-0 px-1 text-[13px] font-semibold text-muted-foreground">
                  {`Add your name so ${other} knows who’s playing.`}
                </p>
              ) : null}
            </section>
          </div>

          <section aria-labelledby="house-rules" className="flex min-w-0 flex-col gap-3 lg:[grid-area:rules]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 id="house-rules" className="m-0 text-[22px] font-extrabold">
                House rules
              </h2>
              <span className="font-hand text-[22px]">
                {isHost ? "tap to change" : `only ${hostName} can change these`}
              </span>
            </div>

            <div className={cn(CARD, "px-3.5 py-1.5")}>
              <SettingRow
                label="Rounds"
                hint="1 to 15"
                control={
                  <Stepper
                    label="Rounds"
                    value={ctx.settings.rounds}
                    min={1}
                    max={15}
                    disabled={readOnly}
                    onChange={(n) => commit({ rounds: n })}
                  />
                }
              />
              <SettingRow
                label="Timer"
                hint="Seconds per race"
                control={
                  <Stepper
                    label="Timer"
                    value={ctx.settings.roundTimerSec}
                    min={5}
                    max={300}
                    step={5}
                    unit="s"
                    disabled={readOnly}
                    onChange={(n) => commit({ roundTimerSec: n })}
                  />
                }
              />
              <SettingRow
                label="Shortest word"
                hint="Letters at least"
                control={
                  <Stepper
                    label="Shortest word"
                    value={ctx.settings.minWordLength}
                    min={2}
                    max={10}
                    disabled={readOnly}
                    onChange={(n) => commit({ minWordLength: n })}
                  />
                }
              />
            </div>

            <div className={cn(CARD, "px-3.5 py-1.5")}>
              <SettingRow
                label="Tie behaviour"
                labelId={tieLabelId}
                hint={TIE_HINTS[tieBehavior]}
                below={
                  <ToggleGroup
                    variant="segment"
                    size="segment"
                    aria-labelledby={tieLabelId}
                    disabled={readOnly}
                    className="w-full"
                    value={[tieBehavior]}
                    onValueChange={(v) => {
                      const next = v[0];
                      if (next === "replay" || next === "split" || next === "nobody") setTieBehavior(next);
                    }}
                  >
                    <ToggleGroupItem value="replay">Replay</ToggleGroupItem>
                    <ToggleGroupItem value="split">Split</ToggleGroupItem>
                    <ToggleGroupItem value="nobody">Nobody</ToggleGroupItem>
                  </ToggleGroup>
                }
              />
              {/* With this off, validation requires the word to be in the
               *  ENABLE game lexicon, which rejects plenty of ordinary words
               *  ("tech") that have nothing to do with proper nouns. */}
              <SettingRow
                label="Slang & proper nouns"
                htmlFor={ids.slang}
                hint={
                  allowProperNouns
                    ? "Anything the dictionary or word list knows counts"
                    : "Strict: only words in the game word list"
                }
                control={
                  <Switch
                    id={ids.slang}
                    disabled={readOnly}
                    checked={allowProperNouns}
                    onCheckedChange={setAllowProperNouns}
                  />
                }
              />
              <SettingRow
                label="+0.5 per extra letter"
                htmlFor={ids.bonus}
                hint="Longer words than the minimum score more"
                control={
                  <Switch
                    id={ids.bonus}
                    disabled={readOnly}
                    checked={lengthBonus}
                    onCheckedChange={setLengthBonus}
                  />
                }
              />
            </div>

            <div className={cn(CARD, "px-3.5 py-1.5")}>
              <SettingRow
                label="Audio definitions"
                htmlFor={ids.audio}
                hint="Play the winning word out loud"
                control={
                  <Switch
                    id={ids.audio}
                    disabled={readOnly}
                    checked={audioDefinitions}
                    onCheckedChange={setAudioDefinitions}
                  />
                }
              />
            </div>
          </section>

          <div className="flex flex-col gap-2 lg:self-start lg:[grid-area:cta]">
            <Button
              variant="pill"
              size="pill-lg"
              className="h-auto min-h-[58px] w-full py-3 whitespace-normal"
              disabled={!canStart}
              onClick={() => {
                if (!isHost) return;
                if (ctx.actions.ready) {
                  void ctx.actions.startMatch();
                } else {
                  ctx.setPhase("pick");
                }
              }}
            >
              {cta}
            </Button>
            <div className="text-center text-sm font-semibold text-muted-foreground" aria-live="polite">
              {caption}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
