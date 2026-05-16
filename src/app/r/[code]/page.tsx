import { notFound } from "next/navigation";
import { WordpinchUI } from "@/components/game/wordpinch-ui";
import { getRoomByCode, isValidCode } from "@/lib/rooms";
import type { GamePhase } from "@/lib/game/types";

const VALID_PHASES = new Set<GamePhase>([
  "landing",
  "lobby",
  "pick",
  "reveal",
  "race",
  "result",
  "matchend",
  "spectator",
]);

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ phase?: string; reconnect?: string }>;
};

export default async function RoomPage({ params, searchParams }: Props) {
  const [{ code: raw }, sp] = await Promise.all([params, searchParams]);
  const code = raw.toUpperCase();

  if (!isValidCode(code)) {
    notFound();
  }

  const requested = sp.phase as GamePhase | undefined;
  const isDev = process.env.NODE_ENV === "development";

  // In dev, an explicit ?phase= bypasses the DB lookup so the design preview
  // and the phase strip keep working even with no real rooms.
  if (isDev && requested && VALID_PHASES.has(requested)) {
    return (
      <WordpinchUI
        initialPhase={requested}
        roomCode={code}
        showReconnect={sp.reconnect === "1"}
      />
    );
  }

  const room = await getRoomByCode(code).catch((err) => {
    console.error("[RoomPage] getRoomByCode failed", err);
    return null;
  });

  if (!room) {
    notFound();
  }

  const phase: GamePhase =
    requested && VALID_PHASES.has(requested) ? requested : room.state.phase;

  return (
    <WordpinchUI
      initialPhase={phase}
      roomCode={code}
      showReconnect={sp.reconnect === "1"}
    />
  );
}
