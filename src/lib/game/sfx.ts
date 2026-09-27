"use client";

import { playJingle, type Jingle } from "./music";

/**
 * Tiny synthesized SFX (Web Audio) — no asset files, no licences.
 * Short and soft by design: feedback, not noise. Errors are low and gentle, never punishing.
 */
type Sound = "correct" | "wrong" | "tap" | "streak" | "levelup" | "round" | "start";

// These moments use a recorded 8-bit jingle (Kenney, CC0) when it is loaded; synth otherwise.
const JINGLE_FOR: Partial<Record<Sound, Jingle>> = { round: "complete", levelup: "levelup", start: "start" };

let ctx: AudioContext | null = null;
export function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function soundOn(): boolean {
  try {
    return localStorage.getItem("sfx") !== "off";
  } catch {
    return true;
  }
}

export function setSound(on: boolean) {
  try {
    localStorage.setItem("sfx", on ? "on" : "off");
  } catch {}
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.12) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const PATTERNS: Record<Sound, () => void> = {
  tap: () => tone(660, 0, 0.05, "triangle", 0.05),
  correct: () => {
    tone(880, 0, 0.12, "triangle");
    tone(1320, 0.08, 0.18, "triangle");
  },
  wrong: () => {
    tone(220, 0, 0.18, "sine", 0.1);
    tone(185, 0.1, 0.22, "sine", 0.08);
  },
  streak: () => [660, 880, 1100].forEach((f, i) => tone(f, i * 0.07, 0.12, "triangle", 0.09)),
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.22, "triangle", 0.1)),
  round: () => [784, 988, 1175].forEach((f, i) => tone(f, i * 0.09, 0.2, "sine", 0.1)),
  start: () => [523, 784].forEach((f, i) => tone(f, i * 0.08, 0.14, "triangle", 0.08)),
};

const VIBRATION: Partial<Record<Sound, number | number[]>> = {
  correct: 30,
  wrong: [20, 40, 20],
  levelup: [30, 60, 30, 60, 60],
};

export function play(sound: Sound) {
  if (!soundOn()) return;
  try {
    const j = JINGLE_FOR[sound];
    if (j) void playJingle(j).then((ok) => ok || PATTERNS[sound]());
    else PATTERNS[sound]();
    const v = VIBRATION[sound];
    if (v && "vibrate" in navigator) navigator.vibrate(v);
  } catch {
    // audio can fail silently (autoplay policies); never break the game for it
  }
}
