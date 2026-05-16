type Variant = "pinned" | "template";

type Props = {
  start: string;
  end: string;
  variant?: Variant;
  animated?: boolean;
};

export function LettersDisplay({
  start,
  end,
  variant = "pinned",
  animated = false,
}: Props) {
  const cls = variant === "template" ? "letters-template" : "letters-pinned";
  const className = animated ? `${cls} slide-up-in` : cls;
  return (
    <div className={className}>
      {start} <span className="gap">_</span>{" "}
      <span className="gap">_</span> <span className="gap">_</span>{" "}
      {end}
    </div>
  );
}
