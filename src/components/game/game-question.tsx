"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { highlight } from "@/lib/game/cues";
import { play } from "@/lib/game/sfx";
import type { Chip } from "@/lib/game/cues";
import type { PublicQuestion, Reveal } from "../question-view";
import { GameIcon, type GameIconName } from "./icons";

export type GameQuestionData = PublicQuestion & { cues: string[]; chips: Chip[] };

/** Answer colours, always paired with a drawn shape so colour is never the only cue. */
export const OPTION_STYLE = [
  { fill: "bg-red", shape: "tri" },
  { fill: "bg-blue", shape: "dia" },
  { fill: "bg-amber", shape: "cir" },
  { fill: "bg-green", shape: "sqr" },
  { fill: "bg-[#7c4ddb]", shape: "star" },
] as const;

const SHAPE_CLIP: Record<string, string> = {
  tri: "polygon(50% 6%, 96% 92%, 4% 92%)",
  dia: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
  cir: "circle(48% at 50% 50%)",
  sqr: "inset(8% round 3px)",
  star: "polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)",
};

export function Shape({ kind, className = "" }: { kind: string; className?: string }) {
  return <span aria-hidden className={`inline-block h-6 w-6 shrink-0 bg-white ${className}`} style={{ clipPath: SHAPE_CLIP[kind] }} />;
}

