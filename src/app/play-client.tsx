"use client";

import Link from "next/link";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConceptCard, type CardBody } from "@/components/concept-card";
import { Discover } from "@/components/game/discover";
import { GameQuestion, type GameQuestionData } from "@/components/game/game-question";
import { GameIcon, type GameIconName } from "@/components/game/icons";
import type { Island, ServiceUnit, UnitOverview } from "@/lib/content/types";
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
  | { kind: "discover"; unit: ServiceUnit; island: Island | null; overview: UnitOverview | null }
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
  const advancing = useRef(false);
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
    // Ignore double taps: advancing twice would skip an item.
    if (advancing.current) return;
    advancing.current = true;
    try {
      await fetch("/api/session/advance", { method: "POST" });
      const answered = results.length;
      if (answered >= ROUND_SIZE) return await finishRound();
      const it = await loadItem();
      // Session exhausted mid-round → close the round with what was played.
      if (it.kind === "done" && answered > 0) await finishRound();
    } finally {
      advancing.current = false;
    }
  }

  if (!state) return <HubSkeleton />;

  if (view === "round") {
    return (
      <div className="space-y-4">
        <RoundHud results={results} onExit={() => (results.length ? finishRound() : setView("hub"))} />
        {item?.kind === "discover" && item.overview && (
          <Discover key={item.unit.id} unit={item.unit} island={item.island} overview={item.overview} autoRead={autoRead} onDone={next} />
        )}
        {item?.kind === "discover" && !item.overview && <SkipEffect onSkip={next} />}
        {item?.kind === "card" && item.card && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="display flex items-center justify-center gap-2 text-2xl text-white [text-shadow:0_3px_0_var(--ink)]">
              <GameIcon name={item.reason === "new" ? "gift-of-knowledge" : "cycle"} size={26} />
              {item.reason === "new" ? "Nueva ficha" : "Repasa la ficha"}
            </div>
            <ConceptCard conceptId={item.concept.id} title={item.concept.title} titleEs={item.concept.titleEs} card={item.card} />
            <button onClick={next} className="press chunk display w-full !bg-yellow py-4 text-2xl">
              A jugar
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
          <div className="chunk space-y-4 p-6 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-ink bg-yellow">
              <GameIcon name="checkered-flag" size={34} />
            </span>
            <p className="display text-3xl">Día completo</p>
            <p className="font-bold text-muted">Lo que viste vuelve justo cuando estés por olvidarlo. Parar ahora también es parte del método.</p>
            <button
              onClick={async () => {
                await fetch("/api/session/extend", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ minutes: 15 }),
                });
                await loadItem();
              }}
              className="press chunk-sm w-full py-3 font-extrabold"
            >
              Quiero 15 minutos más
            </button>
            <button onClick={() => setView("hub")} className="press chunk-sm display w-full !bg-yellow py-3 text-xl">
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
    const ratio = correct / Math.max(1, results.length);
    const learned = [...new Set(results.filter((r) => r.correct && r.concept).map((r) => r.concept!))].slice(0, 4);
    const medal: { icon: GameIconName; title: string } =
      ratio >= 0.75 ? { icon: "trophy-cup", title: "¡Ronda brillante!" } : ratio >= 0.4 ? { icon: "muscle-up", title: "¡Buena ronda!" } : { icon: "sprout", title: "Sembrando" };
    return (
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4 text-center">
        <div className="chunk relative overflow-hidden p-6">
          <motion.span
            initial={{ rotate: -12, scale: 0.4 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 14 }}
            className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-4 border-ink bg-yellow shadow-[0_6px_0_var(--ink)]"
          >
            <GameIcon name={medal.icon} size={56} />
          </motion.span>
          <p className="display mt-4 text-3xl">{medal.title}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border-[3px] border-ink bg-card-2 p-3">
              <div className="text-xs font-black uppercase tracking-wide text-muted">Aciertos</div>
              <div className="display text-4xl tabular-nums">
                {correct}/{results.length}
              </div>
            </div>
            <div className="rounded-2xl border-[3px] border-ink bg-yellow p-3">
              <div className="text-xs font-black uppercase tracking-wide">XP ganada</div>
              <div className="display flex items-center justify-center gap-1 text-4xl tabular-nums">
                <GameIcon name="focused-lightning" size={26} />
                <CountUp to={xp} />
              </div>
            </div>
          </div>
          {state.level > startLevel && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="display mt-3 flex items-center justify-center gap-2 rounded-2xl border-[3px] border-ink bg-blue p-3 text-xl text-white"
            >
              <GameIcon name="star-medal" size={24} /> ¡Subiste a nivel {state.level}!
            </motion.div>
          )}
          {learned.length > 0 && (
            <div className="mt-4 text-left">
              <div className="mb-2 text-xs font-black uppercase tracking-wide text-muted">Reforzaste</div>
              <ul className="grid gap-1.5">
                {learned.map((c) => (
                  <li key={c} className="flex items-center gap-2 font-extrabold">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green text-white">
                      <GameIcon name="check-mark" size={14} />
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DailyGoal done={state.roundsToday} goal={state.goal} />
        <button onClick={startRound} className="press chunk display flex w-full items-center justify-center gap-3 !bg-yellow py-5 text-3xl">
          <GameIcon name="play-button" size={30} /> Otra ronda
        </button>
        <button onClick={() => setView("hub")} className="press chunk-sm w-full py-3 font-extrabold">
          Terminar por ahora
        </button>
      </motion.div>
    );
  }

  // Hub
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        <HudStat icon="flame" color="text-[#ff7a1a]" value={state.streak} label={state.freezeUsed ? "Racha (comodín)" : "Racha"} />
        <HudStat icon="star-medal" color="text-amber" value={`Nv ${state.level}`} label="Nivel">
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full border-2 border-ink bg-card-2">
            <div className="h-full bg-yellow" style={{ width: `${(state.into / state.needed) * 100}%` }} />
          </div>
        </HudStat>
        <HudStat icon="cycle" color="text-blue" value={state.dueNow} label="Repasos" />
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={startRound}
        className="chunk flex w-full flex-col items-center justify-center gap-1 !rounded-[28px] !bg-yellow py-9 !shadow-[0_9px_0_var(--ink)]"
      >
        <GameIcon name="play-button" size={52} />
        <span className="display text-5xl leading-none">Jugar</span>
        <span className="text-sm font-extrabold">Ronda de {ROUND_SIZE} · unos 4 minutos</span>
      </motion.button>

      <DailyGoal done={state.roundsToday} goal={state.goal} />

      <div className="grid grid-cols-3 gap-2.5">
        <ToggleChip icon={autoRead ? "speaker" : "sound-off"} label="Voz" on={autoRead} onClick={() => setAutoRead(!autoRead)} />
        <ToggleChip
          icon="settings-knobs"
          label="Sonidos"
          on={sfx}
          onClick={() => {
            setSound(!sfx);
            setSfx(!sfx);
          }}
        />
        <button
          onClick={() => setFs(fs >= 1.3 ? 1 : Math.round((fs + 0.15) * 100) / 100)}
          className="press chunk-sm flex flex-col items-center gap-0.5 py-2.5 font-extrabold"
        >
          <span className="display text-xl leading-none">Aa</span>
          <span className="text-xs">{Math.round(fs * 100)}%</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/progress" className="press chunk-sm flex items-center justify-center gap-2 p-3 font-extrabold">
          <GameIcon name="histogram" size={20} /> Mi progreso
        </Link>
        <Link href="/voice" className="press chunk-sm flex items-center justify-center gap-2 p-3 font-extrabold">
          <GameIcon name="microphone" size={20} /> Repaso por voz
        </Link>
      </div>
      <p className="text-center text-sm font-extrabold text-white/85">
        XP de hoy {state.todayXp} · total {state.totalXp}
      </p>
    </div>
  );
}

function HudStat({
  icon,
  color,
  value,
  label,
  children,
}: {
  icon: GameIconName;
  color: string;
  value: React.ReactNode;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="chunk flex flex-col items-center px-2 py-3 text-center">
      <GameIcon name={icon} size={30} className={color} />
      <div className="display mt-1 text-2xl leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] font-black uppercase tracking-wide text-muted">{label}</div>
      {children}
    </div>
  );
}

function ToggleChip({ icon, label, on, onClick }: { icon: GameIconName; label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={`press chunk-sm flex flex-col items-center gap-0.5 py-2.5 font-extrabold ${on ? "" : "opacity-60"}`}>
      <GameIcon name={icon} size={20} />
      <span className="text-xs">
        {label} {on ? "sí" : "no"}
      </span>
    </button>
  );
}

function HubSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="chunk h-28 animate-pulse" />
        ))}
      </div>
      <div className="chunk h-48 animate-pulse !bg-yellow/70" />
      <div className="chunk h-20 animate-pulse" />
    </div>
  );
}

