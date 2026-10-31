import { cn } from "@/lib/utils";

/** Font size steps by word length; long words shrink instead of overflowing. */
const SIZE_STEPS = {
  md: { short: 60, mid: 48, long: 38 },
  lg: { short: 84, mid: 67, long: 53 },
} as const;

function sizeFor(length: number, size: keyof typeof SIZE_STEPS): number {
  const steps = SIZE_STEPS[size];
  if (length <= 8) return steps.short;
  if (length <= 12) return steps.mid;
  return steps.long;
}

type Props = {
  word: string;
  /** `md` for phones, `lg` for the desktop result hero. */
  size?: keyof typeof SIZE_STEPS;
  className?: string;
};

/**
 * A word with its first and last letter coloured (blue / pink, deepened in
 * light mode). Colour only, no chips: chips sized to the box tore short
 * letters like "t" away from the rest of the word.
 */
export function AnchoredWord({ word, size = "md", className }: Props) {
  const fontSize = sizeFor(word.length, size);
  const head = word.slice(0, 1);
  const tail = word.length > 1 ? word.slice(-1) : "";
  const middle = word.length > 2 ? word.slice(1, -1) : "";
  return (
    <span
      className={cn("font-extrabold tracking-[-0.02em] [overflow-wrap:anywhere]", className)}
      style={{ fontSize, lineHeight: 1.05 }}
    >
      <span className="text-anchor-first">{head}</span>
      {middle}
      {tail ? <span className="text-anchor-last">{tail}</span> : null}
    </span>
  );
}
