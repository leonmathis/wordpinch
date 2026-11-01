"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { CircleHelp, LogOut, Moon, Settings, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMounted } from "@/lib/hooks";
import { HowToPlay } from "./how-to-play";

type Props = {
  /** Room code when in a room; adds the room/share row and "Leave room". */
  roomCode?: string;
  onShare?: () => void;
  muted: boolean;
  onToggleMute: () => void;
};

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
] as const;

const ROW = "flex min-h-13 w-full items-center gap-3 rounded-full bg-row py-2 pr-3 pl-2 text-[15px] font-bold";
const DOT = "flex size-9 shrink-0 items-center justify-center rounded-full text-[#141414] [&_svg]:size-4";

/**
 * The gear in the top bar. Holds what used to be four separate icons
 * (theme, sound, share, leave) plus the rules.
 */
export function SettingsMenu({ roomCode, onShare, muted, onToggleMute }: Props) {
  const [open, setOpen] = React.useState(false);
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const { theme, setTheme } = useTheme();
  const isMounted = useIsMounted();
  const soundId = React.useId();

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button variant="circle" size="circle" aria-label="Settings" />}>
          <Settings />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={10}
          className="w-[min(300px,calc(100vw-32px))] gap-1.5 rounded-[28px] p-3.5 shadow-[0_18px_40px_rgb(0_0_0/0.18)] ring-0"
        >
          {roomCode ? (
            <div className="flex items-center justify-between gap-3 px-1.5 pb-2">
              <div>
                <div className="text-xs font-bold text-muted-foreground">Room</div>
                <div className="text-2xl font-extrabold tracking-[3px]">{roomCode}</div>
              </div>
              {onShare ? (
                <Button
                  variant="pill"
                  size="pill-md"
                  onClick={() => {
                    setOpen(false);
                    onShare();
                  }}
                >
                  Share
                </Button>
              ) : null}
            </div>
          ) : null}

          <label htmlFor={soundId} className={`${ROW} cursor-pointer`}>
            <span aria-hidden className={`${DOT} bg-shape-pink`}><Volume2 /></span>
            <span className="flex-1">Sound</span>
            <Switch id={soundId} checked={!muted} onCheckedChange={onToggleMute} />
          </label>

          <div className="flex flex-col gap-2 rounded-[26px] bg-row p-2">
            <div className="flex items-center gap-3 text-[15px] font-bold">
              <span aria-hidden className={`${DOT} bg-shape-yellow`}><Moon /></span>
              Theme
            </div>
            <ToggleGroup
              variant="segment"
              size="segment"
              aria-label="Theme"
              className="w-full data-[variant=segment]:bg-card"
              value={isMounted && theme ? [theme] : []}
              onValueChange={(next) => {
                if (next[0]) setTheme(next[0]);
              }}
            >
              {THEMES.map((t) => (
                <ToggleGroupItem key={t.value} value={t.value}>
                  {t.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <Button
            variant="ghost"
            className={`${ROW} h-auto justify-start text-foreground hover:bg-row/70`}
            onClick={() => {
              setOpen(false);
              setRulesOpen(true);
            }}
          >
            <span aria-hidden className={`${DOT} bg-shape-blue`}><CircleHelp /></span>
            How to play
          </Button>

          {roomCode ? (
            <Link href="/" className={`${ROW} bg-transparent text-destructive`}>
              <span aria-hidden className={`${DOT} bg-row text-destructive`}><LogOut /></span>
              Leave room
            </Link>
          ) : null}
        </PopoverContent>
      </Popover>
      <HowToPlay open={rulesOpen} onOpenChange={setRulesOpen} />
    </>
  );
}
