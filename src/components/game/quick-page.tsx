"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, ChevronLeft, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ensureIdentity } from "@/lib/identity";
import { useStoredString } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { Shape } from "./kit/shape";
import { StatusPill } from "./kit/status-pill";

type Status =
  | { state: "idle" }
  | { state: "waiting"; waitingSince: number; waiting: number }
  | { state: "matched"; code: string; opponent: string };

const POLL_MS = 1500;
/** After this long without a rival the page stops and says so (decision 4). */
const TIMEOUT_MS = 60_000;

/** Two dashed rings; each dot sits on its ring's stroke line (Leon, 31.10.). */
const RING = 240;
const STROKE = 2.5;
const ORBITS = [
  { inset: 0, dot: 30, angle: -50, fill: "var(--shape-yellow)" },
  { inset: 36, dot: 22, angle: 140, fill: "var(--shape-sage)" },
];

function Orbit({ name }: { name: string }) {
  return (
    <div role="status" aria-label="Searching for an opponent" className="relative" style={{ width: RING, height: RING }}>
      {ORBITS.map((o, i) => {
        const size = RING - 2 * o.inset;
        // Centred on the stroke: the ring's radius minus half the stroke.
        const r = size / 2 - STROKE / 2;
        const rad = (o.angle * Math.PI) / 180;
        return (
          <div key={i} className="absolute" style={{ inset: o.inset }}>
            <span className="absolute inset-0 rounded-full border-dashed border-[var(--quick-ring)]" style={{ borderWidth: STROKE }} />
            {/* The dot orbits by turning this layer; its offset stays on the ring. */}
            <div className={cn("quick-orbit absolute inset-0", i === 1 && "[animation-direction:reverse] [animation-duration:13s]")}>
              <span
                data-orbit-dot
                className="absolute rounded-full"
                style={{
                  width: o.dot,
                  height: o.dot,
                  left: size / 2 + r * Math.cos(rad) - o.dot / 2,
                  top: size / 2 + r * Math.sin(rad) - o.dot / 2,
                  background: o.fill,
                }}
              />
            </div>
          </div>
        );
      })}
      <div className="absolute inset-0 flex items-center justify-center">
        <Avatar name={name} size={96} side="host" />
      </div>
    </div>
  );
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * F7 quick match (`/quick`): wait for a stranger, then straight into a
 * five-round game with the fixed rules. After a minute alone it offers to
 * invite a friend instead or keep waiting.
 */
export function QuickPage() {
  const router = useRouter();
  const [name] = useStoredString("name");
  const me = name.trim() || "You";
  const [status, setStatus] = React.useState<Status | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [gaveUp, setGaveUp] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());
  const [countdown, setCountdown] = React.useState(3);
  const [round, setRound] = React.useState(0);
  // When this page joined, on this device's clock. The wait is measured
  // from here, not from the server's timestamp: a phone clock running a
  // few minutes fast would otherwise show "nobody around" at once.
  const [joinedAt, setJoinedAt] = React.useState<number | null>(null);
  const nameRef = React.useRef(name);
  React.useEffect(() => {
    nameRef.current = name;
  });

  // Join (or re-join after "Keep waiting"), then poll until matched.
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let started = Date.now();
    const poll = async (method: "POST" | "GET") => {
      try {
        const res = await fetch("/api/quick", {
          method,
          headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
          body: method === "POST" ? JSON.stringify({ name: nameRef.current }) : undefined,
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 401) {
          setError("Quick match needs a player account, and that couldn't be set up right now.");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const s = (await res.json()) as Status;
        if (cancelled) return;
        setStatus(s);
        setNow(Date.now());
        if (method === "POST") started = Date.now();
        setJoinedAt(started);
        if (s.state === "waiting" && Date.now() - started >= TIMEOUT_MS) {
          setGaveUp(true);
          void fetch("/api/quick", { method: "DELETE" });
          return;
        }
        if (s.state !== "matched") timer = setTimeout(() => void poll("GET"), POLL_MS);
      } catch {
        if (!cancelled) setError("Couldn't reach the queue. Check your connection.");
      }
    };
    void ensureIdentity().then(() => {
      if (!cancelled) void poll("POST");
    });
    // Leaving the page leaves the queue (a made match stays).
    const leave = () => void fetch("/api/quick", { method: "DELETE", keepalive: true });
    window.addEventListener("pagehide", leave);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("pagehide", leave);
    };
  }, [round]);

  // The waiting clock between polls.
  const waiting = status?.state === "waiting" && !gaveUp;
  React.useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [waiting]);

  // Matched: 3 · 2 · 1, then into the room.
  const matchedCode = status?.state === "matched" ? status.code : null;
  React.useEffect(() => {
    if (!matchedCode) return;
    const id = setInterval(() => setCountdown((n) => n - 1), 1000);
    const go = setTimeout(() => router.push(`/r/${matchedCode}`), 3000);
    return () => {
      clearInterval(id);
      clearTimeout(go);
    };
  }, [matchedCode, router]);

  const cancel = async () => {
    await fetch("/api/quick", { method: "DELETE" }).catch(() => {});
    router.push("/");
  };

  const inviteFriend = async () => {
    try {
      const hostId = await ensureIdentity();
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostId: hostId || undefined, hostName: name.trim().slice(0, 32) || undefined }),
      });
      const data = (await res.json()) as { code?: string };
      if (res.ok && data.code) router.push(`/r/${data.code}`);
      else setError("Couldn't create a room. Try again.");
    } catch {
      setError("Couldn't create a room. Check your connection.");
    }
  };

  const view = error ? "error" : status?.state === "matched" ? "matched" : gaveUp ? "none" : "searching";

  return (
    <div className="wp-root" data-phase="quick">
      <div className="wp-chrome items-center">
        <Link href="/" aria-label="Back to start" onClick={() => void fetch("/api/quick", { method: "DELETE" })} className={cn(buttonVariants({ variant: "pill-soft", size: "circle" }))}>
          <ChevronLeft aria-hidden />
        </Link>
        <div className="text-[15px] font-bold">Quick match</div>
        <div aria-hidden className="w-11" />
      </div>
      <div className="wp-body">
        <div className="wp-frame flex-1 items-center justify-center gap-[26px] text-center lg:max-w-[560px]">
          {view === "error" ? (
            <StatusPill tone="attention" role="alert" icon={<TriangleAlert />}>
              {error}
            </StatusPill>
          ) : view === "matched" && status?.state === "matched" ? (
            <>
              <div className="flex items-center gap-4">
                <div className="flex w-[110px] flex-col items-center gap-2">
                  <Avatar name={me} size={96} side="host" />
                  <span className="text-[15px] font-bold">You</span>
                </div>
                <span className="font-hand text-[34px]">vs</span>
                <div className="flex w-[110px] min-w-0 flex-col items-center gap-2">
                  <Avatar name={status.opponent} size={96} side="guest" />
                  <span className="max-w-[110px] truncate text-[15px] font-bold" title={status.opponent}>
                    {status.opponent}
                  </span>
                </div>
              </div>
              <div role="status">
                <h1 className="m-0 text-[32px] leading-[1.05] font-extrabold">
                  Matched!
                  <br />
                  <span className="font-hand text-[38px] font-normal">{`starting in ${Math.max(1, countdown)}…`}</span>
                </h1>
                <p className="mt-2.5 text-[15px] font-semibold text-muted-foreground">5 rounds · 30 s · quick-match rules</p>
              </div>
            </>
          ) : view === "none" ? (
            <>
              <Shape kind="flower" size={180} fill="var(--shape-yellow)">
                <AlarmClock aria-hidden className="size-[52px]" strokeWidth={2} />
              </Shape>
              <div>
                <h1 className="m-0 text-[32px] leading-[1.05] font-extrabold">
                  Quiet right now
                  <br />
                  <span className="font-hand text-[38px] font-normal">nobody&apos;s around</span>
                </h1>
                <p className="mt-2.5 text-[15px] font-semibold text-muted-foreground">
                  Searched for 1:00. Invite a friend instead, or keep waiting.
                </p>
              </div>
            </>
          ) : (
            <>
              <Orbit name={me} />
              <div>
                <h1 className="m-0 text-[32px] leading-[1.05] font-extrabold">
                  Finding
                  <br />
                  <span className="font-hand text-[38px] font-normal">someone to pinch…</span>
                </h1>
                <p className="mt-2.5 text-[15px] font-semibold text-muted-foreground" aria-live="off">
                  {status?.state === "waiting" && joinedAt !== null
                    ? `${status.waiting} waiting · ${mmss(now - joinedAt)}`
                    : "joining the queue…"}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex w-full flex-col items-center px-6 pb-7">
        <div className="flex w-full max-w-[560px] flex-col gap-2.5">
          {view === "searching" ? (
            // Keys: each view's buttons mount fresh, so a white Cancel doesn't
            // animate into the black "Invite a friend" (transition-all).
            <Button key="cancel" variant="pill-soft" size="pill-lg" className="w-full" onClick={() => void cancel()}>
              Cancel
            </Button>
          ) : view === "none" ? (
            <>
              <Button key="invite" variant="pill" size="pill-lg" className="w-full" onClick={() => void inviteFriend()}>
                Invite a friend
              </Button>
              <Button
                key="keep"
                variant="pill-soft"
                size="pill-lg"
                className="w-full"
                onClick={() => {
                  setGaveUp(false);
                  setStatus(null);
                  setRound((n) => n + 1);
                }}
              >
                Keep waiting
              </Button>
            </>
          ) : view === "error" ? (
            <Button key="retry" variant="pill" size="pill-lg" className="w-full" onClick={() => {
              setError(null);
              setRound((n) => n + 1);
            }}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
