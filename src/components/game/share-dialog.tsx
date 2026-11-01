"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMounted } from "@/lib/hooks";
import { QR } from "./qr";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomCode: string;
};

export function ShareDialog({ open, onOpenChange, roomCode }: Props) {
  const [copied, setCopied] = React.useState(false);
  const isMounted = useIsMounted();
  // ShareDialog is next/dynamic({ ssr: false }) — always client-side, so
  // window.location is safe.
  const fullUrl = `${window.location.origin}/r/${roomCode}`;
  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlInputRef = React.useRef<HTMLInputElement>(null);

  // navigator.share exists on most mobile browsers + Safari; not on most
  // desktop browsers. Gating on isMounted keeps SSR output stable.
  const canShare =
    isMounted &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function";

  React.useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    []
  );

  const flashCopied = () => {
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1200);
    toast.success("Link copied", { duration: 1500 });
  };

  const copy = async () => {
    // 1) Modern Clipboard API (secure context required — works on HTTPS and
    //    on localhost). iOS Safari counts dialog button click as a valid
    //    user gesture.
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(fullUrl);
        flashCopied();
        return;
      } catch {
        /* fall through to legacy path */
      }
    }
    // 2) Legacy fallback — select the URL input and execCommand('copy').
    //    Still works on older mobile browsers that block the modern API.
    const input = urlInputRef.current;
    if (input) {
      input.removeAttribute("readonly");
      input.focus();
      input.setSelectionRange(0, fullUrl.length);
      try {
        document.execCommand("copy");
        flashCopied();
      } catch {
        toast.error("Couldn't copy — long-press the URL to copy manually");
      }
      input.setAttribute("readonly", "");
    }
  };

  const share = async () => {
    if (!canShare) return;
    try {
      await navigator.share({
        title: "wordpinch",
        text: `Join my wordpinch room: ${roomCode}`,
        url: fullUrl,
      });
    } catch {
      // User cancelled or share failed — no-op (no error toast needed).
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet">
        <div className="pr-14">
          <DialogTitle className="text-[28px] leading-none font-extrabold">Invite a friend</DialogTitle>
          <DialogDescription className="mt-1 font-hand text-[26px] leading-tight text-foreground">
            they join with {roomCode}
          </DialogDescription>
        </div>

        <div className="flex gap-2">
          <Input
            ref={urlInputRef}
            variant="pill"
            readOnly
            value={fullUrl}
            aria-label="Room link"
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 bg-row text-base"
          />
          <Button
            variant="circle"
            size="circle"
            onClick={copy}
            aria-label={copied ? "Copied" : "Copy link"}
            className={`size-13 ${copied ? "bg-shape-sage text-[#141414] hover:bg-shape-sage" : "bg-row"}`}
          >
            <span className="relative inline-flex size-5 items-center justify-center">
              <Copy
                className={`absolute size-5 transition-all duration-200 ease-out motion-reduce:transition-none ${
                  copied ? "scale-75 opacity-0" : "scale-100 opacity-100"
                }`}
                aria-hidden
              />
              <Check
                className={`absolute size-5 transition-all duration-200 ease-out motion-reduce:transition-none ${
                  copied ? "scale-100 opacity-100" : "scale-75 opacity-0"
                }`}
                aria-hidden
              />
            </span>
          </Button>
        </div>

        {canShare ? (
          <Button variant="pill" size="pill-lg" onClick={share} className="w-full">
            Share via…
          </Button>
        ) : null}

        <div className="flex items-center gap-4 rounded-[26px] bg-shape-yellow p-3.5 text-[#141414]">
          <div className="shrink-0 overflow-hidden rounded-2xl bg-white p-1.5">
            <QR value={fullUrl} size={112} className="mt-0" />
          </div>
          <div>
            <div className="text-lg font-extrabold">Scan to join</div>
            <div className="font-hand text-[22px] leading-tight">or just shout the code across the room</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
