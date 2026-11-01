"use client";

import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Share the result" (match) or "Share your pinch" (daily). */
  title: string;
  /** The server-drawn PNG; `?download=1` on it saves the file. */
  card: string;
  filename: string;
  /** The link "Share…" sends when the browser can't share the file. */
  link: string;
  /** Read out instead of the picture ("Leon beat Juno 4 to 3"). */
  alt: string;
};

/**
 * F5 share sheet: a card drawn on the server (1080×1350) with "Save
 * image" and "Share…". Share sends the picture itself where the browser
 * can (phones), else the link, else copies it. The match card (match end)
 * and the daily card (F6) both use it.
 */
export function ShareResultDialog({ open, onOpenChange, title, card, filename, link, alt }: Props) {
  // Bust the browser cache per opening: the card follows the game.
  const [stamp] = React.useState(() => Date.now());
  const src = `${card}?v=${stamp}`;
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await fetch(src).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "wordpinch", text: alt });
        return;
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "wordpinch", text: alt, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      toast.success("Link copied", { duration: 1500 });
    } catch (err) {
      // Dismissing the system sheet rejects with AbortError: not a failure.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast.error("Couldn't share. Try Save image instead.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet">
        <div className="pr-14">
          <DialogTitle className="text-2xl leading-none font-extrabold">{title}</DialogTitle>
          <DialogDescription className="sr-only">{alt}</DialogDescription>
        </div>

        <figure className="mx-auto my-0">
          {failed ? (
            <div className="flex aspect-[4/5] w-[min(288px,70vw)] items-center justify-center rounded-3xl bg-row p-6 text-center text-sm font-semibold text-muted-foreground">
              The picture didn&apos;t load. Save image still tries again.
            </div>
          ) : (
            // A server-drawn PNG, not a static asset: next/image adds nothing here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt}
              width={288}
              height={360}
              onError={() => setFailed(true)}
              className="aspect-[4/5] h-auto w-[min(288px,70vw)] rounded-3xl bg-shape-blue shadow-[0_10px_30px_rgba(0,0,0,0.15)]"
            />
          )}
        </figure>

        <div className="grid grid-cols-2 gap-2.5">
          <a
            href={`${card}?download=1`}
            download={filename}
            className={cn(buttonVariants({ variant: "pill-soft", size: "pill-lg" }), "bg-row px-4")}
          >
            Save image
          </a>
          <Button variant="pill" size="pill-lg" className="px-4" disabled={busy} onClick={() => void share()}>
            {busy ? "Sharing…" : "Share…"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
