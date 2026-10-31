import "server-only";
import type { DailyStatus } from "@/lib/daily";

/**
 * F6 "Share my pinch": the daily card, 1080×1350 (design artboard 288 px
 * wide × 3.75). Spoiler-free: the letters, the time and the streak, never
 * the word, so it can be posted before friends have played.
 */

const INK = "#141414";
const PINK = "#F4B6D5";
const BLUE = "#B8CDEE";
const YELLOW = "#F5D565";
const STAR =
  "180,100 158.97,119.16 164.72,147.02 136.44,150.16 124.72,176.08 100,162 75.28,176.08 63.56,150.16 35.28,147.02 41.03,119.16 20,100 41.03,80.84 35.28,52.98 63.56,49.84 75.28,23.92 100,38 124.72,23.92 136.44,49.84 164.72,52.98 158.97,80.84";

export type DailyCardData = {
  number: number;
  date: string;
  start: string;
  end: string;
  time: string;
  fasterThan: number;
  players: number;
  streak: number;
  url: string;
  alt: string;
  text: string;
};

export function dailyCardData(s: DailyStatus, origin: string): DailyCardData | null {
  if (s.state !== "done" || !s.result || !s.letters) return null;
  const [, m, d] = s.day.split("-").map(Number);
  const time = `${(s.result.timeMs / 1000).toFixed(1)} s`;
  const url = `${origin.replace(/^https?:\/\//, "")}/daily`;
  const line = s.result.players > 1 ? `faster than ${s.result.fasterThan}% today · word hidden` : "first one today · word hidden";
  const alt =
    `Share card: Daily pinch ${s.number}, ${s.letters.start} to ${s.letters.end}, ${time.replace(" s", " seconds")}, ` +
    (s.result.players > 1 ? `faster than ${s.result.fasterThan} percent` : "first one today") +
    `, ${s.streak}-day streak`;
  return {
    number: s.number,
    date: `${d}.${m}.`,
    start: s.letters.start,
    end: s.letters.end,
    time,
    fasterThan: s.result.fasterThan,
    players: s.result.players,
    streak: s.streak,
    url,
    alt,
    text: `wordpinch Daily pinch #${s.number} ${d}.${m}. ${s.letters.start}${s.letters.end} _ ${time} ${line} ${url} your turn?`,
  };
}

export function DailyCard({ d }: { d: DailyCardData }) {
  const px = (n: number) => Math.round(n * 3.75);
  const line = d.players > 1 ? `faster than ${d.fasterThan}% today · word hidden` : "first one today · word hidden";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: px(12),
        padding: px(20),
        background: PINK,
        color: INK,
        fontFamily: "Urbanist",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 800, fontSize: px(16) }}>wordpinch</span>
        <span style={{ fontWeight: 700, fontSize: px(12) }}>{d.date}</span>
      </div>
      <span style={{ fontWeight: 800, fontSize: px(22) }}>{`Daily pinch #${d.number}`}</span>
      <div style={{ display: "flex", alignItems: "center", gap: px(8) }}>
        <div style={{ width: px(64), height: px(64), display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              width: px(48),
              height: px(48),
              borderRadius: px(12),
              background: BLUE,
              transform: "rotate(-8deg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Gochi Hand",
              fontSize: px(44),
              paddingTop: px(6),
            }}
          >
            {d.start}
          </div>
        </div>
        <span style={{ fontFamily: "Gochi Hand", fontSize: px(24), letterSpacing: px(3) }}>_ _ _</span>
        <div style={{ position: "relative", width: px(64), height: px(64), display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={px(64)} height={px(64)} viewBox="0 0 200 200" style={{ position: "absolute", left: 0, top: 0 }}>
            <polygon points={STAR} fill={YELLOW} stroke={YELLOW} strokeWidth={18} strokeLinejoin="round" />
          </svg>
          <span style={{ fontFamily: "Gochi Hand", fontSize: px(44), paddingTop: px(6) }}>{d.end}</span>
        </div>
      </div>
      <span style={{ fontWeight: 800, fontSize: px(30) }}>{d.time}</span>
      <span style={{ fontWeight: 700, fontSize: px(14) }}>{line}</span>
      <div style={{ display: "flex", gap: px(5) }}>
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            style={{ width: px(22), height: px(22), borderRadius: px(7), background: i < d.streak ? INK : "rgba(20,20,20,0.18)" }}
          />
        ))}
      </div>
      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "baseline", fontWeight: 700, fontSize: px(12) }}>
        <span>{d.url}</span>
        <span style={{ fontFamily: "Gochi Hand", fontSize: px(18) }}>your turn?</span>
      </div>
    </div>
  );
}
