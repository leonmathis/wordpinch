"use client";

/**
 * Web Audio API synthesizer. Generates the 4 wordpinch sounds in-browser
 * without any audio files — keeps bundle size + licensing easy.
 *
 * Each call respects the "wordpinch:v1:muted" localStorage flag (read live so
 * a toggle takes effect immediately).
 */

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return _ctx;
}

function isMuted(): boolean {
  try {
    return window.localStorage.getItem("wordpinch:v1:muted") === "1";
  } catch {
    return false;
  }
}

type ToneOpts = {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
};

function playTone({
  freq,
  duration,
  type = "sine",
  gain = 0.18,
  attack = 0.005,
}: ToneOpts) {
  if (isMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;
  // Auto-resume — browsers suspend AudioContext until a user gesture.
  if (ctx.state === "suspended") void ctx.resume();

  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Short high blip — used during the 3-2-1 countdown. */
export function playTick() {
  playTone({ freq: 1200, duration: 0.06, type: "sine", gain: 0.16 });
}

/** Pleasing two-note chime — round win. */
export function playDing() {
  if (isMuted()) return;
  playTone({ freq: 880, duration: 0.18, type: "triangle", gain: 0.22 });
  setTimeout(
    () => playTone({ freq: 1318, duration: 0.32, type: "triangle", gain: 0.22 }),
    90
  );
}

/** Low square growl — rejected word. */
export function playBuzz() {
  playTone({ freq: 140, duration: 0.18, type: "square", gain: 0.12 });
}

/** Match-end chime — three rising notes. */
export function playChime() {
  if (isMuted()) return;
  const notes = [659, 880, 1175]; // E5, A5, D6
  notes.forEach((freq, i) => {
    setTimeout(
      () =>
        playTone({
          freq,
          duration: 0.4,
          type: "triangle",
          gain: 0.2,
        }),
      i * 130
    );
  });
}
