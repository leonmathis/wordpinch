/**
 * Ink-centre offsets of Gochi Hand glyphs, in % of the font size, at
 * `line-height: 1`. Positive dy = the ink sits below the line-box centre,
 * positive dx = right of the advance-box centre. Flex centring aligns the
 * box, not the ink, so `ShapeGlyph` translates by the negated value.
 *
 * Measured 31.10.2026 with `canvas.measureText` against the next/font copy
 * of Gochi Hand (ascent 77, descent 41 at 100px). Re-measure if the font
 * source changes; the method is in docs/redesign/02-design-progress.md.
 */
export const GLYPH_OFFSETS: Record<string, readonly [dx: number, dy: number]> = {
  A: [2.9, -5.1],
  B: [0.4, -1.8],
  C: [3.7, -7.8],
  D: [-2.7, -4.6],
  E: [2.5, -4.0],
  F: [1.7, -3.8],
  G: [3.3, -6.7],
  H: [2.0, -9.3],
  I: [-0.4, -6.5],
  J: [2.3, -2.6],
  K: [4.7, -8.4],
  L: [4.2, -3.3],
  M: [1.9, -4.7],
  N: [0.1, -8.1],
  O: [0.3, -1.7],
  P: [-0.8, -3.0],
  Q: [-0.7, 2.1],
  R: [2.4, -3.6],
  S: [1.4, -7.7],
  T: [-0.6, -6.8],
  U: [-0.2, -4.5],
  V: [-3.1, -6.4],
  W: [-1.0, -3.7],
  X: [0.9, -8.0],
  Y: [-5.8, 1.3],
  Z: [2.2, -7.0],
  "?": [-2.0, -13.0],
};

/** CSS transform that moves a glyph's ink onto the centre of its box. */
export function glyphCorrection(glyph: string): string | undefined {
  const offset = GLYPH_OFFSETS[glyph.toUpperCase()];
  if (!offset) return undefined;
  const [dx, dy] = offset;
  return `translate(${(-dx / 100).toFixed(3)}em, ${(-dy / 100).toFixed(3)}em)`;
}
