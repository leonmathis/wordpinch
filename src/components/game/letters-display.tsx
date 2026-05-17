type Variant = "pinned" | "template";

type Props = {
  start: string;
  end: string;
  variant?: Variant;
  animated?: boolean;
  /**
   * Number of underscores between start and end. Encodes the minimum word
   * length visually — pass `minWordLength - 2` so e.g. min=3 → one
   * underscore (T _ H), min=5 → three underscores (T _ _ _ H). Defaults
   * to 3 (the design's original 5-letter template) for callers that
   * aren't yet wired to the setting.
   */
  gaps?: number;
};

export function LettersDisplay({
  start,
  end,
  variant = "pinned",
  animated = false,
  gaps = 3,
}: Props) {
  const cls = variant === "template" ? "letters-template" : "letters-pinned";
  const className = animated ? `${cls} slide-up-in` : cls;
  const safeGaps = Math.max(0, Math.floor(gaps));
  return (
    <div className={className}>
      {start}
      {Array.from({ length: safeGaps }, (_, i) => (
        <span key={i}>
          {" "}
          <span className="gap">_</span>
        </span>
      ))}{" "}
      {end}
    </div>
  );
}
