"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useClientId, useIsMounted, useStoredString } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

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
  const clientId = useClientId();
  const isMounted = useIsMounted();
  // Name is sourced directly from localStorage via useStoredString — no local
  // copy, no sync effect, so cross-tab edits show up immediately.
  const [name, setName] = useStoredString("name");
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
  const createDisabled = isMounted && (!clientId || creating);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!CODE_REGEX.test(trimmed)) {
      setJoinError("Room codes are 4 characters — letters and digits only.");
      return;
    }
    router.push(`/r/${trimmed}`);
  };

  const handleCreate = async () => {
    if (!clientId || creating) return;
    setCreating(true);
    setCreateError(null);
    const trimmedName = name.trim().slice(0, 32);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostId: clientId,
          hostName: trimmedName || undefined,
        }),
      });
      const data = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !data.code) {
        if (res.status === 429) {
          const retry = Number.parseInt(res.headers.get("Retry-After") ?? "", 10);
          setCreateError(
            `Too many rooms created from this network. Try again ${formatRetryAfter(
              Number.isFinite(retry) ? retry : null
            )} — or join a friend's room with their code.`
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
      setCreateError("Network error — check your connection and try again.");
      setCreating(false);
    }
  };

  return (
    <>
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
            <Label htmlFor="name" className="t-label-up block mb-2">
              Your name
            </Label>
            <Input
              id="name"
              className="h-[38px] rounded-[var(--radius)] text-[14px] mb-4"
              placeholder="you"
              value={name}
              maxLength={32}
              onChange={(e) => setName(e.target.value.slice(0, 32))}
            />

            {/* Primary path for a first-time visitor: they have no code to
             *  type, so "Create new room" carries the filled button and the
             *  join form sits below it as the secondary route. */}
            <Button
              type="button"
              onClick={handleCreate}
              disabled={createDisabled}
              className="w-full h-[38px] rounded-[var(--radius)] text-[14px] font-medium"
            >
              {creating ? "Creating…" : "Create new room"}
            </Button>
            {createError ? (
              <div
                role="alert"
                className="t-label text-center mt-2"
                style={{ color: "var(--destructive)" }}
              >
                {createError}
              </div>
            ) : null}

            <div className="flex items-center gap-3" style={{ marginTop: 24, marginBottom: 20 }}>
              <Separator className="flex-1" />
              <span className="t-label">or</span>
              <Separator className="flex-1" />
            </div>

            <form onSubmit={handleJoin}>
              <Label htmlFor="room" className="t-label-up block mb-2">
                Join with a room code
              </Label>
              <Input
                id="room"
                className="font-mono h-[38px] rounded-[var(--radius)] text-[14px] uppercase"
                placeholder="K7QM"
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
                    setCodeNotice(
                      "Room codes never use I, O, 0 or 1 — check the code again."
                    );
                  } else if (cleaned.length === 0) {
                    setCodeNotice(null);
                  }
                  if (joinError) setJoinError(null);
                }}
                aria-describedby={
                  joinError ? "room-error" : codeNotice ? "room-notice" : "room-hint"
                }
                aria-invalid={joinError ? true : undefined}
              />
              <div id="room-hint" className="t-label mt-2">
                4 characters · no I, O, 0 or 1
              </div>
              {codeNotice ? (
                <div id="room-notice" role="status" className="t-label mt-1">
                  {codeNotice}
                </div>
              ) : null}
              <Button
                type="submit"
                variant="outline"
                className="w-full h-[38px] rounded-[var(--radius)] text-[14px] font-medium mt-3"
                disabled={joinDisabled}
              >
                Join
              </Button>
              {joinError ? (
                <div
                  id="room-error"
                  role="alert"
                  className="t-label text-center mt-2"
                  style={{ color: "var(--destructive)" }}
                >
                  {joinError}
                </div>
              ) : null}
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
