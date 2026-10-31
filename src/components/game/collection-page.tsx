"use client";

import * as React from "react";
import Link from "next/link";
import { Bookmark, ChevronLeft, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useStoredString } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { Shape } from "./kit/shape";
import { StatusPill } from "./kit/status-pill";

type Definition = { partOfSpeech: string; definition: string; example?: string };

export type CollectedWord = {
  word: string;
  definitions: Definition[];
  source: "won" | "saved";
  opponent: string | null;
  time_ms: number | null;
  /** F6: won in a daily pinch. */
  daily_number?: number | null;
  created_at: string;
};

type Filter = "all" | "won" | "saved";

/** "31.10." in the viewer's own time zone. */
function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function localDay(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Days in a row with at least one collected word, ending today, or
 * yesterday while today has none yet (a streak only breaks once a whole
 * day passes without a word). Counted in the viewer's time zone.
 */
export function dayStreak(words: Pick<CollectedWord, "created_at">[], now = new Date()): number {
  const days = new Set(words.map((w) => localDay(new Date(w.created_at))));
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(localDay(day))) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (days.has(localDay(day))) {
    streak += 1;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

function meta(w: CollectedWord) {
  const date = shortDate(w.created_at);
  if (w.source === "saved") return w.opponent ? `saved from ${w.opponent} · ${date}` : `saved · ${date}`;
  const where = w.daily_number ? `Daily pinch #${w.daily_number}` : w.opponent ? `vs ${w.opponent}` : null;
  return [where, w.time_ms !== null ? seconds(w.time_ms) : null, date]
    .filter(Boolean)
    .join(" · ");
}

function WordCard({ w }: { w: CollectedWord }) {
  const head = w.word.slice(0, 1);
  const middle = w.word.length > 2 ? w.word.slice(1, -1) : "";
  const tail = w.word.length > 1 ? w.word.slice(-1) : "";
  const definition = w.definitions[0]?.definition;
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-[24px] bg-card px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="min-w-0 text-[22px] font-extrabold tracking-[-0.3px] [overflow-wrap:anywhere]">
          <span className="text-anchor-first">{head}</span>
          {middle}
          {tail ? <span className="text-anchor-last">{tail}</span> : null}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-extrabold text-[#141414]",
            w.source === "won" ? "bg-shape-yellow" : "bg-shape-blue"
          )}
        >
          {w.source}
        </span>
      </div>
      <div className="truncate text-sm font-semibold" title={definition}>
        {definition ?? "No meaning saved for this one."}
      </div>
      <div className="truncate text-[13px] font-semibold text-muted-foreground" title={meta(w)}>
        {meta(w)}
      </div>
    </li>
  );
}

function Stat({ value, label, fill }: { value: string; label: string; fill: string }) {
  return (
    <div className={cn("min-w-0 rounded-[22px] p-3 text-[#141414]", fill)}>
      <div className="truncate text-[26px] leading-none font-extrabold tabular-nums">{value}</div>
      <div className="text-xs font-bold">{label}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[22px] py-6 text-center">
      <Shape kind="flower" size={170} fill="var(--shape-sage)">
        <Bookmark aria-hidden className="size-12" strokeWidth={2} />
      </Shape>
      <p className="m-0 max-w-[28ch] text-base leading-[1.45] font-semibold text-muted-foreground">
        Win a round, or tap the bookmark on any word, and it lands here with its meaning.
      </p>
      <Link href="/" className={cn(buttonVariants({ variant: "pill", size: "pill-lg" }), "px-8")}>
        Play a game
      </Link>
    </div>
  );
}

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; words: CollectedWord[] };

/**
 * F2 word collection: everything this account has won or bookmarked.
 * Reads GET /api/collection; it never signs anyone in, so a visitor who
 * hasn't played yet simply sees the empty state.
 */
