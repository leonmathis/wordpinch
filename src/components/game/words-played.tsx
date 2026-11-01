"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import type { UsedWord } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Words played · 2": a pill on phones and a card header from 1024px,
 * expanding into one row per earlier round. Hidden before any word.
 */
export function WordsPlayed({ words, className }: { words: UsedWord[]; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  if (words.length === 0) return null;
  return (
    <div className={cn("flex flex-col items-center gap-2.5 lg:items-stretch lg:gap-0 lg:rounded-[26px] lg:bg-card lg:px-4 lg:py-1.5", className)}>
      <Button
        variant="pill-soft"
        size="pill-md"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="lg:justify-between lg:bg-transparent lg:px-0 lg:hover:bg-transparent aria-expanded:bg-card aria-expanded:text-card-foreground lg:aria-expanded:bg-transparent"
      >
        Words played · {words.length}
        <ChevronDown aria-hidden className={cn("transition-transform motion-reduce:transition-none", open && "rotate-180")} />
      </Button>
      {open ? (
        <ul
          id={listId}
          className="m-0 flex w-full list-none flex-col gap-1.5 rounded-[22px] bg-card px-4 py-2.5 text-sm lg:rounded-none lg:bg-transparent lg:px-0 lg:pt-0.5"
        >
          {words.map((w) => (
            <li key={`${w.round}-${w.word}`} className="flex min-w-0 items-baseline gap-2.5">
              <span className="w-[34px] shrink-0 text-muted-foreground">Rd {w.round}</span>
              <span className="min-w-0 flex-1 font-extrabold [overflow-wrap:anywhere] uppercase">{w.word}</span>
              <span className="max-w-[40%] shrink-0 truncate text-muted-foreground">{w.by}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
