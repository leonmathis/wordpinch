"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, ChevronLeft, Flame, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureIdentity } from "@/lib/identity";
import { useStoredString } from "@/lib/hooks";
import { lockedWordInput } from "@/lib/game/word-input";
import type { DailyStatus } from "@/lib/daily";
import { cn } from "@/lib/utils";
import { AnchoredWord } from "./kit/anchored-word";
import { LetterSlots } from "./kit/letter-slots";
import { StatusPill } from "./kit/status-pill";

const ShareResultDialog = dynamic(
  () => import("./share-result-dialog").then((m) => ({ default: m.ShareResultDialog })),
  { ssr: false }
);

const REJECT: Record<string, (s: NonNullable<DailyStatus["letters"]>) => string> = {
  too_short: (l) => `Too short, needs at least ${l.minLength} letters.`,
  wrong_start: (l) => `Has to start with ${l.start}.`,
  wrong_end: (l) => `Has to end with ${l.end}.`,
  not_a_word: () => "Not in our word list. Try another one.",
};

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
};
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Re-renders every `ms` while `on`, for clocks. */
function useNow(on: boolean, ms = 250) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [on, ms]);
  return now;
}

type Load = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; s: DailyStatus };

/**
 * F6 daily pinch (`/daily`): same two letters for everyone each UTC day,
 * one try. The letters stay hidden until the player starts: a 3·2·1, then
 * the server reveals them and starts the clock (decision 1). The result
 * shows the time, how it compares, today's fastest three and the share card.
 */