/** Defensive: an item without content is skipped. */
function SkipEffect({ onSkip }: { onSkip: () => void }) {
  useEffect(() => {
    onSkip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function RoundHud({ results, onExit }: { results: { correct: boolean }[]; onExit: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onExit} aria-label="Salir de la ronda" className="press chunk-sm flex h-10 w-10 shrink-0 items-center justify-center">
        <GameIcon name="exit-door" size={20} />
      </button>
      <div className="flex flex-1 gap-1.5">
        {Array.from({ length: ROUND_SIZE }, (_, i) => {
          const r = results[i];
          return (
            <motion.div
              key={i}
              initial={false}
              animate={{ scaleY: r ? [1, 1.5, 1] : 1 }}
              className={`h-3.5 flex-1 rounded-full border-2 border-ink ${r ? (r.correct ? "bg-green" : "bg-red") : i === results.length ? "bg-yellow" : "bg-white/35"}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function DailyGoal({ done, goal }: { done: number; goal: number }) {
  const complete = done >= goal;
  return (
    <div className="chunk p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="display flex items-center gap-2 text-xl">
          <GameIcon name="checkered-flag" size={20} /> Meta de hoy
        </span>
        <span className={`rounded-full border-2 border-ink px-2.5 py-0.5 text-sm font-black tabular-nums ${complete ? "bg-green text-white" : "bg-card-2"}`}>
          {Math.min(done, goal)}/{goal} rondas
        </span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: goal }, (_, i) => (
          <div key={i} className={`h-4 flex-1 rounded-md border-2 border-ink ${i < done ? "bg-yellow" : "bg-card-2"}`} />
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
  return <span className="tabular-nums">{shown}</span>;
}