const CONFIDENCE: { value: 1 | 2 | 3; icon: GameIconName; label: string; key: string }[] = [
  { value: 1, icon: "dice-eight-faces-eight", label: "Adivino", key: "q" },
  { value: 2, icon: "thumb-up", label: "Bastante", key: "w" },
  { value: 3, icon: "on-target", label: "Seguro", key: "e" },
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
  const reduce = useReducedMotion();
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
  const two = options.length === 2;

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
  const tag =
    mode === "diagnostic" || mode === "pretest" ? "Prueba previa" : mode === "review" ? "Repaso" : mode === "interleave" ? "Mezcla" : null;

  return (
    <div className="space-y-4" style={{ fontSize: "calc(1rem * var(--fs, 1))" }}>
      <div className="flex flex-wrap items-center gap-2">
        {tag && <span className="display rounded-full bg-ink px-3 py-1 text-[0.85em] text-yellow">{tag}</span>}
        {question.chips.map((c) => (
          <span key={c.label} className="chunk-sm flex items-center gap-1.5 !rounded-full px-3 py-1 text-[0.8em] font-extrabold !shadow-none">
            <GameIcon name={c.icon} size={15} /> {c.label}
          </span>
        ))}
        {need > 1 && <span className="display rounded-full bg-yellow px-3 py-1 text-[0.85em] text-ink ring-2 ring-ink">Elige {need}</span>}
      </div>

      <motion.div
        key={shake}
        animate={shake && !reduce ? { x: [0, -9, 9, -6, 6, 0] } : {}}
        transition={{ duration: 0.35 }}
        className="chunk p-4 sm:p-5"
      >
        <div className="mb-2 flex justify-end gap-2">
          <button onClick={() => speak(spanish ? "es" : "en")} aria-label="Escuchar la pregunta" className="press chunk-sm flex h-10 w-10 items-center justify-center !shadow-[0_3px_0_var(--ink)]">
            <GameIcon name="speaker" size={20} />
          </button>
          <button
            onClick={() => {
              setSpanish((s) => !s);
              setUsedSpanish(true);
            }}
            aria-label={spanish ? "Ver en inglés" : "Ver en español"}
            className={`press chunk-sm display h-10 min-w-10 px-2 text-[0.95em] ${spanish ? "!bg-yellow" : ""}`}
          >
            {spanish ? "EN" : "ES"}
          </button>
        </div>
        <p className="text-[1.22em] font-bold leading-relaxed">
          {parts.map((p, i) =>
            p.hit ? (
              <mark key={i} className="rounded-md bg-yellow/60 px-0.5 text-ink">
                {p.text}
              </mark>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </p>
      </motion.div>

      <div className={`grid gap-3 ${two ? "grid-cols-2" : ""}`}>
        {options.map((o, i) => {
          const s = OPTION_STYLE[i] ?? OPTION_STYLE[0];
          const sel = selected.includes(o.id);
          const isCorrect = correctIds.includes(o.id);
          const wasPicked = firstPick.includes(o.id);
          const revealed = phase === "revealed";
          const fill = revealed ? (isCorrect ? "bg-green" : wasPicked ? "bg-red" : `${s.fill} opacity-45`) : s.fill;
          const why = revealed && showWhy ? whyFor(o.id) : null;
          return (
            <motion.button
              key={o.id}
              onClick={() => pick(o.id)}
              animate={revealed && isCorrect && !reduce ? { y: [0, -6, 0] } : {}}
              transition={{ duration: 0.3 }}
              className={`press flex w-full rounded-2xl border-[3px] border-ink text-left text-white shadow-[0_5px_0_var(--ink)] ${fill} ${
                two ? "min-h-36 flex-col items-center justify-center gap-3 p-4 text-center" : "min-h-16 items-center gap-3 px-4 py-3"
              } ${sel ? "ring-4 ring-white ring-offset-2 ring-offset-[var(--field)]" : ""} ${phase === "wrong" && wasPicked ? "opacity-45" : ""}`}
            >
              {revealed && (isCorrect || wasPicked) ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-ink">
                  <GameIcon name={isCorrect ? "check-mark" : "cross-mark"} size={18} />
                </span>
              ) : (
                <Shape kind={s.shape} />
              )}
              <span className="flex-1">
                <span className={`block font-extrabold leading-snug [text-shadow:0_1px_0_rgb(0_0_0_/_0.25)] ${two ? "text-[1.2em]" : "text-[1.08em]"}`}>{o.text}</span>
                {why && <span className="mt-1 block text-[0.85em] font-bold leading-snug text-white/90">{why}</span>}
              </span>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {phase === "answering" && (
          <motion.div key="conf" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
            <p className="text-center text-[0.95em] font-extrabold text-white">
              {ready ? "¿Qué tan seguro estás? Esto envía tu respuesta" : need > 1 ? `Elige ${need} opciones` : "Elige una opción"}
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {CONFIDENCE.map((c) => (
                <button
                  key={c.value}
                  disabled={!ready || busy}
                  onClick={() => submit(c.value)}
                  className="press chunk-sm flex flex-col items-center gap-1 py-3 disabled:opacity-50"
                >
                  <GameIcon name={c.icon} size={28} />
                  <span className="text-[0.9em] font-black">{c.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {phase === "wrong" && (
          <motion.div key="wrong" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="chunk space-y-3 !bg-bad-bg p-4">
            <p className="display flex items-center gap-2 text-[1.35em] text-red">
              <GameIcon name="cross-mark" size={22} /> ¡Casi!
              {!!result?.xp && result.xp < 0 && <span className="font-sans text-[0.6em] font-extrabold text-ink">{result.xp} XP por decir “seguro”</span>}
            </p>
            {hints.map((h, i) => (
              <p key={i} className="flex gap-2 rounded-xl border-2 border-ink bg-card p-3 text-[0.98em] font-bold leading-relaxed">
                <GameIcon name="light-bulb" size={20} className="mt-0.5 shrink-0 text-amber" />
                {h}
              </p>
            ))}
            <div className="flex flex-wrap gap-2">
              {hints.length < 3 && (
                <button onClick={askHint} disabled={busy} className="press chunk-sm flex items-center gap-2 px-4 py-2.5 font-extrabold">
                  <GameIcon name="light-bulb" size={18} />
                  {busy ? "Pensando" : hints.length ? "Otra pista" : "Pista"}
                </button>
              )}
              {hints.length > 0 && (
                <button onClick={retry} disabled={busy || !ready} className="press chunk-sm !bg-yellow px-4 py-2.5 font-extrabold disabled:opacity-50">
                  Reintentar
                </button>
              )}
              <button onClick={showAnswer} disabled={busy} className="px-3 py-2.5 font-extrabold underline decoration-2 underline-offset-4">
                Ver respuesta
              </button>
            </div>
          </motion.div>
        )}

        {phase === "revealed" && (
          <motion.div key="rev" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className={`chunk flex items-center justify-between p-4 ${result?.correct ? "!bg-green-bg" : ""}`}>
              <span>
                <span className={`display block text-[1.5em] leading-none ${result?.correct ? "text-green" : ""}`}>
                  {result?.correct ? "¡Correcto!" : "Así era"}
                </span>
                {conceptTitle && <span className="mt-1 block text-[0.8em] font-bold text-muted">{conceptTitle}</span>}
              </span>
              {!!result?.xp && result.xp > 0 && (
                <motion.span
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="display flex items-center gap-1 rounded-full border-[3px] border-ink bg-yellow px-3 py-1 text-[1.2em]"
                >
                  <GameIcon name="focused-lightning" size={18} />+{result.xp}
                </motion.span>
              )}
            </div>
            {showWhy ? (
              <p className="chunk p-4 text-[1em] font-bold leading-relaxed">{spanish ? reveal?.explanationEs : reveal?.explanation}</p>
            ) : (
              <button onClick={() => setShowWhy(true)} className="press chunk-sm flex w-full items-center justify-center gap-2 py-3 font-extrabold">
                <GameIcon name="open-book" size={20} /> ¿Por qué?
              </button>
            )}
            <button onClick={onNext} className="press chunk display w-full !bg-yellow py-4 text-[1.5em]">
              Siguiente
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p className="chunk-sm break-words !bg-bad-bg p-3 text-[0.92em] font-bold">
          {error}{" "}
          {/API key/.test(error) && (
            <a href="/settings#ia" className="underline decoration-2">
              Ir a Ajustes
            </a>
          )}
        </p>
      )}
    </div>
  );
}
