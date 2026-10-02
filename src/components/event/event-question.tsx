"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { OPTION_STYLE, Shape } from "@/components/game/game-question";
import { GameIcon } from "@/components/game/icons";
import { play } from "@/lib/game/sfx";

export interface EventQuestionData {
  index: number;
  total: number;
  id: string;
  seconds: number;
  remainingMs: number;
  stem: { en: string; es: string };
  options: { id: string; en: string; es: string }[];
}

export interface EventAnswer {
  correct: boolean;
  timedOut: boolean;
  correctId: string;
  points: number;
  score: number;
  done: boolean;
  explanation: string;
}

/** One timed, Kahoot-style question. The deadline is the server's; the bar is only a visual. */
export function EventQuestion({
  slug,
  q,
  score,
  onAnswered,
  onNext,
}: {
  slug: string;
  q: EventQuestionData;
  score: number;
  onAnswered: (a: EventAnswer) => void;
  onNext: () => void;
}) {
  const reduce = useReducedMotion();
  const [english, setEnglish] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState<EventAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(Math.ceil(q.remainingMs / 1000));
  const sent = useRef(false);
  const deadline = useRef(0);

  async function submit(choice: string | null) {
    if (sent.current) return;
    sent.current = true;
    setLocked(true);
    setChosen(choice);
    play(choice ? "tap" : "wrong");
    try {
      const res = await fetch(`/api/events/${slug}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: q.id, choice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo registrar la respuesta");
      setResult(data);
      play(data.correct ? "correct" : "wrong");
      onAnswered(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    deadline.current = Date.now() + q.remainingMs;
    const t = setInterval(() => {
      const ms = deadline.current - Date.now();
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      if (ms <= 0) {
        clearInterval(t);
        void submit(null);
      }
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id]);

  const answered = result !== null;
  const text = (o: { en: string; es: string }) => (english ? o.en : o.es);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="chunk-sm display px-3 py-1.5 text-lg">
          {q.index + 1}/{q.total}
        </span>
        <div className="chunk-sm relative h-5 flex-1 overflow-hidden !rounded-full !p-0">
          {!answered && (
            <motion.div
              className={`absolute inset-y-0 left-0 ${left <= 5 ? "bg-red" : "bg-yellow"}`}
              initial={{ width: `${(q.remainingMs / (q.seconds * 1000)) * 100}%` }}
              animate={{ width: "0%" }}
              transition={{ duration: q.remainingMs / 1000, ease: "linear" }}
            />
          )}
        </div>
        <span className="chunk-sm display flex h-11 w-11 items-center justify-center !rounded-full text-xl tabular-nums">{answered ? "–" : left}</span>
      </div>

      <div className="chunk relative p-5">
        <button
          onClick={() => setEnglish(!english)}
          className="press chunk-sm absolute right-3 top-3 px-2.5 py-1 text-xs font-black"
          aria-label={english ? "Ver en español" : "Ver en inglés"}
        >
          {english ? "ES" : "EN"}
        </button>
        <p className="display pr-10 text-[1.6rem] leading-tight">{text(q.stem)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {q.options.map((o, i) => {
          const s = OPTION_STYLE[i];
          const isRight = answered && o.id === result.correctId;
          const isMine = chosen === o.id;
          const faded = answered && !isRight && !isMine;
          const fill = !answered ? s.fill : isRight ? "bg-green" : isMine ? "bg-red" : s.fill;
          return (
            <motion.button
              key={o.id}
              disabled={locked}
              onClick={() => submit(o.id)}
              animate={reduce ? undefined : { scale: isRight ? 1.04 : 1, opacity: faded ? 0.45 : 1 }}
              className={`press relative flex min-h-28 flex-col items-start justify-between gap-2 rounded-2xl border-[3px] border-ink p-3.5 text-left text-white shadow-[0_5px_0_var(--ink)] ${fill}`}
            >
              <span className="flex w-full items-center justify-between">
                <Shape kind={s.shape} />
                {answered && (isRight || isMine) && (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-ink">
                    <GameIcon name={isRight ? "check-mark" : "cross-mark"} size={18} />
                  </span>
                )}
              </span>
              <span className="text-lg font-black leading-tight">{text(o)}</span>
            </motion.button>
          );
        })}
      </div>

      {error && <p className="chunk-sm bg-bad-bg p-3 text-sm font-bold">{error}</p>}

      {result && (
        <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="chunk space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className={`display text-2xl ${result.correct ? "text-green" : "text-red"}`}>
              {result.correct ? "¡Correcto!" : result.timedOut ? "Se acabó el tiempo" : "Incorrecto"}
            </span>
            <span className="display text-2xl tabular-nums">+{result.points}</span>
          </div>
          <p className="text-sm font-bold leading-relaxed text-muted">{result.explanation}</p>
          <button onClick={onNext} className="press chunk-sm display w-full !bg-yellow py-3 text-xl" autoFocus>
            {result.done ? "Ver mi resultado" : "Siguiente"}
          </button>
        </motion.div>
      )}

      <p className="text-center text-sm font-extrabold text-white/85">Puntos: {score}</p>
    </div>
  );
}
