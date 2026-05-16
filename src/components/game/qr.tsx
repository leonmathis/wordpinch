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
    // Use CSS oklch tokens for colors by reading the computed style.
    // The qrcode lib only accepts hex / rgba colors, so we resolve them here.
    const root = window.getComputedStyle(document.documentElement);
    const fg = root.getPropertyValue("--foreground").trim() || "#000";
    const bg = root.getPropertyValue("--background").trim() || "#fff";

    void QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: {
        // Browsers accept oklch() values in canvas fillStyle on modern engines.
        // Fall back to high-contrast hex if oklch() fails.
        dark: oklchToHex(fg) ?? "#000000",
        light: oklchToHex(bg) ?? "#ffffff",
      },
    }).catch((err) => {
      console.warn("[QR] toCanvas failed", err);
    });
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="mx-auto block"
      style={{ marginTop: 18 }}
      aria-label={`QR code for ${value}`}
    />
  );
}

/**
 * Quick oklch → hex fallback so the QR lib (which only accepts hex/rgb) has a
 * valid color even though our tokens are in oklch().
 *   oklch(1 0 0)     → #ffffff
 *   oklch(0.145 0 0) → #252525-ish
 */
function oklchToHex(oklch: string): string | null {
  const match = oklch.match(/oklch\(\s*([\d.]+)/);
  if (!match) return null;
  const l = parseFloat(match[1]);
  // For our greyscale palette, L maps roughly linearly to brightness.
  const v = Math.round(Math.max(0, Math.min(1, l)) * 255);
  const h = v.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}
