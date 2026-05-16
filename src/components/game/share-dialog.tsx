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
import { QR } from "./qr";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomCode: string;
  url: string;
};

export function ShareDialog({ open, onOpenChange, roomCode, url }: Props) {
  const [copied, setCopied] = React.useState(false);
  const fullUrl = `https://${url}`;
  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    []
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
    } catch {
      /* ignore */
    }
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border border-border ring-0 sm:max-w-[360px] p-6">
        <DialogTitle className="text-[15px] font-medium">Share room</DialogTitle>
        <DialogDescription className="t-label mt-1">{roomCode}</DialogDescription>

        <div className="url-row mt-4">
          <Input
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

        <QR value={fullUrl} />

        <div className="t-label text-center mt-2.5">
          Scan to join — or share the link
        </div>
      </DialogContent>
    </Dialog>
  );
}