export function CollectionPage() {
  const [name] = useStoredString("name");
  const displayName = name.trim() || "You";
  const [load, setLoad] = React.useState<Load>({ status: "loading" });
  const [filter, setFilter] = React.useState<Filter>("all");
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/collection", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ words?: CollectedWord[] }>) : Promise.reject(r.status)))
      .then((data) => {
        if (!cancelled) setLoad({ status: "ready", words: data.words ?? [] });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const words = load.status === "ready" ? load.words : [];
  const full = load.status === "ready" && words.length > 0;
  const shown = filter === "all" ? words : words.filter((w) => w.source === filter);
  const fastest = words.reduce<number | null>(
    (best, w) => (w.source === "won" && w.time_ms !== null && (best === null || w.time_ms < best) ? w.time_ms : best),
    null
  );
  const streak = dayStreak(words);

  const sub =
    load.status === "loading"
      ? "counting…"
      : full
        ? `${words.length} pinched so far`
        : load.status === "ready"
          ? "nothing pinched yet"
          : "";

  return (
    <div className="wp-root" data-phase="landing">
      <div className="wp-chrome items-center">
        <Link
          href="/"
          aria-label="Back to start"
          className={cn(buttonVariants({ variant: "pill-soft", size: "circle" }))}
        >
          <ChevronLeft aria-hidden />
        </Link>
        <div className="flex min-w-0 items-center gap-2 px-2">
          <Avatar name={displayName} size={32} />
          <span className="max-w-[180px] truncate text-[15px] font-bold" title={displayName}>
            {displayName}
          </span>
        </div>
        <div aria-hidden className="w-11 shrink-0" />
      </div>
      <div className="wp-body">
        <div className={cn("wp-frame gap-[18px] lg:max-w-[1040px]", full ? "!my-0" : "flex-1")}>
          <h1 className="m-0 text-[36px] leading-none font-extrabold lg:text-[48px]">
            Your words
            <br />
            <span className="font-hand text-[42px] font-normal lg:text-[54px]">{sub}</span>
          </h1>

          {load.status === "error" ? (
            <div className="flex flex-col items-start gap-3">
              <StatusPill tone="attention" role="alert" icon={<TriangleAlert />}>
                Couldn&apos;t load your words. Check your connection.
              </StatusPill>
              <Button variant="pill" size="pill-md" onClick={() => {
                setLoad({ status: "loading" });
                setAttempt((n) => n + 1);
              }}>
                Try again
              </Button>
            </div>
          ) : load.status === "ready" && !full ? (
            <EmptyState />
          ) : full ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat value={String(words.length)} label={words.length === 1 ? "word" : "words"} fill="bg-shape-yellow" />
                <Stat value={fastest !== null ? seconds(fastest) : "–"} label="fastest" fill="bg-shape-blue" />
                <Stat value={String(streak)} label="day streak" fill="bg-shape-sage" />
              </div>

              <ToggleGroup
                variant="segment"
                size="segment"
                aria-label="Filter words"
                className="w-full data-[variant=segment]:bg-card"
                value={[filter]}
                onValueChange={(v) => {
                  const next = v[0];
                  if (next === "all" || next === "won" || next === "saved") setFilter(next);
                }}
              >
                <ToggleGroupItem value="all">All</ToggleGroupItem>
                <ToggleGroupItem value="won">Won</ToggleGroupItem>
                <ToggleGroupItem value="saved">Saved</ToggleGroupItem>
              </ToggleGroup>

              {shown.length > 0 ? (
                <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 lg:grid-cols-3">
                  {shown.map((w) => (
                    <WordCard key={w.word} w={w} />
                  ))}
                </ul>
              ) : (
                <p role="status" className="m-0 text-[15px] font-semibold text-muted-foreground">
                  {filter === "saved"
                    ? "No saved words yet. Tap the bookmark on a round result to keep one."
                    : "No wins yet. Win a round and the word lands here."}
                </p>
              )}
            </>
          ) : (
            <div role="status" className="text-sm font-semibold text-muted-foreground">
              Loading your words
              <span aria-hidden className="typing-dots ml-1">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
