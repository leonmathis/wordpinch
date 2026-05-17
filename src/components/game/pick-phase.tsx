"use client";

import * as React from "react";
import type { GameCtx } from "@/lib/game/types";
import { ScoreHud } from "./score-hud";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const PICK_INPUT_OVERRIDES =
  "pick-input h-auto w-[110px] max-[500px]:w-[84px] rounded-none border-0 border-b bg-transparent dark:bg-transparent px-0 pt-0 pb-3 text-[72px] max-[500px]:text-[56px] md:text-[72px] focus-visible:ring-0 focus-visible:border-b-foreground";

// Hoisted to module scope — fires on every keystroke.
const NON_ALPHA_REGEX = /[^A-Z]/g;

export function PickPhase({ ctx }: { ctx: GameCtx }) {
  const [locked, setLocked] = React.useState(false);
  const [val, setVal] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!locked && inputRef.current) inputRef.current.focus();
  }, [locked]);

  return (
    <>
      <div className="wp-body">
        <div className="wp-frame scene" style={{ alignItems: "center" }}>
          <div className="flex flex-col items-center text-center" style={{ gap: 36 }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: "-0.01em",
                lineHeight: 1.2,
              }}
            >
              You pick the{" "}
              <strong style={{ fontWeight: 600 }}>
                {(ctx.meIsHost && ctx.firstPicker === "host") ||
                (!ctx.meIsHost && ctx.firstPicker === "guest")
                  ? "first"
                  : "last"}
              </strong>{" "}
              letter
            </div>

            {!locked ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!val) return;
                  setLocked(true);
                  if (ctx.actions.ready) {
                    void ctx.actions.lockMyLetter(val);
                  }
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 20,
                }}
              >
                <Input
                  ref={inputRef}
                  autoFocus
                  className={PICK_INPUT_OVERRIDES}
                  maxLength={1}
                  value={val}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) =>
                    setVal(
                      e.target.value.toUpperCase().replace(NON_ALPHA_REGEX, "")
                    )
                  }
                  aria-label="Your letter"
                />
                <Button
                  type="submit"
                  disabled={!val}
                  className="h-[38px] w-[180px] rounded-[var(--radius)] text-[14px] font-medium"
                >
                  Lock letter
                </Button>
                <div className="t-label">or press Enter</div>
              </form>
            ) : (
              <div className="flex flex-col items-center" style={{ gap: 16 }}>
                <div
                  className="pick-input letter-pop"
                  style={{ borderBottomColor: "var(--foreground)" }}
                >
                  {val}
                </div>
                <div className="t-label flex items-center" style={{ gap: 6 }}>
                  Locked. Waiting for opponent
                  <span className="typing-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            )}
          </div>

          <ScoreHud
            you={ctx.you}
            them={ctx.them}
            used={ctx.used.slice(0, ctx.round - 1)}
          />
        </div>
      </div>
    </>
  );
}
