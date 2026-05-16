import { WordpinchUI } from "@/components/game/wordpinch-ui";
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
  const [{ code }, sp] = await Promise.all([params, searchParams]);

  const requested = sp.phase as GamePhase | undefined;
  const phase: GamePhase =
    requested && VALID_PHASES.has(requested) ? requested : "lobby";

  return (
    <WordpinchUI
      initialPhase={phase}
      roomCode={code.toUpperCase()}
      showReconnect={sp.reconnect === "1"}
    />
  );
}
