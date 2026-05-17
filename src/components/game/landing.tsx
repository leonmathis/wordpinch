"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { GameCtx } from "@/lib/game/types";
import { useClientId, useIsMounted, useStoredString } from "@/lib/hooks";
import { TopChrome } from "./top-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CODE_REGEX = /^[A-HJ-NP-Z2-9]{4}$/;
// Hoisted to avoid re-creating per keystroke.
const NON_CODE_CHAR_REGEX = /[^A-HJ-NP-Z2-9]/g;

export function Landing({ ctx }: { ctx: GameCtx }) {
  const router = useRouter();
  const clientId = useClientId();
  const isMounted = useIsMounted();
  // Name is sourced directly from localStorage via useStoredString — no local
  // copy, no sync effect, so cross-tab edits show up immediately.
  const [name, setName] = useStoredString("name");
  const [code, setCode] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
      setError("Code must be 4 letters/digits (no I, O, 0, 1)");
      return;
    }
    router.push(`/r/${trimmed}`);
  };

  const handleCreate = async () => {
    if (!clientId || creating) return;
    setCreating(true);
    setError(null);
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
        setError(data.error ?? "Failed to create room");
        setCreating(false);
        return;
      }
      router.push(`/r/${data.code}`);
    } catch (err) {
      console.error("[Landing] create error", err);
      setError("Network error — try again");
      setCreating(false);
    }
  };

  return (
    <>
      <TopChrome
        total={ctx.total}
        muted={ctx.muted}
        onToggleMute={ctx.toggleMute}
        showShare={false}
      />
      <div className="wp-body">
        <div className="wp-frame scene">
          <p
            className="text-foreground text-center mx-auto"
            style={{ fontSize: 15, lineHeight: 1.7, maxWidth: "50ch", marginBottom: 28 }}
          >
            A two-player word game. You pick a letter, your opponent picks a letter,
            and you both race to type a word that starts and ends with them.
          </p>

          <form
            onSubmit={handleJoin}
            className="mx-auto w-full"
            style={{ maxWidth: 360 }}
          >
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
            <Label htmlFor="room" className="t-label-up block mb-2">
              Join a room
            </Label>
            <Input
              id="room"
              className="font-mono h-[38px] rounded-[var(--radius)] text-[14px] uppercase"
              placeholder="SLATE"
              value={code}
              maxLength={4}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(NON_CODE_CHAR_REGEX, ""));
                if (error) setError(null);
              }}
              aria-describedby={error ? "room-error" : undefined}
              aria-invalid={error ? true : undefined}
            />
            <Button
              type="submit"
              className="w-full h-[38px] rounded-[var(--radius)] text-[14px] font-medium mt-3"
              disabled={joinDisabled}
            >
              Join
            </Button>
            {error ? (
              <div
                id="room-error"
                role="alert"
                className="t-label text-center mt-2"
                style={{ color: "var(--destructive)" }}
              >
                {error}
              </div>
            ) : null}
            <div className="text-center mt-3">
              <Button
                type="button"
                variant="link"
                onClick={handleCreate}
                disabled={createDisabled}
                className="link-underline h-auto p-0 font-mono text-[13px] text-foreground no-underline hover:no-underline disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create new room"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
