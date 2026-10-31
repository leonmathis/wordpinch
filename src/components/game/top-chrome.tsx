"use client";

import Link from "next/link";
import { SettingsMenu } from "./settings-menu";

type Props = {
  round?: number;
  total: number;
  muted: boolean;
  onToggleMute: () => void;
  onShare?: () => void;
  /** Room code when in a room; the menu then offers share and leave. */
  roomCode?: string;
  /** Match end: "Match over · 7 rounds" with every pill filled. */
  over?: boolean;
  /** Inline score, "Leon 2 · 1 Juno", next to the round label. */
  score?: { you: { name: string; score: number }; them: { name: string; score: number } };
};

/** Names are capped so a 32-character name can't push the gear away. */
const NAME = "inline-block max-w-[9ch] truncate align-bottom";

/** Pill width so up to 15 rounds fit in ~180px next to the gear. */
function pillWidth(total: number) {
  return Math.max(8, Math.min(22, Math.floor((180 - (total - 1) * 4) / total)));
}

/**
 * Pastel Pop top bar: round label and progress pills on the left (the
 * wordmark outside a match), one settings gear on the right. Theme, sound,
 * share and leave live in the gear's menu.
 */
export function TopChrome({ round = 0, total, muted, onToggleMute, onShare, roomCode, over, score }: Props) {
  const inMatch = round > 0 && total > 0;
  const width = inMatch ? pillWidth(total) : 0;

  return (
    <div className="wp-chrome items-center">
      {inMatch ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-[13px] font-bold whitespace-nowrap">
            {over ? `Match over · ${total} rounds` : `Round ${round} of ${total}`}
            {score ? (
              <>
                {" · "}
                <span className={NAME}>{score.you.name}</span> {score.you.score}
                {" · "}
                {score.them.score} <span className={NAME}>{score.them.name}</span>
              </>
            ) : null}
          </div>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full bg-foreground"
                style={{ width, opacity: over || i < round - 1 ? 1 : i === round - 1 ? 0.45 : 0.15 }}
              />
            ))}
          </div>
        </div>
      ) : (
        // The wordmark is the conventional "go home" affordance.
        <Link
          href="/"
          // 44px tall like every other target; the text stays where it was.
          className="-my-2 flex min-h-11 items-center rounded-sm text-xl font-extrabold tracking-[-0.01em] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          wordpinch
        </Link>
      )}
      <SettingsMenu roomCode={roomCode} onShare={onShare} muted={muted} onToggleMute={onToggleMute} />
    </div>
  );
}
