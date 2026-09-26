"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { highlight } from "@/lib/game/cues";
import { play } from "@/lib/game/sfx";
import type { PublicQuestion, Reveal } from "../question-view";

export type GameQuestionData = PublicQuestion & { cues: string[]; chips: { emoji: string; label: string }[] };

/** Kahoot-style option colours, always paired with a shape so colour is never the only cue. */
export const OPTION_STYLE = [
  { shape: "▲", bg: "bg-[#E23D4B]", ring: "ring-[#E23D4B]" },
  { shape: "◆", bg: "bg-[#2F6FEB]", ring: "ring-[#2F6FEB]" },
  { shape: "●", bg: "bg-[#C98A00]", ring: "ring-[#C98A00]" },
  { shape: "■", bg: "bg-[#1F9D55]", ring: "ring-[#1F9D55]" },
  { shape: "★", bg: "bg-[#7C4DDB]", ring: "ring-[#7C4DDB]" },
];

const CONFIDENCE = [
  { value: 1 as const, emoji: "😬", label: "Adivino", key: "q" },
  { value: 2 as const, emoji: "🙂", label: "Bastante", key: "w" },
  { value: 3 as const, emoji: "😎", label: "Seguro", key: "e" },
];

export interface AnswerOutcome {
  correct: boolean;
  xp: number;
  conceptId: string;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error");
  return data as T;
}

