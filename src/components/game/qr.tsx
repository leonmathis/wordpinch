"use client";

import * as React from "react";
import QRCode from "qrcode";

type Props = {
  /** URL or text to encode. */
  value: string;
  /** Pixel size of the rendered QR (square). */
  size?: number;
};

/**
 * Real QR code rendered to canvas via the `qrcode` library.
 * Monochrome — uses current theme tokens for fg/bg.
 */
export function QR({ value, size = 140 }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Deliberately theme-independent: dark modules on a white field is what
    // camera scanners expect, and an inverted (light-on-dark) code fails on
    // many of them. This used to *try* to follow the theme by parsing
    // `oklch(...)` out of the CSS token — but Chrome returns those tokens as
    // `lab(...)`, so the parse always failed and the code silently fell back
    // to these same values. Now the choice is explicit instead of accidental.
    void QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    }).catch((err) => {
      console.warn("[QR] toCanvas failed", err);
    });
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      role="img"
      className="mx-auto block rounded-[6px]"
      style={{ marginTop: 18 }}
      aria-label={`QR code linking to ${value}`}
    />
  );
}
