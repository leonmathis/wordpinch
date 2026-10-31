import "server-only";
import { matchAwards } from "@/lib/game/awards";
import type { PersistedGameState } from "@/lib/game/state";
import type { UsedWord } from "@/lib/game/types";

/**
 * F5 share card, drawn by `next/og` (satori: flexbox only, every element
 * with several children needs `display: flex`). Two shapes from the same
 * content: `portrait` 1080×1350 for "Save image" / "Share…", and
 * `landscape` 1200×630 as the room link's Open Graph preview.
 *
 * Before the match ends there is nothing to brag about, so the card
 * invites instead: the room code and "your turn?".
 */

export const PORTRAIT = { width: 1080, height: 1350 } as const;
export const LANDSCAPE = { width: 1200, height: 630 } as const;

const INK = "#141414";
const BLUE = "#B8CDEE";
const YELLOW = "#F5D565";
const WHITE = "#FFFFFF";
const MAX_NAME = 16;
const MAX_PILL_NAME = 11;
const MAX_WORD = 13;

/** Names and words stay on one line; the full text is in the alt text. */
function short(text: string, max = MAX_NAME) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export type CardData = {
  code: string;
  url: string;
  over: boolean;
  rounds: number;
  /** Winner first; equal scores keep the host first. */
  players: { name: string; score: number }[];
  tie: boolean;
  highlights: { word: string; note: string }[];
  alt: string;
  host: string;
  /** Every string the card draws, for the font subset. */
  text: string;
};

export function cardData(state: PersistedGameState, code: string, origin: string): CardData {
  const host = { name: state.players.host?.name ?? "Host", score: state.scores.host };
  const guest = { name: state.players.guest?.name ?? "Guest", score: state.scores.guest };
  const tie = host.score === guest.score;
  const players = guest.score > host.score ? [guest, host] : [host, guest];
  const over = state.phase === "matchend";
  const rounds = state.settings.rounds;

  const used: UsedWord[] = state.usedWords.map((u) => ({
    ...u,
    bySide: u.by,
    by: u.by === "host" ? host.name : u.by === "guest" ? guest.name : "both",
  }));
  const { fastest, longest } = matchAwards(used);
  const highlights: { word: string; note: string }[] = [];
  if (fastest) highlights.push({ word: fastest.word, note: `fastest · ${fastest.detail}` });
  if (longest && longest.word !== fastest?.word) highlights.push({ word: longest.word, note: `longest · ${longest.word.length}` });
  // The third line: the latest other word, so the card shows the match's end.
  for (const u of [...state.usedWords].reverse()) {
    if (highlights.length >= 3) break;
    if (highlights.some((h) => h.word === u.word)) continue;
    highlights.push({ word: u.word, note: `round ${u.round}` });
  }

  const url = `${origin.replace(/^https?:\/\//, "")}/r/${code}`;
  const alt = over
    ? tie
      ? `Share card: ${host.name} and ${guest.name} tied ${host.score} to ${guest.score}`
      : `Share card: ${players[0].name} beat ${players[1].name} ${players[0].score} to ${players[1].score}` +
        (fastest ? `, fastest word ${fastest.word.toLowerCase()} in ${fastest.detail.replace(" s", " seconds")}` : "")
    : `Invite card: join ${host.name} in wordpinch room ${code}`;
  const text = [
    ...players.map((p) => `${short(p.name)} ${short(p.name, MAX_PILL_NAME)} ${p.score}`),
    ...highlights.map((h) => `${short(h.word.toUpperCase(), MAX_WORD)} ${h.note}`),
    `${host.name} is waiting for a rival`,
    `${rounds} round rounds`,
    url,
    code,
    "Dead heat! nobody blinks pinched it! join the room your turn?",
  ].join(" ");
  return { code, url, over, rounds, players, tie, highlights, alt, text, host: host.name };
}

export function MatchCard({ d, layout }: { d: CardData; layout: "portrait" | "landscape" }) {
  const wide = layout === "landscape";
  // Design artboard: 288 px wide; the portrait card is that × 3.75.
  const s = wide ? 2.4 : 3.75;
  const px = (n: number) => Math.round(n * s);

  const headline = !d.over ? (
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 0.98 }}>
      <span style={{ fontFamily: "Urbanist", fontWeight: 800, fontSize: px(44), letterSpacing: px(3) }}>{d.code}</span>
      <span style={{ fontFamily: "Gochi Hand", fontSize: px(34) }}>join the room</span>
      <span style={{ fontWeight: 700, fontSize: px(16), marginTop: px(10) }}>{`${short(d.host)} is waiting for a rival`}</span>
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 0.98 }}>
      <span style={{ fontFamily: "Urbanist", fontWeight: 800, fontSize: px(34), letterSpacing: -px(1) }}>
        {d.tie ? "Dead heat!" : short(d.players[0].name)}
      </span>
      <span style={{ fontFamily: "Gochi Hand", fontSize: px(40) }}>{d.tie ? "nobody blinks" : "pinched it!"}</span>
    </div>
  );

  const pills = d.over ? (
    <div style={{ display: "flex", flexWrap: "wrap", gap: px(8) }}>
      {d.players.map((p, i) => (
        <span
          key={i}
          style={{
            padding: `${px(6)}px ${px(14)}px`,
            borderRadius: 999,
            background: i === 0 || d.tie ? YELLOW : WHITE,
            fontFamily: "Urbanist",
            fontWeight: 800,
            fontSize: px(20),
          }}
        >
          {`${short(p.name, MAX_PILL_NAME)} ${p.score}`}
        </span>
      ))}
    </div>
  ) : null;

  const words =
    d.over && d.highlights.length > 0 ? (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: px(2),
          background: WHITE,
          borderRadius: px(18),
          padding: `${px(8)}px ${px(12)}px`,
          fontFamily: "Urbanist",
          fontSize: px(13),
          width: wide ? px(200) : "100%",
        }}
      >
        {d.highlights.map((h, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: px(10) }}>
            <span style={{ fontWeight: 800 }}>{short(h.word.toUpperCase(), MAX_WORD)}</span>
            <span style={{ fontWeight: 700 }}>{h.note}</span>
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: px(12),
        padding: px(20),
        background: BLUE,
        color: INK,
        fontFamily: "Urbanist",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 800, fontSize: px(16) }}>wordpinch</span>
        <span style={{ fontWeight: 700, fontSize: px(12) }}>
          {`${d.rounds} ${d.rounds === 1 ? "round" : "rounds"}${d.over ? "" : " · come play"}`}
        </span>
      </div>
      {wide ? (
        <div style={{ display: "flex", flex: 1, gap: px(24), alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: px(12), flex: 1 }}>
            {headline}
            {pills}
          </div>
          {words}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: px(12) }}>
          {headline}
          {pills}
          {words}
        </div>
      )}
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontWeight: 700,
          fontSize: px(12),
        }}
      >
        <span>{d.url}</span>
        <span style={{ fontFamily: "Gochi Hand", fontSize: px(18) }}>your turn?</span>
      </div>
    </div>
  );
}
