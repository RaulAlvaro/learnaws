"use client";

import Link from "next/link";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { ConceptCard, type CardBody } from "@/components/concept-card";
import { GameQuestion, type GameQuestionData } from "@/components/game/game-question";
import { play, setSound, soundOn } from "@/lib/game/sfx";

const ROUND_SIZE = 8;

interface GameState {
  totalXp: number;
  todayXp: number;
  level: number;
  into: number;
  needed: number;
  roundsToday: number;
  goal: number;
  streak: number;
  freezeUsed: boolean;
  dueNow: number;
}
interface ConceptMeta {
  id: string;
  title: string;
  titleEs: string;
}
type Item =
  | { kind: "card"; reason: "new" | "relearn"; concept: ConceptMeta; card: { en: CardBody; es: CardBody; docs: string[] } | null }
  | { kind: "question"; mode: string; question: GameQuestionData; concept?: ConceptMeta }
  | { kind: "done" };

function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setV(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };
  return [v, set];
}

async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  return res.json() as Promise<T>;
}

export function PlayClient() {
  const [state, setState] = useState<GameState | null>(null);
  const [view, setView] = useState<"hub" | "round" | "result">("hub");
  const [item, setItem] = useState<Item | null>(null);
  const [results, setResults] = useState<{ correct: boolean; xp: number; concept?: string }[]>([]);
  const [startLevel, setStartLevel] = useState(1);
  const [answeredCurrent, setAnsweredCurrent] = useState(false);
  const [itemSeq, setItemSeq] = useState(0);
  const [autoRead, setAutoRead] = usePref("autoRead", true);
  const [fs, setFs] = usePref("fs", 1);
  const [sfx, setSfx] = useState(() => soundOn());

  useEffect(() => {
    document.documentElement.style.setProperty("--fs", String(fs));
  }, [fs]);

  const loadState = useCallback(() => getJSON<GameState>("/api/game").then(setState), []);
  useEffect(() => {
    loadState();
  }, [loadState]);

  const loadItem = useCallback(async () => {
    const it = await getJSON<Item>("/api/session");
    setAnsweredCurrent(false);
    setItemSeq((n) => n + 1);
    setItem(it);
    window.scrollTo({ top: 0 });
    return it;
  }, []);

  async function startRound() {
    play("tap");
    setResults([]);
    setStartLevel(state?.level ?? 1);
    setView("round");
    await loadItem();
  }

  async function finishRound() {
    const s = await getJSON<GameState>("/api/game", { method: "POST" });
    setState(s);
    play(s.level > startLevel ? "levelup" : "round");
    setView("result");
  }

  async function next() {
    await fetch("/api/session/advance", { method: "POST" });
    const answered = results.length;
    if (answered >= ROUND_SIZE) return finishRound();
    const it = await loadItem();
    // Session exhausted mid-round → close the round with what was played.
    if (it.kind === "done" && answered > 0) await finishRound();
  }

  if (!state) return <p className="p-6 text-center text-muted">Cargando…</p>;

  if (view === "round") {
    return (
      <div className="space-y-4">
        <RoundHud results={results} onExit={() => (results.length ? finishRound() : setView("hub"))} />
        {item?.kind === "card" && item.card && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="text-center text-sm font-semibold uppercase tracking-wide text-accent">
              {item.reason === "new" ? "✨ Descubre" : "🔁 Repasa"}
            </div>
            <ConceptCard conceptId={item.concept.id} title={item.concept.title} titleEs={item.concept.titleEs} card={item.card} />
            <button onClick={next} className="w-full rounded-2xl bg-accent py-4 text-lg font-bold text-accent-fg">
              ¡Entendido, a jugar!
            </button>
          </motion.div>
        )}
        {item?.kind === "question" && (
          <GameQuestion
            key={`${item.question.id}-${itemSeq}`}
            question={item.question}
            mode={item.mode}
            conceptTitle={item.concept?.titleEs}
            autoRead={autoRead}
            onAnswered={(o) => {
              if (answeredCurrent) return;
              setAnsweredCurrent(true);
              setResults((r) => {
                const nextR = [...r, { correct: o.correct, xp: o.xp, concept: item.concept?.titleEs }];
                const streak = nextR.slice(-3).every((x) => x.correct) && nextR.length >= 3;
                if (streak && o.correct) setTimeout(() => play("streak"), 350);
                return nextR;
              });
            }}
            onNext={next}
          />
        )}
        {item?.kind === "done" && results.length === 0 && (
          <div className="space-y-4 rounded-2xl bg-surface p-6 text-center">
            <div className="text-4xl">🎉</div>
            <p className="text-lg font-semibold">¡Completaste todo lo de hoy!</p>
            <p className="text-muted">Lo que viste vuelve justo cuando estés por olvidarlo. Parar ahora también es parte del método.</p>
            <button
              onClick={async () => {
                await fetch("/api/session/extend", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ minutes: 15 }),
                });
                await loadItem();
              }}
              className="w-full rounded-2xl border border-border py-3"
            >
              Quiero 15 min más
            </button>
            <button onClick={() => setView("hub")} className="w-full rounded-2xl bg-accent py-3 font-bold text-accent-fg">
              Volver
            </button>
          </div>
        )}
      </div>
    );
  }

  if (view === "result") {
    const correct = results.filter((r) => r.correct).length;
    const xp = results.reduce((s, r) => s + r.xp, 0);
    const learned = [...new Set(results.filter((r) => r.correct && r.concept).map((r) => r.concept!))].slice(0, 4);
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4 text-center">
        <div className="rounded-3xl bg-surface p-6">
          <div className="text-5xl">{correct / Math.max(1, results.length) >= 0.75 ? "🏆" : correct > 0 ? "💪" : "🌱"}</div>
          <div className="mt-2 text-sm uppercase tracking-wide text-muted">Ronda completa</div>
          <div className="mt-1 text-4xl font-bold tabular-nums">
            {correct}/{results.length}
          </div>
          <div className="mt-2 text-2xl font-bold text-accent">
            <CountUp to={xp} /> XP
          </div>
          {state.level > startLevel && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mt-3 rounded-2xl bg-accent/15 p-3 font-bold text-accent">
              ⬆️ ¡Subiste a nivel {state.level}!
            </motion.div>
          )}
          {learned.length > 0 && (
            <div className="mt-4 text-left text-sm">
              <div className="mb-1 text-muted">Reforzaste:</div>
              <ul className="space-y-1">
                {learned.map((c) => (
                  <li key={c}>✅ {c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DailyGoal done={state.roundsToday} goal={state.goal} />
        <button onClick={startRound} className="w-full rounded-2xl bg-accent py-4 text-xl font-bold text-accent-fg">
          Otra ronda ▶
        </button>
        <button onClick={() => setView("hub")} className="w-full rounded-2xl border border-border py-3">
          Terminar por ahora
        </button>
      </motion.div>
    );
  }

  // Hub
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-surface p-3">
          <div className="text-2xl">🔥</div>
          <div className="text-xl font-bold tabular-nums">{state.streak}</div>
          <div className="text-xs text-muted">{state.freezeUsed ? "racha (comodín usado)" : "días de racha"}</div>
        </div>
        <div className="rounded-2xl bg-surface p-3">
          <div className="text-2xl">⭐</div>
          <div className="text-xl font-bold tabular-nums">Nv {state.level}</div>
          <div className="mx-auto mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(state.into / state.needed) * 100}%` }} />
          </div>
        </div>
        <div className="rounded-2xl bg-surface p-3">
          <div className="text-2xl">🔁</div>
          <div className="text-xl font-bold tabular-nums">{state.dueNow}</div>
          <div className="text-xs text-muted">repasos hoy</div>
        </div>
      </div>

      <DailyGoal done={state.roundsToday} goal={state.goal} />

      <motion.button
        whileTap={{ scale: 0.96 }}
        whileHover={{ scale: 1.02 }}
        onClick={startRound}
        className="flex w-full flex-col items-center justify-center rounded-[2rem] bg-accent py-10 text-accent-fg shadow-lg"
      >
        <span className="text-5xl">▶</span>
        <span className="mt-2 text-3xl font-extrabold tracking-tight">Jugar</span>
        <span className="mt-1 text-sm opacity-90">Ronda de {ROUND_SIZE} · ~4 min</span>
      </motion.button>

      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <button
          onClick={() => setAutoRead(!autoRead)}
          className={`rounded-full border px-3 py-1.5 ${autoRead ? "border-accent text-accent" : "border-border text-muted"}`}
        >
          🔊 Leer en voz alta: {autoRead ? "sí" : "no"}
        </button>
        <button
          onClick={() => {
            setSound(!sfx);
            setSfx(!sfx);
          }}
          className={`rounded-full border px-3 py-1.5 ${sfx ? "border-accent text-accent" : "border-border text-muted"}`}
        >
          🎵 Sonidos: {sfx ? "sí" : "no"}
        </button>
        <button onClick={() => setFs(fs >= 1.3 ? 1 : Math.round((fs + 0.15) * 100) / 100)} className="rounded-full border border-border px-3 py-1.5">
          Aa {Math.round(fs * 100)}%
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Link href="/progress" className="rounded-2xl bg-surface p-3 text-center">
          📈 Mi progreso
        </Link>
        <Link href="/voice" className="rounded-2xl bg-surface p-3 text-center">
          🎧 Repaso por voz
        </Link>
      </div>
      <p className="text-center text-xs text-muted">XP de hoy: {state.todayXp} · total {state.totalXp}</p>
    </div>
  );
}

function RoundHud({ results, onExit }: { results: { correct: boolean }[]; onExit: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onExit} aria-label="Salir de la ronda" className="rounded-full px-2 text-2xl text-muted">
        ×
      </button>
      <div className="flex flex-1 gap-1.5">
        {Array.from({ length: ROUND_SIZE }, (_, i) => {
          const r = results[i];
          return (
            <motion.div
              key={i}
              initial={false}
              animate={{ scaleY: r ? [1, 1.6, 1] : 1 }}
              className={`h-2.5 flex-1 rounded-full ${r ? (r.correct ? "bg-good" : "bg-bad") : i === results.length ? "bg-accent/40" : "bg-surface-2"}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function DailyGoal({ done, goal }: { done: number; goal: number }) {
  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-semibold">Meta de hoy</span>
        <span className="tabular-nums text-muted">
          {Math.min(done, goal)}/{goal} rondas {done >= goal ? "✅" : ""}
        </span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: goal }, (_, i) => (
          <div key={i} className={`h-3 flex-1 rounded-full ${i < done ? "bg-accent" : "bg-surface-2"}`} />
        ))}
      </div>
    </div>
  );
}

function CountUp({ to }: { to: number }) {
  const v = useMotionValue(0);
  const rounded = useTransform(v, (x) => Math.round(x));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const c = animate(v, to, { duration: 0.8, ease: "easeOut" });
    const unsub = rounded.on("change", setShown);
    return () => {
      c.stop();
      unsub();
    };
  }, [to, v, rounded]);
  return <AnimatePresence>{<span className="tabular-nums">{shown}</span>}</AnimatePresence>;
}
