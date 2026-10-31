"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { useIsMounted, useStoredString } from "@/lib/hooks";
import { ensureIdentity } from "@/lib/identity";
import { FEATURES } from "@/lib/features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModeGrid, type Mode } from "./kit/mode-grid";
import { StatusPill } from "./kit/status-pill";

const CODE_REGEX = /^[A-HJ-NP-Z2-9]{4}$/;
// Hoisted to avoid re-creating per keystroke.
const NON_CODE_CHAR_REGEX = /[^A-HJ-NP-Z2-9]/g;
// Ambiguous glyphs the code alphabet deliberately omits. Typing one used to
// be silently swallowed, leaving Join disabled with no explanation.
const AMBIGUOUS_CHAR_REGEX = /[IO01]/;

/** Turns a `Retry-After` header (seconds) into "in 4 minutes" / "in 30 seconds". */
function formatRetryAfter(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "in a moment";
  if (seconds < 90) return `in ${seconds} seconds`;
  return `in ${Math.ceil(seconds / 60)} minutes`;
}

export function Landing() {
  const router = useRouter();
  const isMounted = useIsMounted();
  // The name is asked for in the lobby now; a name stored from an earlier
  // visit still goes along when creating a room.
  const [name] = useStoredString("name");
  const [code, setCode] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  // Two independent error slots. A single shared one meant a failed
  // "Create new room" rendered its message under the room-code field and
  // marked that input aria-invalid — pointing screen readers and eyes at
  // the wrong control.
  const [joinError, setJoinError] = React.useState<string | null>(null);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [codeNotice, setCodeNotice] = React.useState<string | null>(null);

  // Gate the `disabled` props on isMounted. On the server and during the
  // initial hydration render isMounted is false, so the rendered HTML
  // omits the disabled attribute entirely. After commit, isMounted flips
  // to true and React updates the DOM — without a hydration mismatch
  // warning. (base-ui's <Button> seems to render disabled={true} differently
  // SSR vs client, which we'd otherwise trip over.)
  const joinDisabled = isMounted && code.length !== 4;
  const createDisabled = isMounted && creating;

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!CODE_REGEX.test(trimmed)) {
      setJoinError("Room codes are 4 characters, letters and digits only.");
      return;
    }
    router.push(`/r/${trimmed}`);
  };

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    const trimmedName = name.trim().slice(0, 32);
    try {
      // The first room is where a visitor gets their anonymous account.
      const hostId = await ensureIdentity();
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostId: hostId || undefined,
          hostName: trimmedName || undefined,
        }),
      });
      const data = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !data.code) {
        if (res.status === 429) {
          const retry = Number.parseInt(res.headers.get("Retry-After") ?? "", 10);
          setCreateError(
            `Too many rooms from this network. Try again ${formatRetryAfter(
              Number.isFinite(retry) ? retry : null
            )}, or join a friend's room with their code.`
          );
        } else {
          setCreateError(
            data.error
              ? `Couldn't create a room: ${data.error}`
              : "Couldn't create a room. Try again."
          );
        }
        setCreating(false);
        return;
      }
      router.push(`/r/${data.code}`);
    } catch (err) {
      console.error("[Landing] create error", err);
      setCreateError("Network error. Check your connection and try again.");
      setCreating(false);
    }
  };

  const modes: Mode[] = [
    {
      id: "friend",
      kind: "square",
      fill: "var(--shape-yellow)",
      title: creating ? "Creating\nroom…" : "Play a\nfriend",
      sub: creating ? "one sec" : "new room",
      onSelect: createDisabled ? undefined : handleCreate,
      busy: creating,
    },
    ...(FEATURES.dailyPinch
      ? [
          {
            id: "daily",
            kind: "star" as const,
            fill: "var(--shape-pink)",
            title: "Daily\npinch",
            // The artboard showed today's letters here; they stay hidden
            // until the player starts (the clock starts with them).
            sub: "one try a day",
            onSelect: () => router.push("/daily"),
          },
        ]
      : []),
    ...(FEATURES.quickMatch
      ? [{ id: "quick", kind: "circle" as const, fill: "var(--shape-blue)", title: "Quick\nmatch", sub: "find a rival" }]
      : []),
    ...(FEATURES.passThePhone
      ? [{ id: "pass", kind: "flower" as const, fill: "var(--shape-sage)", title: "Pass the\nphone", sub: "one device" }]
      : []),
  ];

  const joinMessage = joinError ?? codeNotice ?? "4 characters · no I, O, 0 or 1";

  return (
    <div className="wp-body">
      <div className="wp-frame lg:max-w-[1040px]">
        <div className="grid grid-cols-1 items-center gap-7 lg:grid-cols-2 lg:gap-x-14 lg:[grid-template-areas:'head_modes''join_modes']">
          <h1 className="m-0 text-[42px] leading-[0.98] font-extrabold tracking-[-0.03em] md:text-[56px] lg:text-[64px] lg:[grid-area:head]">
            Two letters,
            <br />
            <span className="font-hand text-[46px] font-normal tracking-normal md:text-[60px] lg:text-[70px]">
              one scribbled word,
            </span>
            {/* Phones wrap after "scribbled", so "word, go!" share a line. */}
            <br className="hidden lg:block" /> go!
          </h1>

          <div className="flex flex-col gap-3 lg:[grid-area:modes]">
            <div className="lg:hidden">
              <ModeGrid modes={modes} size={160} busy={creating} data-landing="modes" />
            </div>
            <div className="hidden lg:block">
              <ModeGrid modes={modes} size={200} busy={creating} data-landing="modes" />
            </div>
            {createError ? (
              <StatusPill tone="attention" role="alert" icon={<TriangleAlert />}>
                {createError}
              </StatusPill>
            ) : null}
          </div>

          <form onSubmit={handleJoin} className="flex w-full max-w-[480px] flex-col gap-2 lg:self-start lg:[grid-area:join]">
            <Label htmlFor="room" className="text-sm font-bold">
              Got a code from a friend?
            </Label>
            <div className="flex gap-2">
              <Input
                id="room"
                variant="pill"
                className="flex-1 text-xl tracking-[6px] uppercase placeholder:tracking-[6px]"
                placeholder="CODE"
                autoComplete="off"
                autoCapitalize="characters"
                value={code}
                maxLength={4}
                onChange={(e) => {
                  const raw = e.target.value.toUpperCase();
                  const cleaned = raw.replace(NON_CODE_CHAR_REGEX, "");
                  setCode(cleaned);
                  // Tell the user why a character vanished instead of just
                  // eating it — I/O/0/1 are excluded from the alphabet so
                  // codes can be read aloud without ambiguity. The notice
                  // sticks until the field is cleared: it's the *next*
                  // keystroke that most needs the explanation still on
                  // screen.
                  if (AMBIGUOUS_CHAR_REGEX.test(raw)) {
                    setCodeNotice("Room codes never use I, O, 0 or 1. Check the code again.");
                  } else if (cleaned.length === 0) {
                    setCodeNotice(null);
                  }
                  if (joinError) setJoinError(null);
                }}
                aria-describedby="room-message"
                aria-invalid={joinError ? true : undefined}
              />
              <Button type="submit" variant="pill" size="pill-md" className="h-13 px-6" disabled={joinDisabled}>
                Join
              </Button>
            </div>
            <div
              id="room-message"
              role={joinError ? "alert" : codeNotice ? "status" : undefined}
              className={`px-5 text-sm font-bold ${joinError ? "text-attention" : codeNotice ? "text-foreground" : "text-muted-foreground"}`}
            >
              {joinMessage}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
