"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStoredString } from "@/lib/hooks";
import { lockedWordInput } from "@/lib/game/word-input";
import { cn } from "@/lib/utils";
import { AnchoredWord } from "./kit/anchored-word";
import { LetterSlots } from "./kit/letter-slots";
import { Shape } from "./kit/shape";
import { StatusPill } from "./kit/status-pill";
import { Avatar } from "./avatar";

/**
 * F8 pass the phone (`/pass`): two players, one device, no room and no
 * realtime. Each round both race the same letters alone, one after the
 * other, while the other looks away; the faster valid word takes the round
 * (decision 3). Times stay hidden until both have played. Words are checked
 * by /api/words/validate; letters come from /api/words/pair.
 */

const ROUNDS = 5;
const TURN_SEC = 30;
const MIN_LENGTH = 4;
const SEATS = [0, 1] as const;
type Seat = (typeof SEATS)[number];
const SIDE = ["host", "guest"] as const;

type Play = { word: string | null; ms: number | null };
type Round = { start: string; end: string; first: Seat; plays: [Play | null, Play | null] };

type Stage =
  | { kind: "setup" }
  | { kind: "handoff"; seat: Seat }
  | { kind: "turn"; seat: Seat; startedAt: number }
  | { kind: "result" }
  | { kind: "end" };

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
/** Sentences use only the first name (stress rules, 02-design-progress). */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Who took the round: 0, 1, "both" (equal times) or null (nobody). Times
 * compare at the precision shown (tenths): two "4.0 s" are a tie, not a
 * win decided by milliseconds nobody can see.
 */
export function roundWinner(plays: [Play | null, Play | null]): Seat | "both" | null {
  const t = plays.map((p) => (p?.word && p.ms !== null ? Math.round(p.ms / 100) : null));
  if (t[0] === null && t[1] === null) return null;
  if (t[1] === null) return 0;
  if (t[0] === null) return 1;
  if (t[0] === t[1]) return "both";
  return t[0]! < t[1]! ? 0 : 1;
}

function scoreOf(rounds: Round[]): [number, number] {
  const s: [number, number] = [0, 0];
  for (const r of rounds) {
    const w = roundWinner(r.plays);
    if (w === "both") {
      s[0] += 1;
      s[1] += 1;
    } else if (w !== null) s[w] += 1;
  }
  return s;
}