export function GameQuestion({
  question,
  mode,
  conceptTitle,
  autoRead,
  onAnswered,
  onNext,
}: {
  question: GameQuestionData;
  mode: string;
  conceptTitle?: string;
  autoRead: boolean;
  onAnswered: (o: AnswerOutcome) => void;
  onNext: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [spanish, setSpanish] = useState(false);
  const [usedSpanish, setUsedSpanish] = useState(false);
  const [phase, setPhase] = useState<"answering" | "wrong" | "revealed">("answering");
  const [result, setResult] = useState<{ attemptId: number; correct: boolean; xp: number } | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [firstPick, setFirstPick] = useState<string[]>([]);
  const [hints, setHints] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [shake, setShake] = useState(0);
  const started = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const need = question.answerCount;

  const stopAudio = () => audio.current?.pause();
  const speak = useCallback(
    (lang: "en" | "es") => {
      stopAudio();
      const a = new Audio(`/api/tts?ref=question:${encodeURIComponent(question.id)}&lang=${lang}`);
      audio.current = a;
      a.play().catch(() => {});
    },
    [question.id],
  );

  useEffect(() => {
    started.current = Date.now();
    if (autoRead) speak("en");
    return () => audio.current?.pause();
  }, [question.id, autoRead, speak]);

  const stem = spanish ? question.es.stem : question.stem;
  const options = spanish ? question.es.options : question.options;
  const parts = spanish ? [{ text: stem, hit: false }] : highlight(stem, question.cues);
  const ready = selected.length === need;

  function pick(id: string) {
    if (phase === "revealed") return;
    play("tap");
    if (need > 1) setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < need ? [...s, id] : s));
    else setSelected([id]);
  }

  async function submit(confidence: 1 | 2 | 3) {
    if (!ready || busy) return;
    stopAudio();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ attemptId: number; correct: boolean; xp: number; reveal: Reveal | null }>("/api/answer", {
        questionId: question.id,
        selected,
        confidence,
        timeMs: Date.now() - started.current,
        usedSpanish,
      });
      setResult(r);
      setFirstPick(selected);
      onAnswered({ correct: r.correct, xp: r.xp, conceptId: question.conceptId });
      if (r.correct) {
        play("correct");
        setReveal(r.reveal);
        setPhase("revealed");
      } else {
        play("wrong");
        setShake((s) => s + 1);
        setSelected([]);
        setPhase("wrong");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function askHint() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ hint: string }>("/api/tutor", { attemptId: result.attemptId, level: hints.length + 1 });
      setHints((h) => [...h, r.hint]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!result || !ready) return;
    setBusy(true);
    try {
      const r = await post<{ correct: boolean; reveal: Reveal }>("/api/answer", {
        questionId: question.id,
        selected,
        confidence: 1,
        timeMs: Date.now() - started.current,
        usedSpanish,
        retryOf: result.attemptId,
        hintLevel: Math.max(1, hints.length),
      });
      play(r.correct ? "correct" : "wrong");
      setReveal(r.reveal);
      setPhase("revealed");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function showAnswer() {
    if (!result) return;
    setBusy(true);
    try {
      const r = await post<{ reveal: Reveal }>("/api/reveal", { attemptId: result.attemptId });
      setReveal(r.reveal);
      setPhase("revealed");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Keyboard: 1–5 options, Q/W/E confidence, Enter next, R read aloud, T language.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      const idx = "12345".indexOf(k);
      if (idx >= 0 && options[idx]) pick(options[idx].id);
      const conf = CONFIDENCE.find((c) => c.key === k);
      if (conf && phase === "answering") void submit(conf.value);
      if (k === "enter" && phase === "revealed") onNext();
      if (k === "r") speak(spanish ? "es" : "en");
      if (k === "t") {
        setSpanish((s) => !s);
        setUsedSpanish(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const correctIds = reveal?.correctIds ?? [];
  const whyFor = (id: string) =>
    spanish ? reveal?.optionsEs.find((o) => o.id === id)?.why : reveal?.options.find((o) => o.id === id)?.why;

  return (
    <div className="space-y-4" style={{ fontSize: "calc(1rem * var(--fs, 1))" }}>
      <div className="flex flex-wrap items-center gap-2">
        {mode === "diagnostic" || mode === "pretest" ? (
          <span className="rounded-full bg-warn-bg px-3 py-1 text-[0.8em] font-medium text-warn">Prueba previa · está bien fallar</span>
        ) : mode === "review" ? (
          <span className="rounded-full bg-good-bg px-3 py-1 text-[0.8em] font-medium text-good">Repaso</span>
        ) : null}
        {question.chips.map((c) => (
          <span key={c.label} className="rounded-full border border-border bg-surface px-3 py-1 text-[0.8em]">
            {c.emoji} {c.label}
          </span>
        ))}
        {need > 1 && <span className="rounded-full bg-accent/15 px-3 py-1 text-[0.8em] font-semibold text-accent">Elige {need}</span>}
      </div>

      <motion.div
        key={shake}
        animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : {}}
        transition={{ duration: 0.35 }}
        className="rounded-2xl border border-border bg-surface p-4 sm:p-5"
      >
        <div className="mb-2 flex justify-end gap-2">
          <button onClick={() => speak(spanish ? "es" : "en")} className="rounded-full border border-border px-3 py-1 text-[0.8em] text-muted">
            🔊 Escuchar
          </button>
          <button
            onClick={() => {
              setSpanish((s) => !s);
              setUsedSpanish(true);
            }}
            className={`rounded-full border px-3 py-1 text-[0.8em] ${spanish ? "border-accent text-accent" : "border-border text-muted"}`}
          >
            {spanish ? "EN" : "ES"}
          </button>
        </div>
        <p className="text-[1.25em] leading-relaxed">
          {parts.map((p, i) =>
            p.hit ? (
              <mark key={i} className="rounded bg-accent/20 px-0.5 text-fg">
                {p.text}
              </mark>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </p>
      </motion.div>

      <div className={`grid gap-2.5 ${options.length === 2 ? "grid-cols-2" : ""}`}>
        {options.map((o, i) => {
          const s = OPTION_STYLE[i] ?? OPTION_STYLE[0];
          const sel = selected.includes(o.id);
          const isCorrect = correctIds.includes(o.id);
          const wasPicked = firstPick.includes(o.id);
          const dim = phase === "revealed" && !isCorrect && !wasPicked;
          const why = phase === "revealed" && showWhy ? whyFor(o.id) : null;
          return (
            <motion.button
              key={o.id}
              onClick={() => pick(o.id)}
              whileTap={{ scale: 0.97 }}
              animate={phase === "revealed" && isCorrect ? { scale: [1, 1.04, 1] } : {}}
              transition={{ duration: 0.25 }}
              className={`flex ${options.length === 2 ? "min-h-32 flex-col" : "min-h-14"} w-full items-stretch overflow-hidden rounded-2xl border-2 text-left transition ${
                phase === "revealed"
                  ? isCorrect
                    ? "border-good bg-good-bg"
                    : wasPicked
                      ? "border-bad bg-bad-bg"
                      : "border-border bg-surface"
                  : sel
                    ? `border-transparent bg-surface ring-4 ${s.ring}`
                    : phase === "wrong" && wasPicked
                      ? "border-border bg-surface opacity-50"
                      : "border-border bg-surface"
              } ${dim ? "opacity-60" : ""}`}
            >
              <span className={`flex ${options.length === 2 ? "h-10 w-full" : "w-12"} shrink-0 items-center justify-center text-[1.3em] text-white ${s.bg}`} aria-hidden>
                {s.shape}
              </span>
              <span className="flex-1 px-3 py-3">
                <span className="block text-[1.1em] leading-snug">{o.text}</span>
                {why && <span className="mt-1 block text-[0.85em] leading-snug text-muted">{why}</span>}
              </span>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {phase === "answering" && (
          <motion.div key="conf" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
            <p className="text-center text-[0.9em] text-muted">{ready ? "¿Qué tan seguro? (esto envía tu respuesta)" : need > 1 ? `Elige ${need} opciones` : "Elige una opción"}</p>
            <div className="grid grid-cols-3 gap-2">
              {CONFIDENCE.map((c) => (
                <button
                  key={c.value}
                  disabled={!ready || busy}
                  onClick={() => submit(c.value)}
                  className="rounded-2xl border-2 border-border bg-surface py-3 text-center transition enabled:hover:border-accent disabled:opacity-40"
                >
                  <div className="text-[1.6em] leading-none">{c.emoji}</div>
                  <div className="mt-1 text-[0.85em] font-medium">{c.label}</div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {phase === "wrong" && (
          <motion.div key="wrong" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 rounded-2xl bg-bad-bg p-4">
            <p className="font-semibold text-bad">Casi. {result?.xp && result.xp < 0 ? `(${result.xp} XP por decir “seguro”)` : ""}</p>
            {hints.map((h, i) => (
              <p key={i} className="rounded-xl bg-surface p-3 text-[0.95em] leading-relaxed">
                💡 {h}
              </p>
            ))}
            <div className="flex flex-wrap gap-2">
              {hints.length < 3 && (
                <button onClick={askHint} disabled={busy} className="rounded-xl bg-surface px-4 py-2.5 font-medium">
                  {busy ? "…" : hints.length ? "Otra pista" : "💡 Pista"}
                </button>
              )}
              {hints.length > 0 && (
                <button onClick={retry} disabled={busy || !ready} className="rounded-xl bg-accent px-4 py-2.5 font-medium text-accent-fg disabled:opacity-50">
                  Reintentar
                </button>
              )}
              <button onClick={showAnswer} disabled={busy} className="rounded-xl px-4 py-2.5 text-muted underline">
                Ver respuesta
              </button>
            </div>
          </motion.div>
        )}

        {phase === "revealed" && (
          <motion.div key="rev" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className={`flex items-center justify-between rounded-2xl p-4 ${result?.correct ? "bg-good-bg" : "bg-surface-2"}`}>
              <span className={`text-[1.2em] font-bold ${result?.correct ? "text-good" : ""}`}>
                {result?.correct ? "¡Correcto!" : "Así era"}
                {conceptTitle && <span className="block text-[0.7em] font-normal text-muted">{conceptTitle}</span>}
              </span>
              {!!result?.xp && result.xp > 0 && (
                <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-[1.3em] font-bold text-accent">
                  +{result.xp} XP
                </motion.span>
              )}
            </div>
            {showWhy ? (
              <p className="rounded-2xl bg-surface p-4 text-[1em] leading-relaxed">{spanish ? reveal?.explanationEs : reveal?.explanation}</p>
            ) : (
              <button onClick={() => setShowWhy(true)} className="w-full rounded-2xl border border-border py-3 text-muted">
                ¿Por qué? (explicación)
              </button>
            )}
            <button onClick={onNext} className="w-full rounded-2xl bg-accent py-4 text-[1.15em] font-bold text-accent-fg">
              Siguiente →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="break-words text-[0.9em] text-bad">
          {error}{" "}
          {/API key/.test(error) && (
            <a href="/settings#ia" className="underline">
              Ir a Ajustes
            </a>
          )}
        </p>
      )}
    </div>
  );
}
