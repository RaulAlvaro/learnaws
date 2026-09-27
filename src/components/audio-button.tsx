"use client";

import { useEffect, useRef, useState } from "react";
import { duckWhilePlaying } from "@/lib/game/music";

/** Plays server-side TTS for a content ref. The audio is generated once and cached. */
export function AudioButton({ src: contentRef, lang, label }: { src: string; lang: "en" | "es"; label?: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");

  // Parents remount this (key) when the content or language changes.
  useEffect(() => () => audio.current?.pause(), []);

  async function toggle() {
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    if (!audio.current) {
      setState("loading");
      const a = new Audio(`/api/tts?ref=${encodeURIComponent(contentRef)}&lang=${lang}`);
      a.onended = () => setState("idle");
      a.onerror = () => setState("error");
      a.oncanplay = () => setState((s) => (s === "loading" ? "playing" : s));
      duckWhilePlaying(a);
      audio.current = a;
    }
    try {
      await audio.current.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:text-fg"
      aria-label="Escuchar"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        {state === "playing" ? <path d="M9 6v12M15 6v12" /> : <path d="M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />}
      </svg>
      {state === "loading" ? "Cargando…" : state === "error" ? "Error" : (label ?? (lang === "en" ? "Escuchar" : "Escuchar ES"))}
    </button>
  );
}
