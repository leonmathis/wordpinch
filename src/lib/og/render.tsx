import "server-only";
import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { getRoomByCode, isValidCode } from "@/lib/rooms";
import { cardFonts } from "./fonts";
import { LANDSCAPE, MatchCard, PORTRAIT, cardData, type CardData } from "./match-card";

/** The site's own origin, for the link printed on the card. */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "wordpinch.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Card content for a room, or null when there is no such room. */
export async function roomCard(rawCode: string | undefined): Promise<CardData | null> {
  const code = (rawCode ?? "").toUpperCase();
  if (!isValidCode(code)) return null;
  const room = await getRoomByCode(code).catch(() => null);
  if (!room) return null;
  return cardData(room.state, code, await siteOrigin());
}

export async function renderCard(
  d: CardData,
  layout: "portrait" | "landscape",
  init?: ResponseInit
): Promise<ImageResponse> {
  const size = layout === "portrait" ? PORTRAIT : LANDSCAPE;
  const fonts = await cardFonts(d.text);
  return new ImageResponse(<MatchCard d={d} layout={layout} />, {
    ...size,
    ...(fonts.length ? { fonts } : {}),
    ...init,
  });
}
