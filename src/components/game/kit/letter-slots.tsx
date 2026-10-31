import { cn } from "@/lib/utils";
import { ShapeGlyph } from "./shape";

type Props = {
  /** First letter, or null while it is still hidden. */
  first: string | null;
  /** Last letter, or null while it is still hidden. */
  last: string | null;
  /** Layout box of each shape in px. 84 on phones, 120–150 on desktop. */
  size?: number;
  /**
   * The first letter always sits in a square and the last in a star; the
   * fill may change so the shape stays visible on the phase background.
   */
  firstFill?: string;
  lastFill?: string;
  className?: string;
};

/**
 * `T _ _ _ H`: the two anchor letters with the gap between them. Hidden
 * letters render as a dashed ring with "?".
 */
export function LetterSlots({
  first,
  last,
  size = 84,
  firstFill = "var(--shape-blue)",
  lastFill = "var(--shape-pink)",
  className,
}: Props) {
  const label = `Starts with ${first ?? "a hidden letter"}, ends with ${last ?? "a hidden letter"}`;
  return (
    <div role="img" aria-label={label} className={cn("flex items-center justify-center gap-2.5", className)}>
      {first ? (
        <ShapeGlyph kind="square" size={size} glyph={first} fill={firstFill} />
      ) : (
        <ShapeGlyph kind="ring" size={size} glyph="?" fill="var(--muted-foreground)" color="var(--muted-foreground)" />
      )}
      <span
        aria-hidden
        className="font-hand tracking-[3px] text-muted-foreground"
        style={{ fontSize: Math.round(size * 0.36) }}
      >
        _ _ _
      </span>
      {last ? (
        <ShapeGlyph kind="star" size={size} glyph={last} fill={lastFill} />
      ) : (
        <ShapeGlyph kind="ring" size={size} glyph="?" fill="var(--muted-foreground)" color="var(--muted-foreground)" />
      )}
    </div>
  );
}
