"use client";

import * as React from "react";
import type { Player, UsedWord } from "@/lib/game/mock";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Props = {
  used: UsedWord[];
  you: Player;
  them: Player;
};

export function ScoreHud({ used, you, them }: Props) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();

  return (
    <div className="w-full" style={{ marginTop: 32 }}>
      <Separator />
      <div className="flex items-center justify-between font-mono mt-3" style={{ fontSize: 13 }}>
        <div className="flex items-center gap-4">
          <span>
            <span className="text-muted-foreground">{you.name}</span>{" "}
            <span className="tabular-nums">{you.score}</span>
          </span>
          <span className="text-muted-foreground">·</span>
          <span>
            <span className="text-muted-foreground">{them.name}</span>{" "}
            <span className="tabular-nums">{them.score}</span>
          </span>
        </div>
        <Button
          variant="ghost"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="h-auto p-0 font-mono text-[13px] text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          Words played · {used.length} {open ? "↑" : "↓"}
        </Button>
      </div>
      {open && used.length > 0 ? (
        <div id={panelId} className="used-list mt-3" style={{ maxHeight: 150, overflowY: "auto" }}>
          <Separator />
          {used.map((u, i) => (
            <React.Fragment key={u.round}>
              <div className="used-row">
                <span className="meta">Rd {u.round}</span>
                <span className="word">{u.word}</span>
                <span className="ipa">{u.ipa}</span>
                <span className="by">by {u.by}</span>
              </div>
              {i < used.length - 1 ? <Separator /> : null}
            </React.Fragment>
          ))}
          <Separator />
        </div>
      ) : null}
    </div>
  );
}
