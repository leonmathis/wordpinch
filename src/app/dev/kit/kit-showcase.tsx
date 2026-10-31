"use client";

import * as React from "react";
import { ArrowRight, Loader2, RefreshCw, Settings, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar } from "@/components/game/avatar";
import { AnchoredWord } from "@/components/game/kit/anchored-word";
import { LetterSlots } from "@/components/game/kit/letter-slots";
import { ModeGrid } from "@/components/game/kit/mode-grid";
import { ShapeGlyph } from "@/components/game/kit/shape";
import { StatusPill } from "@/components/game/kit/status-pill";
import { TopChrome } from "@/components/game/top-chrome";

/** The real top bar in a box of its own (it is absolutely positioned). */
function TopBarSample({ round, total, roomCode }: { round: number; total: number; roomCode?: string }) {
  const [muted, setMuted] = React.useState(false);
  return (
    <div data-kit="top-bar" className="relative h-20 overflow-hidden rounded-2xl bg-shape-blue/40">
      <TopChrome round={round} total={total} muted={muted} onToggleMute={() => setMuted((m) => !m)} roomCode={roomCode} />
    </div>
  );
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Column({ label }: { label: string }) {
  const [sound, setSound] = React.useState(true);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-8 bg-background p-6 text-foreground">
      <h1 className="text-2xl font-extrabold">
        Kit <span className="font-hand text-3xl font-normal">{label}</span>
      </h1>

      <Section title="Top bar">
        <TopBarSample round={0} total={7} />
        <TopBarSample round={3} total={7} roomCode="K7QM" />
        <TopBarSample round={15} total={15} roomCode="K7QM" />
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="pill" size="pill-lg">
            Next round <ArrowRight />
          </Button>
          <Button variant="pill" size="pill-lg" disabled>
            Waiting for Juno…
          </Button>
          <Button variant="pill-soft" size="pill-md">Copy link</Button>
          <Button variant="circle" size="circle" aria-label="Settings">
            <Settings />
          </Button>
        </div>
      </Section>

      <Section title="Inputs">
        <Input variant="pill" aria-label="Your word" defaultValue="tooth" />
        <Input variant="pill" aria-label="Rejected word" aria-invalid defaultValue="toth" />
      </Section>

      <Section title="Switch and segments">
        <div className="flex items-center gap-4">
          <Switch checked={sound} onCheckedChange={setSound} aria-label="Sound" />
          <Switch checked={false} aria-label="Off" />
          <span className="text-sm font-semibold">Sound {sound ? "on" : "off"}</span>
        </div>
        <ToggleGroup variant="segment" size="segment" defaultValue={["replay"]} aria-label="Tie behaviour" className="w-full">
          <ToggleGroupItem value="replay">Replay</ToggleGroupItem>
          <ToggleGroupItem value="split">Split</ToggleGroupItem>
          <ToggleGroupItem value="nobody">Nobody</ToggleGroupItem>
        </ToggleGroup>
      </Section>

      <Section title="Shapes with labels (160px, safe inset)">
        <ModeGrid
          size={160}
          data-kit="mode-grid"
          className="justify-items-start"
          modes={[
            { id: "friend", kind: "square", fill: "var(--shape-yellow)", title: "Play a\nfriend", sub: "new room" },
            { id: "daily", kind: "star", fill: "var(--shape-pink)", title: "Daily\npinch", sub: "Q _ _ _ N" },
            { id: "quick", kind: "circle", fill: "var(--shape-blue)", title: "Quick\nmatch", sub: "142 online" },
            { id: "pass", kind: "flower", fill: "var(--shape-sage)", title: "Pass the\nphone", sub: "one device" },
          ]}
        />
      </Section>

      <Section title="Glyphs (measured offsets)">
        <div className="flex flex-wrap gap-1" data-kit="glyphs">
          {ALPHABET.map((letter) => (
            <ShapeGlyph key={letter} kind="square" size={56} glyph={letter} fill="var(--shape-blue)" />
          ))}
          <ShapeGlyph kind="ring" size={56} glyph="?" fill="var(--muted-foreground)" color="var(--muted-foreground)" />
        </div>
      </Section>

      <Section title="Letter slots">
        <LetterSlots first="T" last="H" />
        <LetterSlots first="Q" last={null} lastFill="var(--shape-yellow)" />
      </Section>

      <Section title="Anchored word (60 / 48 / 38px by length)">
        <AnchoredWord word="tooth" />
        <AnchoredWord word="toothbrush" />
        <AnchoredWord word="straightforwardness" />
      </Section>

      <Section title="Avatars">
        <div className="flex items-center gap-3">
          <Avatar name="Leon" side="host" size={44} />
          <Avatar name="Juno" side="guest" size={44} />
          <Avatar name="Ada" size={36} />
          <Avatar name="Juno" side="guest" size={36} dim />
        </div>
      </Section>

      <Section title="Status pills">
        <StatusPill icon={<Loader2 className="motion-safe:animate-spin" />}>Reconnecting…</StatusPill>
        <StatusPill
          icon={<RefreshCw />}
          iconFill="var(--shape-yellow)"
          action={<Button variant="pill" size="pill-md">Refresh</Button>}
        >
          Still reconnecting. Try refreshing.
        </StatusPill>
        <StatusPill
          tone="attention"
          role="alert"
          icon={<TriangleAlert />}
          action={<Button variant="pill" size="pill-md">Retry</Button>}
        >
          Couldn&apos;t confirm your seat in this room.
        </StatusPill>
      </Section>

      <Section title="Sheet dialog">
        <Dialog>
          <DialogTrigger render={<Button variant="pill-soft" size="pill-md" />}>Open share sheet</DialogTrigger>
          <DialogContent variant="sheet">
            <DialogTitle className="text-[28px] font-extrabold">Invite a friend</DialogTitle>
            <DialogDescription className="font-hand text-[26px] text-foreground">they join with K7QM</DialogDescription>
            <Input variant="pill" readOnly defaultValue="wordpinch.app/r/K7QM" aria-label="Room link" className="bg-row" />
            <Button variant="pill" size="pill-lg">Share via…</Button>
          </DialogContent>
        </Dialog>
      </Section>
    </div>
  );
}

export function KitShowcase() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col lg:flex-row">
        <Column label="current theme" />
        <div className="dark flex min-w-0 flex-1">
          <Column label="dark" />
        </div>
      </div>
    </div>
  );
}
