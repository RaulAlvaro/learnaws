"use client";

import { audio } from "./sfx";

/**
 * Background chiptune music (Juhani Junkala, CC0) and short jingles (Kenney, CC0).
 * Web Audio buffers so loops are seamless. Kept quiet while reading a question, and
 * ducked while narration or the expert voice is talking. Starts only after a user gesture.
 */
export type Scene = "hub" | "round" | "result" | null;

const TRACKS = { title: "title", level1: "level1", level2: "level2", level3: "level3", ending: "ending" } as const;
type Track = keyof typeof TRACKS;
const JINGLES = { start: "round-start", complete: "round-complete", levelup: "level-up" } as const;
export type Jingle = keyof typeof JINGLES;

// Starting points (tune): reading needs quiet music, the hub can be livelier.
const SCENE_VOLUME: Record<Exclude<Scene, null>, number> = { hub: 0.28, round: 0.13, result: 0.26 };
const DUCKED = 0.2; // multiplier while speech plays
const FADE = 0.8;
const ROUND_TRACKS: Track[] = ["level1", "level2", "level3"];

let master: GainNode | null = null;
let current: { track: Track; src: AudioBufferSourceNode; gain: GainNode } | null = null;
let scene: Scene = null;
let roundIndex = -1; // the first round plays Level 1
const ducks = new Set<{ level: number }>();
const duckLevel = () => Math.min(1, ...[...ducks].map((d) => d.level));
let wired = false;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

export function musicOn(): boolean {
  try {
    return localStorage.getItem("music") !== "off";
  } catch {
    return true;
  }
}

export function setMusic(on: boolean) {
  try {
    localStorage.setItem("music", on ? "on" : "off");
  } catch {}
  if (on) apply();
  else stopCurrent();
}

function out(): GainNode | null {
  const a = audio();
  if (!a) return null;
  if (!master) {
    master = a.createGain();
    master.gain.value = duckLevel();
    master.connect(a.destination);
  }
  wire(a);
  return master;
}

/** Browsers block audio until a gesture: resume on the first tap, pause while the tab is hidden. */
function wire(a: AudioContext) {
  if (wired || typeof document === "undefined") return;
  wired = true;
  const unlock = () => {
    if (a.state === "suspended" && !document.hidden) void a.resume().then(apply);
  };
  document.addEventListener("pointerdown", unlock, { capture: true });
  document.addEventListener("keydown", unlock, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void a.suspend();
    else void a.resume();
  });
}

function load(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => audio()!.decodeAudioData(b))
      .catch(() => {
        buffers.delete(url);
        return null;
      });
    buffers.set(url, p);
  }
  return p;
}
const trackUrl = (t: Track) => `/audio/music/${TRACKS[t]}.mp3`;

/** Keep decoded audio small on phones: only the current and the next-needed track stay cached. */
function evict(keep: Track[]) {
  const urls = new Set(keep.map(trackUrl));
  for (const u of buffers.keys()) if (u.startsWith("/audio/music/") && !urls.has(u)) buffers.delete(u);
}

function trackFor(s: Exclude<Scene, null>): Track {
  if (s === "hub") return "title";
  if (s === "result") return "ending";
  return ROUND_TRACKS[roundIndex % ROUND_TRACKS.length];
}

/** Exposed on <html data-music> for playtests. */
function mark(track: Track | null) {
  if (typeof document !== "undefined") document.documentElement.dataset.music = track ?? "";
}

function stopCurrent() {
  mark(null);
  const a = audio();
  const c = current;
  current = null;
  if (!a || !c) return;
  c.gain.gain.cancelScheduledValues(a.currentTime);
  c.gain.gain.setValueAtTime(c.gain.gain.value, a.currentTime);
  c.gain.gain.linearRampToValueAtTime(0, a.currentTime + FADE);
  c.src.stop(a.currentTime + FADE + 0.05);
}

async function apply() {
  const s = scene;
  if (!s || !musicOn()) return stopCurrent();
  const m = out();
  const a = audio();
  if (!m || !a || a.state !== "running") return; // the unlock handler calls apply() again
  const track = trackFor(s);
  const volume = SCENE_VOLUME[s];
  if (current?.track === track) {
    current.gain.gain.setTargetAtTime(volume, a.currentTime, 0.3);
    return;
  }
  const buf = await load(trackUrl(track));
  if (!buf || scene !== s || trackFor(s) !== track || !musicOn()) return;
  if (current?.track === track) return; // a concurrent apply() already started it
  stopCurrent();
  const src = a.createBufferSource();
  src.buffer = buf;
  src.loop = track !== "ending";
  const gain = a.createGain();
  gain.gain.setValueAtTime(0, a.currentTime);
  gain.gain.linearRampToValueAtTime(volume, a.currentTime + FADE);
  src.connect(gain).connect(m);
  src.start();
  const mine = { track, src, gain };
  current = mine;
  mark(track);
  src.onended = () => {
    if (current === mine) {
      current = null;
      mark(null);
    }
  };
  evict([track, "title"]);
}

/** Set what the game is showing; each new round rotates to the next level track. */
export function setScene(next: Scene) {
  if (next === "round" && scene !== "round") roundIndex++;
  scene = next;
  void apply();
}

/** Lower the music while something speaks (0 = silent, e.g. a live voice call). Returns a release function. */
export function duck(level = DUCKED): () => void {
  const d = { level };
  ducks.add(d);
  setMaster();
  return () => {
    ducks.delete(d);
    setMaster();
  };
}

/** Duck whenever this audio element is playing (narration), including replays. */
export function duckWhilePlaying(el: HTMLMediaElement) {
  let release: (() => void) | null = null;
  const stop = () => {
    release?.();
    release = null;
  };
  el.addEventListener("play", () => {
    release ??= duck();
  });
  el.addEventListener("pause", stop);
  el.addEventListener("ended", stop);
  el.addEventListener("error", stop);
}

function setMaster() {
  const a = audio();
  if (!a || !master) return;
  master.gain.setTargetAtTime(duckLevel(), a.currentTime, 0.15);
}

/** Play a short jingle. Resolves false when it could not play (the caller falls back to synth SFX). */
export async function playJingle(name: Jingle, volume = 0.5): Promise<boolean> {
  const a = audio();
  const m = out();
  if (!a || !m || a.state !== "running") return false;
  const buf = await load(`/audio/jingles/${JINGLES[name]}.mp3`);
  if (!buf) return false;
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.value = volume;
  src.connect(g).connect(a.destination); // jingles are not ducked by the music master
  src.start();
  return true;
}

/** Warm the cache for the jingles so the first one plays on time. */
export function preloadJingles() {
  for (const j of Object.values(JINGLES)) void load(`/audio/jingles/${j}.mp3`);
}
