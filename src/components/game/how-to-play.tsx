"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { LetterSlots } from "./kit/letter-slots";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** The rules in three steps, opened from the settings menu. */
export function HowToPlay({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet">
        <DialogTitle className="pr-14 text-[28px] leading-none font-extrabold">
          How to play
        </DialogTitle>
        <DialogDescription className="font-hand text-[26px] leading-tight text-foreground">
          two letters, one word, go!
        </DialogDescription>
        <LetterSlots first="T" last="H" size={72} className="my-2" />
        <ol className="flex flex-col gap-3 text-[15px] leading-snug font-semibold">
          <li className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-shape-blue font-extrabold text-[#141414]">1</span>
            You pick a letter, your rival picks one. Neither sees the other&rsquo;s until the reveal.
          </li>
          <li className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-shape-pink font-extrabold text-[#141414]">2</span>
            Race to type a word that starts with the first letter and ends with the last.
          </li>
          <li className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-shape-yellow font-extrabold text-[#141414]">3</span>
            The first valid word takes the round. Most rounds wins the match.
          </li>
        </ol>
      </DialogContent>
    </Dialog>
  );
}