export function DailyPage() {
  const [name] = useStoredString("name");
  const [load, setLoad] = React.useState<Load>({ kind: "loading" });
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/daily", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<DailyStatus>) : Promise.reject(r.status)))
      .then((s) => !cancelled && setLoad({ kind: "ready", s }))
      .catch(() => !cancelled && setLoad({ kind: "error", message: "Couldn't load today's pinch. Check your connection." }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const start = async () => {
    // 3 · 2 · 1, then the server hands out the letters and starts the clock.
    for (const n of [3, 2, 1]) {
      setCountdown(n);
      await new Promise((r) => setTimeout(r, 700));
    }
    try {
      await ensureIdentity();
      const res = await fetch("/api/daily/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) {
        setLoad({ kind: "error", message: "The daily pinch needs a player account, and that couldn't be set up right now." });
      } else if (!res.ok) {
        setLoad({ kind: "error", message: "Couldn't start today's pinch. Try again." });
      } else {
        setLoad({ kind: "ready", s: (await res.json()) as DailyStatus });
      }
    } catch {
      setLoad({ kind: "error", message: "Couldn't start today's pinch. Check your connection." });
    }
    setCountdown(null);
  };

  const s = load.kind === "ready" ? load.s : null;

  return (
    <div className="wp-root" data-phase="daily">
      <div className="wp-chrome items-center">
        <Link href="/" aria-label="Back to start" className={cn(buttonVariants({ variant: "pill-soft", size: "circle" }))}>
          <ChevronLeft aria-hidden />
        </Link>
        <div className="text-[15px] font-bold">{s ? `Daily pinch #${s.number}` : "Daily pinch"}</div>
        <div
          aria-label={s ? `${s.streak}-day streak` : "Streak"}
          role="img"
          className="flex h-11 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-extrabold"
        >
          <Flame aria-hidden className="size-4" strokeWidth={2.2} />
          {s ? s.streak : "–"}
        </div>
      </div>
      <div className="wp-body">
        <div className="wp-frame !mt-0 mb-auto gap-[18px] lg:max-w-[560px]">
          {load.kind === "error" ? (
            <div className="flex flex-col items-start gap-3">
              <StatusPill tone="attention" role="alert" icon={<TriangleAlert />}>
                {load.message}
              </StatusPill>
              <Button variant="pill" size="pill-md" onClick={() => {
                setLoad({ kind: "loading" });
                setAttempt((n) => n + 1);
              }}>
                Try again
              </Button>
            </div>
          ) : countdown !== null ? (
            <Countdown n={countdown} />
          ) : !s ? (
            <div role="status" className="py-10 text-center text-sm font-semibold text-muted-foreground">
              Loading today&apos;s pinch…
            </div>
          ) : s.state === "new" ? (
            <Intro onStart={() => void start()} />
          ) : s.state === "playing" ? (
            <Play s={s} onDone={(next) => setLoad({ kind: "ready", s: next })} />
          ) : (
            <Done s={s} />
          )}
        </div>
      </div>
    </div>
  );
}

function Letters({ s }: { s?: DailyStatus }) {
  return (
    <LetterSlots
      first={s?.letters?.start ?? null}
      last={s?.letters?.end ?? null}
      size={84}
      firstFill="var(--shape-blue)"
      lastFill="var(--shape-yellow)"
      className="pt-1.5"
    />
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <>
      <Letters />
      <div className="text-center">
        <h1 className="m-0 text-[30px] leading-[1.05] font-extrabold">
          Same letters
          <br />
          <span className="font-hand text-4xl font-normal">for everyone today</span>
        </h1>
        <p className="mx-auto mt-2 max-w-[32ch] text-[15px] font-semibold text-muted-foreground">
          One try. The clock starts with the letters, so they stay hidden until you&apos;re ready.
        </p>
      </div>
      <Button variant="pill" size="pill-lg" className="w-full" onClick={onStart}>
        I&apos;m ready <ArrowRight />
      </Button>
    </>
  );
}

function Countdown({ n }: { n: number }) {
  return (
    <div role="status" aria-label={`Starting in ${n}`} className="flex flex-col items-center gap-3 py-10">
      <span key={n} className="slide-up-in font-hand text-[120px] leading-none">
        {n}
      </span>
      <span className="text-[15px] font-semibold text-muted-foreground">letters coming up</span>
    </div>
  );
}

function Play({ s, onDone }: { s: DailyStatus; onDone: (s: DailyStatus) => void }) {
  const letters = s.letters!;
  const A = letters.start;
  const [val, setVal] = React.useState(A);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const caretRef = React.useRef<number | null>(null);
  const now = useNow(true);

  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  React.useLayoutEffect(() => {
    const at = caretRef.current;
    if (at === null || !inputRef.current) return;
    caretRef.current = null;
    inputRef.current.setSelectionRange(at, at);
  }, [val]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/daily/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: val }),
      });
      const body = (await res.json().catch(() => ({}))) as { status?: DailyStatus; error?: string };
      if (res.ok && body.status) onDone(body.status);
      else setMessage(REJECT[body.error ?? ""]?.(letters) ?? "Couldn't check that word. Try again.");
    } catch {
      setMessage("Connection problem, your word wasn't checked. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Compact while typing: on a phone the keyboard takes the bottom ~291px,
  // and the word field has to stay above it (the headline moved it under).
  return (
    <>
      <h1 className="sr-only">Daily pinch: find a word</h1>
      <div className="flex items-center justify-between gap-2.5">
        <LetterSlots
          first={letters.start}
          last={letters.end}
          size={84}
          firstFill="var(--shape-blue)"
          lastFill="var(--shape-yellow)"
          className="justify-start gap-2"
        />
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div
            role="timer"
            aria-label={`${Math.floor((now - s.startedAt!) / 1000)} seconds`}
            className="flex h-11 items-center rounded-full bg-card px-[18px] text-lg font-extrabold tabular-nums"
          >
            {clock(now - s.startedAt!)}
          </div>
          <span className="text-xs font-bold text-muted-foreground">counting up</span>
        </div>
      </div>
      <p className="m-0 text-[15px] font-semibold text-muted-foreground">One try. The clock started with the letters.</p>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="flex gap-2.5">
          <Input
            ref={inputRef}
            variant="pill"
            value={val}
            onChange={(e) => {
              const { value, caret } = lockedWordInput(e.target.value, val, A);
              if (caret !== null) caretRef.current = caret;
              setVal(value);
              if (message) setMessage(null);
            }}
            readOnly={busy}
            aria-label={`Your word, starting with ${A} and ending with ${letters.end}`}
            aria-describedby="daily-message"
            aria-invalid={message ? true : undefined}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder={`${A}${"_".repeat(Math.max(0, letters.minLength - 2))}${letters.end}`}
            className="h-[58px] min-w-0 flex-1 px-[22px] text-2xl font-extrabold tracking-[1px]"
          />
          <Button
            type="submit"
            variant="pill"
            className="size-[58px] shrink-0 p-0 [&_svg:not([class*='size-'])]:size-[22px]"
            disabled={busy}
            aria-label={busy ? "Checking your word" : "Submit word"}
          >
            <ArrowRight strokeWidth={2.4} />
          </Button>
        </div>
        <div
          id="daily-message"
          role="status"
          className={cn("min-h-[22px] px-[22px] text-sm font-bold", message ? "text-attention" : "text-muted-foreground")}
        >
          {message ?? (busy ? "Checking your word…" : `min ${letters.minLength} letters · Enter to submit`)}
        </div>
      </form>
    </>
  );
}

function Done({ s }: { s: DailyStatus }) {
  const r = s.result!;
  const now = useNow(true, 1000);
  const [sharing, setSharing] = React.useState(false);
  return (
    <>
      <Letters s={s} />
      <div className="text-center">
        <h1 className="m-0" aria-label={r.word}>
          <AnchoredWord word={r.word} className="!text-[52px]" />
        </h1>
        <div className="mt-1 text-base font-bold text-muted-foreground">{`${seconds(r.timeMs)} · ${r.word.length} letters`}</div>
      </div>
      <div className="flex items-center gap-3.5 rounded-[26px] bg-card px-4 py-3.5">
        {r.players > 1 ? (
          <>
            <div className="text-[34px] leading-none font-extrabold tabular-nums">{`${r.fasterThan}%`}</div>
            <div className="text-[15px] leading-[1.3] font-semibold">
              {`faster than ${r.fasterThan}% of the ${r.players.toLocaleString("en")} people who played today`}
            </div>
          </>
        ) : (
          <div className="text-[15px] leading-[1.3] font-semibold">You&apos;re the first one today. Others will measure up to you.</div>
        )}
      </div>
      <section aria-labelledby="daily-board" className="rounded-[26px] bg-card px-4 py-2.5">
        <h2 id="daily-board" className="m-0 pt-1 pb-1.5 text-base font-bold">
          Today&apos;s fastest
        </h2>
        <ol className="m-0 list-none p-0">
          {r.board.map((b) => (
            <li key={b.rank} className="grid min-h-[34px] grid-cols-[22px_minmax(0,1fr)_auto_auto] items-baseline gap-2.5 text-[15px]">
              <span className="font-extrabold text-muted-foreground">{b.rank}</span>
              <span className="truncate font-bold" title={b.name}>
                {b.name}
              </span>
              <span className="font-extrabold uppercase">{b.word}</span>
              <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">{seconds(b.timeMs)}</span>
            </li>
          ))}
        </ol>
      </section>
      <div className="flex flex-col gap-2.5">
        <Button variant="pill" size="pill-lg" className="w-full" onClick={() => setSharing(true)}>
          Share my pinch
        </Button>
        <div className="text-center font-hand text-[22px]" role="timer" aria-label="Time until the next daily pinch">
          {`next pinch in ${hms(s.nextAt - now)}`}
        </div>
      </div>
      {sharing ? (
        <ShareResultDialog
          open={sharing}
          onOpenChange={setSharing}
          title="Share your pinch"
          card="/api/daily/card"
          filename={`wordpinch-daily-${s.number}.png`}
          link={`${window.location.origin}/daily`}
          alt={`Share card: Daily pinch ${s.number}, ${s.letters!.start} to ${s.letters!.end}, ${seconds(r.timeMs).replace(" s", " seconds")}, ${s.streak}-day streak`}
        />
      ) : null}
    </>
  );
}
