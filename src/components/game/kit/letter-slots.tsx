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
  /** F4 peek: the revealed second letter, in a sage chip at the gap's start. */
  peek?: string | null;
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
  peek = null,
  className,
}: Props) {
  const label =
    `Starts with ${first ?? "a hidden letter"}, ends with ${last ?? "a hidden letter"}` +
    (peek ? `, second letter ${peek}` : "");
  const dash = Math.round(size * 0.36);
  return (
    <div role="img" aria-label={label} className={cn("flex items-center justify-center gap-2.5", className)}>
      {first ? (
        <ShapeGlyph kind="square" size={size} glyph={first} fill={firstFill} />
      ) : (
        <ShapeGlyph kind="ring" size={size} glyph="?" fill="var(--muted-foreground)" color="var(--muted-foreground)" />
      )}
      {peek ? (
        <span aria-hidden className="flex items-center gap-1.5 font-hand text-muted-foreground" style={{ fontSize: dash }}>
          <span
            data-peek
            className="flex items-center justify-center rounded-xl bg-shape-sage leading-none text-[#141414]"
            // Gochi Hand sits high in its em box; the top padding centres it.
            style={{ width: Math.round(size * 0.48), height: Math.round(size * 0.52), fontSize: Math.round(size * 0.36), paddingTop: "0.16em" }}
          >
            {peek}
          </span>
          <span className="tracking-[3px] whitespace-nowrap">_ _</span>
        </span>
      ) : (
        <span aria-hidden className="font-hand tracking-[3px] whitespace-nowrap text-muted-foreground" style={{ fontSize: dash }}>
          _ _ _
        </span>
      )}
      {last ? (
        <ShapeGlyph kind="star" size={size} glyph={last} fill={lastFill} />
      ) : (
        <ShapeGlyph kind="ring" size={size} glyph="?" fill="var(--muted-foreground)" color="var(--muted-foreground)" />
      )}
    </div>
  );
}
