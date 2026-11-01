import * as React from "react";
import { cn } from "@/lib/utils";
import { glyphCorrection } from "./glyph-offsets";

export type ShapeKind = "square" | "star" | "flower" | "circle" | "ring";

/**
 * Share of the box each backdrop is drawn at so all kinds look the same
 * size. A square or circle fills its box; a star or flower only fills
 * about three quarters of it with its points and petals.
 */
const OPTICAL_SCALE: Record<ShapeKind, number> = {
  square: 0.74,
  circle: 0.81,
  ring: 0.81,
  star: 1,
  flower: 1,
};

/**
 * Inset (share of the box) that keeps content ≥12px, aiming for ~20px, off
 * the real outline: the star's inner vertices sit at 62% of the radius and
 * the flower's petal gaps at ~78%.
 */
export const SAFE_INSET: Record<ShapeKind, number> = {
  square: 0.13,
  circle: 0.15,
  ring: 0.15,
  star: 0.3,
  flower: 0.22,
};

const STAR_POINTS =
  "180,100 158.97,119.16 164.72,147.02 136.44,150.16 124.72,176.08 100,162 75.28,176.08 63.56,150.16 35.28,147.02 41.03,119.16 20,100 41.03,80.84 35.28,52.98 63.56,49.84 75.28,23.92 100,38 124.72,23.92 136.44,49.84 164.72,52.98 158.97,80.84";

const FLOWER_CIRCLES: ReadonlyArray<readonly [number, number, number]> = [
  [100, 100, 62],
  [166, 100, 22],
  [157.2, 133, 22],
  [133, 157.2, 22],
  [100, 166, 22],
  [67, 157.2, 22],
  [43, 133, 22],
  [34, 100, 22],
  [43, 67, 22],
  [67, 42.8, 22],
  [100, 34, 22],
  [133, 42.8, 22],
  [157.2, 67, 22],
];

type ShapeProps = {
  kind: ShapeKind;
  /** Edge of the square layout box in px; the backdrop is drawn inside it. */
  size: number;
  /** Any CSS colour; defaults to the current text colour. */
  fill?: string;
  /** Rotation of the square backdrop in degrees. */
  tilt?: number;
  /** Rotate the content with the square (letter tiles) or keep it upright. */
  tiltContent?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/**
 * Inline size for the SVG backdrops. Width/height attributes lose to CSS,
 * and Button's `[&_svg]:size-4` icon rule shrank them to 16px inside it.
 */
const SVG_BOX = (size: number): React.CSSProperties => ({ width: size, height: size });

function Backdrop({ kind, size, fill, tilt }: Required<Pick<ShapeProps, "kind" | "size" | "fill" | "tilt">>) {
  const edge = Math.round(size * OPTICAL_SCALE[kind]);
  if (kind === "star") {
    return (
      <svg aria-hidden width={size} height={size} viewBox="0 0 200 200" className="absolute inset-0" style={SVG_BOX(size)}>
        <polygon points={STAR_POINTS} fill={fill} stroke={fill} strokeWidth={18} strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "flower") {
    return (
      <svg aria-hidden width={size} height={size} viewBox="0 0 200 200" className="absolute inset-0" style={SVG_BOX(size)}>
        <g fill={fill}>
          {FLOWER_CIRCLES.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>
      </svg>
    );
  }
  if (kind === "ring") {
    return (
      <span
        aria-hidden
        className="absolute rounded-full border-[2.5px] border-dashed"
        style={{ width: edge, height: edge, borderColor: fill }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={kind === "circle" ? "absolute rounded-full" : "absolute"}
      style={{
        width: edge,
        height: edge,
        background: fill,
        borderRadius: kind === "square" ? Math.round(edge * 0.26) : undefined,
        transform: kind === "square" && tilt ? `rotate(${tilt}deg)` : undefined,
      }}
    />
  );
}

/**
 * Pastel Pop shape with optical sizing and a safe content area. Content is
 * laid out inside `SAFE_INSET`, so labels wrap before they reach the edge.
 */
export function Shape({
  kind,
  size,
  fill = "currentColor",
  tilt = kind === "square" ? -8 : 0,
  tiltContent = false,
  className,
  style,
  children,
}: ShapeProps) {
  const inset = Math.round(size * SAFE_INSET[kind]);
  return (
    <span
      data-shape={kind}
      className={cn("relative inline-flex shrink-0 items-center justify-center text-[#141414]", className)}
      style={{ width: size, height: size, ...style }}
    >
      <Backdrop kind={kind} size={size} fill={fill} tilt={tilt} />
      {children != null ? (
        <span
          className="absolute inset-0 flex flex-col items-center justify-center text-center"
          style={{
            padding: inset,
            transform: tiltContent && kind === "square" && tilt ? `rotate(${tilt}deg)` : undefined,
          }}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

type ShapeGlyphProps = Omit<ShapeProps, "children" | "tiltContent"> & {
  /** Single letter or "?"; rendered in Gochi Hand, optically centred. */
  glyph: string;
  /** Text colour of the glyph; defaults to ink, which reads on every pastel. */
  color?: string;
};

/** A game letter inside a shape, corrected with the measured glyph offsets. */
export function ShapeGlyph({ glyph, color, ...shape }: ShapeGlyphProps) {
  return (
    <Shape {...shape} tiltContent>
      <span
        className="font-hand leading-none"
        style={{
          fontSize: Math.round(shape.size * 0.69),
          transform: glyphCorrection(glyph),
          color,
        }}
      >
        {glyph}
      </span>
    </Shape>
  );
}
