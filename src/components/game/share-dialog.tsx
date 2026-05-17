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
      <DialogContent className="bg-background border border-border ring-0 sm:max-w-[360px] p-6">
        <DialogTitle className="text-[15px] font-medium">Share room</DialogTitle>
        <DialogDescription className="t-label mt-1">{roomCode}</DialogDescription>

        <div className="url-row mt-4">
          <Input
            ref={urlInputRef}
            readOnly
            value={fullUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-[13px] h-9 rounded-none border-0 bg-transparent px-3 focus-visible:ring-0 focus-visible:border-transparent flex-1 min-w-0"
          />
          <Button
            variant="ghost"
            onClick={copy}
            className="rounded-none border-l border-border h-9 px-3.5 text-[13px] font-normal"
          >
            {copied ? "copied" : "Copy"}
          </Button>
        </div>

        {canShare ? (
          <Button
            onClick={share}
            className="w-full h-9 rounded-[var(--radius)] text-[13px] font-medium mt-3"
          >
            Share via…
          </Button>
        ) : null}

        <QR value={fullUrl} />

        <div className="t-label text-center mt-2.5">
          Scan to join — or share the link
        </div>
      </DialogContent>
    </Dialog>
  );
}
