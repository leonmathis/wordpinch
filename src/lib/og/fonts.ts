import "server-only";

/**
 * Fonts for `next/og` share cards. The renderer needs ttf/otf/woff, while
 * next/font ships woff2, so the card asks Google Fonts for just the glyphs
 * it draws (the `text=` subset keeps each file a few KB). Without a user
 * agent Google answers with truetype. Cached per process; on failure the
 * card falls back to the renderer's built-in font.
 */

type Font = { name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: "normal" };

const cache = new Map<string, Promise<ArrayBuffer | null>>();

async function load(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  const chars = [...new Set(text)].sort().join("");
  const key = `${family}:${weight}:${chars}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = (async () => {
      try {
        const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(chars)}`;
        const css = await (await fetch(url, { signal: AbortSignal.timeout(4000) })).text();
        const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
        if (!src) return null;
        const res = await fetch(src, { signal: AbortSignal.timeout(4000) });
        return res.ok ? await res.arrayBuffer() : null;
      } catch (err) {
        console.warn("[og/fonts] couldn't load", family, weight, err);
        return null;
      }
    })();
    cache.set(key, hit);
    // A failure isn't cached forever: the next card tries again.
    void hit.then((d) => d === null && cache.delete(key));
  }
  return hit;
}

/** Urbanist 700/800 and Gochi Hand, subset to `text`. */
export async function cardFonts(text: string): Promise<Font[]> {
  const sans = `${text}0123456789 ·…%.:!?wordpinchyourtun`;
  const [bold, extra, hand] = await Promise.all([
    load("Urbanist", 700, sans),
    load("Urbanist", 800, sans),
    load("Gochi Hand", 400, `${text} pinched it!your turn?nobodyblinks`),
  ]);
  const fonts: Font[] = [];
  if (bold) fonts.push({ name: "Urbanist", data: bold, weight: 700, style: "normal" });
  if (extra) fonts.push({ name: "Urbanist", data: extra, weight: 800, style: "normal" });
  if (hand) fonts.push({ name: "Gochi Hand", data: hand, weight: 400, style: "normal" });
  return fonts;
}