export function PassPage() {
  const [stored] = useStoredString("name");
  const [names, setNames] = React.useState<[string, string]>(["", ""]);
  const [stage, setStage] = React.useState<Stage>({ kind: "setup" });
  const [rounds, setRounds] = React.useState<Round[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const name = (seat: Seat) => names[seat].trim() || (seat === 0 ? stored.trim() || "Player 1" : "Player 2");
  const current = rounds[rounds.length - 1];
  const score = scoreOf(rounds.filter((r) => r.plays[0] && r.plays[1]));

  const newRound = async (played: Round[]) => {
    try {
      const not = played.map((r) => r.start + r.end).join(",");
      const res = await fetch(`/api/words/pair?min=${MIN_LENGTH}&not=${not}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const { start, end } = (await res.json()) as { start: string; end: string };
      // The player who goes first alternates.
      const first = (played.length % 2) as Seat;
      setRounds([...played, { start, end, first, plays: [null, null] }]);
      setStage({ kind: "handoff", seat: first });
      setError(null);
    } catch {
      setError("Couldn't get the next letters. Check your connection.");
    }
  };

  const finishTurn = (seat: Seat, play: Play) => {
    const r = current;
    const plays: [Play | null, Play | null] = [...r.plays] as [Play | null, Play | null];
    plays[seat] = play;
    const next = [...rounds.slice(0, -1), { ...r, plays }];
    setRounds(next);
    const other = (1 - seat) as Seat;
    setStage(plays[other] ? { kind: "result" } : { kind: "handoff", seat: other });
  };

  const top =
    stage.kind === "setup"
      ? "Pass the phone"
      : stage.kind === "end"
        ? `Match over · ${ROUNDS} rounds`
        : `Round ${rounds.length} of ${ROUNDS} · ${name(0)} ${score[0]} · ${score[1]} ${name(1)}`;

  return (
    <div className="wp-root" data-phase="pass">
      <div className="wp-chrome items-center">
        <Link href="/" aria-label="Back to start" className={cn(buttonVariants({ variant: "pill-soft", size: "circle" }))}>
          <ChevronLeft aria-hidden />
        </Link>
        <div className="min-w-0 truncate px-3 text-[15px] font-bold">{top}</div>
        <div aria-hidden className="w-11 shrink-0" />
      </div>
      <div className="wp-body">
        {/* Top-aligned while typing, like the race: on a phone the
         *  keyboard takes the bottom ~291px. */}
        <div className={cn("wp-frame gap-[18px] lg:max-w-[560px]", stage.kind === "turn" && "mt-0 mb-auto lg:my-auto")}>
          {error ? (
            <div className="flex flex-col items-start gap-3">
              <StatusPill tone="attention" role="alert" icon={<TriangleAlert />}>
                {error}
              </StatusPill>
              <Button variant="pill" size="pill-md" onClick={() => void newRound(rounds.filter((r) => r.plays[0] && r.plays[1]))}>
                Try again
              </Button>
            </div>
          ) : stage.kind === "setup" ? (
            <Setup names={names} setNames={setNames} placeholder={[stored.trim() || "Player 1", "Player 2"]} onStart={() => void newRound([])} />
          ) : stage.kind === "handoff" ? (
            <Handoff
              to={firstName(name(stage.seat))}
              from={firstName(name((1 - stage.seat) as Seat))}
              otherPlayed={!!current.plays[(1 - stage.seat) as Seat]}
              seat={stage.seat}
              onReady={() => setStage({ kind: "turn", seat: stage.seat, startedAt: Date.now() })}
            />
          ) : stage.kind === "turn" ? (
            <Turn
              key={`${rounds.length}-${stage.seat}`}
              round={current}
              seat={stage.seat}
              me={name(stage.seat)}
              other={name((1 - stage.seat) as Seat)}
              startedAt={stage.startedAt}
              onDone={(p) => finishTurn(stage.seat, p)}
            />
          ) : stage.kind === "result" ? (
            <RoundResult
              round={current}
              number={rounds.length}
              names={[name(0), name(1)]}
              score={score}
              last={rounds.length >= ROUNDS}
              onNext={() => (rounds.length >= ROUNDS ? setStage({ kind: "end" }) : void newRound(rounds))}
            />
          ) : (
            <MatchEnd
              rounds={rounds}
              names={[name(0), name(1)]}
              score={score}
              onAgain={() => {
                setRounds([]);
                void newRound([]);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Setup({
  names,
  setNames,
  placeholder,
  onStart,
}: {
  names: [string, string];
  setNames: (n: [string, string]) => void;
  placeholder: [string, string];
  onStart: () => void;
}) {
  return (
    <>
      <h1 className="m-0 text-[36px] leading-none font-extrabold">
        Pass the phone
        <br />
        <span className="font-hand text-[42px] font-normal">one device, two rivals</span>
      </h1>
      <div className="flex flex-col gap-2.5 rounded-[28px] bg-card p-3.5">
        {SEATS.map((seat) => (
          <div key={seat} className="flex items-center gap-2.5">
            <Avatar name={names[seat] || placeholder[seat]} size={44} side={SIDE[seat]} />
            <Input
              variant="pill"
              aria-label={`Player ${seat + 1} name`}
              placeholder={placeholder[seat]}
              maxLength={32}
              value={names[seat]}
              onChange={(e) => setNames(seat === 0 ? [e.target.value, names[1]] : [names[0], e.target.value])}
              className="h-[52px] min-w-0 flex-1 bg-row text-[17px] font-bold"
            />
          </div>
        ))}
      </div>
      <div className="rounded-[26px] bg-card px-4 py-3.5 text-[15px] leading-[1.45] font-semibold">
        <div className="mb-1 text-[17px] font-bold">How it works</div>
        You take turns. Each of you races the clock alone while the other looks away. Fastest valid word takes the round.
      </div>
      <Button variant="pill" size="pill-lg" className="w-full" onClick={onStart}>
        {`Start · ${ROUNDS} rounds`}
      </Button>
    </>
  );
}

function Handoff({
  to,
  from,
  otherPlayed,
  seat,
  onReady,
}: {
  to: string;
  from: string;
  otherPlayed: boolean;
  seat: Seat;
  onReady: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <div>
        <h1 className="m-0 text-[38px] leading-none font-extrabold [overflow-wrap:anywhere]">
          Hand the phone
          <br />
          {`to ${to}`}
        </h1>
        <div className="mt-1.5 font-hand text-[34px] [overflow-wrap:anywhere]">{`no peeking, ${from}!`}</div>
      </div>
      <Button
        variant="ghost"
        className="size-[220px] rounded-full p-0 hover:bg-transparent"
        aria-label={`I'm ${to}, tap when ready`}
        data-handoff={SIDE[seat]}
        onClick={onReady}
      >
        <Shape kind="flower" size={220} fill="var(--shape-yellow)">
          <span className="block max-w-[120px] truncate text-[22px] leading-[1.05] font-extrabold text-[#141414]">{`I'm ${to}`}</span>
          <span className="block text-[13px] font-bold text-[#141414]">tap when ready</span>
        </Shape>
      </Button>
      <p className="m-0 max-w-[32ch] text-sm font-semibold text-muted-foreground">
        {otherPlayed
          ? `${from}'s word and time stay hidden until you've played too.`
          : `The letters show when you tap. ${from} plays the same ones next.`}
      </p>
    </div>
  );
}

function Turn({
  round,
  seat,
  me,
  other,
  startedAt,
  onDone,
}: {
  round: Round;
  seat: Seat;
  me: string;
  other: string;
  startedAt: number;
  onDone: (p: Play) => void;
}) {
  const A = round.start;
  const [val, setVal] = React.useState(A);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  const inputRef = React.useRef<HTMLInputElement>(null);
  const caretRef = React.useRef<number | null>(null);
  const doneRef = React.useRef(false);
  const left = Math.max(0, TURN_SEC - Math.floor((now - startedAt) / 1000));

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
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
  // Out of time: no word this turn.
  React.useEffect(() => {
    if (left > 0 || doneRef.current) return;
    doneRef.current = true;
    onDone({ word: null, ms: null });
  }, [left, onDone]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || doneRef.current) return;
    const at = Date.now();
    const word = val.toLowerCase();
    if (word.length < MIN_LENGTH) return setMessage(`Too short, needs at least ${MIN_LENGTH} letters.`);
    if (!word.endsWith(round.end.toLowerCase())) return setMessage(`Has to end with ${round.end}.`);
    setBusy(true);
    try {
      const res = await fetch("/api/words/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, allowProperNouns: false }),
      });
      const r = (await res.json()) as { valid?: boolean };
      if (!res.ok) throw new Error(String(res.status));
      if (!r.valid) {
        setMessage("Not in our word list. Try another one.");
        return;
      }
      if (doneRef.current) return;
      doneRef.current = true;
      // The time counts to the press, not to the check coming back.
      onDone({ word, ms: at - startedAt });
    } catch {
      setMessage("Connection problem, your word wasn't checked. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const otherPlay = round.plays[(1 - seat) as Seat];
  return (
    <>
      <div className="flex min-w-0 items-center gap-3 rounded-full bg-card py-2 pr-4 pl-2">
        <Avatar name={me} size={36} side={SIDE[seat]} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{`${me}'s turn`}</span>
        <span className="shrink-0 text-[13px] font-bold text-muted-foreground">
          {otherPlay ? `${other} played · time hidden` : `${other} plays next`}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2.5">
        <LetterSlots first={round.start} last={round.end} size={84} className="justify-start gap-2" />
        <div
          role="timer"
          aria-label={`${left} seconds left`}
          className={cn(
            "flex size-16 shrink-0 items-center justify-center rounded-full text-2xl font-extrabold tabular-nums",
            left <= 5 ? "bg-shape-magenta text-white" : "bg-shape-yellow text-[#141414]"
          )}
        >
          {left}
        </div>
      </div>
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
            aria-label={`Your word, starting with ${A} and ending with ${round.end}`}
            aria-describedby="pass-message"
            aria-invalid={message ? true : undefined}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
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
          id="pass-message"
          role="status"
          className={cn("min-h-[22px] px-[22px] text-sm font-bold", message ? "text-attention" : "text-muted-foreground")}
        >
          {message ?? (busy ? "Checking your word…" : `min ${MIN_LENGTH} letters · Enter to submit`)}
        </div>
      </form>
    </>
  );
}

function PlayCard({ name, seat, play, won }: { name: string; seat: Seat; play: Play | null; won: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-[26px] px-3.5 py-4", won ? "bg-card" : "bg-card/45")}>
      <div className="flex min-w-0 items-center gap-2">
        <Avatar name={name} size={30} side={SIDE[seat]} />
        <span className="truncate text-sm font-bold" title={name}>
          {name}
        </span>
      </div>
      {play?.word ? (
        <AnchoredWord word={play.word} className="!text-[30px]" />
      ) : (
        <span className="font-hand text-[26px] leading-tight">out of time</span>
      )}
      <div className="text-[13px] font-semibold text-muted-foreground">
        {[play?.ms != null ? seconds(play.ms) : null, won ? "winner" : null].filter(Boolean).join(" · ") || "no word"}
      </div>
    </div>
  );
}

function RoundResult({
  round,
  number,
  names,
  score,
  last,
  onNext,
}: {
  round: Round;
  number: number;
  names: [string, string];
  score: [number, number];
  last: boolean;
  onNext: () => void;
}) {
  const w = roundWinner(round.plays);
  const title =
    w === null
      ? `Round ${number}: nobody found one`
      : w === "both"
        ? `Tied round ${number}: both score`
        : `${names[w]} took round ${number}`;
  return (
    <>
      <div className="self-start rounded-full bg-card px-3.5 py-2 text-sm font-bold [overflow-wrap:anywhere]">{title}</div>
      <LetterSlots first={round.start} last={round.end} size={84} className="justify-start gap-2" />
      <div className="grid grid-cols-2 gap-2.5">
        {SEATS.map((seat) => (
          <PlayCard key={seat} name={names[seat]} seat={seat} play={round.plays[seat]} won={w === seat || w === "both"} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {SEATS.map((seat) => (
          <div key={seat} className={cn("min-w-0 rounded-[26px] px-4 py-3.5 text-[#141414]", seat === 0 ? "bg-shape-yellow" : "bg-shape-pink")}>
            <div className="truncate text-sm font-bold">{names[seat]}</div>
            <div className="text-[40px] leading-none font-extrabold tabular-nums">{score[seat]}</div>
          </div>
        ))}
      </div>
      <Button variant="pill" size="pill-lg" className="w-full" onClick={onNext}>
        {last ? "See who won" : "Next round"} <ArrowRight />
      </Button>
    </>
  );
}

function MatchEnd({
  rounds,
  names,
  score,
  onAgain,
}: {
  rounds: Round[];
  names: [string, string];
  score: [number, number];
  onAgain: () => void;
}) {
  const tie = score[0] === score[1];
  const winner = score[0] > score[1] ? 0 : 1;
  return (
    <>
      <h1 className="m-0 text-[44px] leading-[0.98] font-extrabold tracking-[-1.5px] [overflow-wrap:anywhere]">
        {tie ? "Dead heat!" : names[winner]}
        <br />
        <span className="font-hand text-[50px] font-normal tracking-normal">{tie ? "nobody blinks" : "pinched it!"}</span>
      </h1>
      <div className="flex flex-wrap items-center gap-3">
        {(tie || winner === 0 ? SEATS : ([1, 0] as Seat[])).map((seat, i) => (
          <span
            key={seat}
            className={cn(
              "max-w-full truncate rounded-full px-[18px] py-2 text-[28px] font-extrabold",
              i === 0 || tie ? "bg-shape-yellow text-[#141414]" : "bg-card"
            )}
          >
            {`${names[seat]} ${score[seat]}`}
          </span>
        ))}
      </div>
      <div className="flex flex-col rounded-[26px] bg-card px-4 py-2">
      <div aria-hidden className="grid min-h-[40px] grid-cols-[20px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2.5 text-sm">
        <span className="font-extrabold text-muted-foreground">#</span>
        {SEATS.map((seat) => (
          <span key={seat} className="flex min-w-0 items-center gap-2 font-bold">
            <Avatar name={names[seat]} size={24} side={SIDE[seat]} />
            <span className="truncate" title={names[seat]}>
              {names[seat]}
            </span>
          </span>
        ))}
      </div>
      <ol className="m-0 flex list-none flex-col p-0" aria-label="Rounds">
        {rounds.map((r, i) => {
          const w = roundWinner(r.plays);
          return (
            <li key={i} className="grid min-h-[40px] grid-cols-[20px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2.5 text-sm">
              <span className="font-extrabold text-muted-foreground">{i + 1}</span>
              {SEATS.map((seat) => {
                const p = r.plays[seat];
                return (
                  <span key={seat} className={cn("min-w-0 truncate font-bold", !(w === seat || w === "both") && "text-muted-foreground")}>
                    {p?.word ? `${p.word.toUpperCase()} ${seconds(p.ms!)}` : "out of time"}
                  </span>
                );
              })}
            </li>
          );
        })}
      </ol>
      </div>
      <div className="flex flex-col gap-1">
        <Button variant="pill" size="pill-lg" className="w-full" onClick={onAgain}>
          Play again
        </Button>
        <Link href="/" className="flex h-11 items-center self-center px-3 text-[15px] font-bold underline underline-offset-4">
          Back to start
        </Link>
      </div>
    </>
  );
}
