"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GameIcon } from "@/components/game/icons";
import type { GameEvent, EventStatus } from "@/lib/events";
import { mascotDataUrl } from "@/lib/game/mascot";
import { setScene } from "@/lib/game/music";
import { play } from "@/lib/game/sfx";
import { EventQuestion, type EventQuestionData } from "./event-question";
import { Leaderboard, photoUrl, type BoardRow } from "./leaderboard";
import { Selfie } from "./selfie";

interface Me {
  displayName: string;
  done: boolean;
  current: number;
  total: number;
  score: number;
  correct: number;
  totalMs: number;
  photoAt: string | null;
  hidden: boolean;
  rank?: number;
  players?: number;
}
interface State {
  event: GameEvent;
  status: EventStatus;
  admin: boolean;
  userId: string;
  me: Me | null;
  leaderboard: BoardRow[];
}
type View = "home" | "countdown" | "play" | "result" | "selfie";

export function EventClient({ slug }: { slug: string }) {
  const [state, setState] = useState<State | null>(null);
  const [view, setView] = useState<View>("home");
  const [question, setQuestion] = useState<EventQuestionData | null>(null);
  const [score, setScore] = useState(0);
  const [count, setCount] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${slug}`, { cache: "no-store" });
    const data = await res.json();
    if (res.ok) setState(data);
    return data as State;
  }, [slug]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Live leaderboard while browsing it.
  useEffect(() => {
    if (view !== "home" && view !== "result") return;
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [view, load]);

  useEffect(() => {
    setScene(view === "play" || view === "countdown" ? "round" : view === "result" ? "result" : "hub");
  }, [view]);
  useEffect(() => () => setScene(null), []);

  async function nextQuestion() {
    setError(null);
    const res = await fetch(`/api/events/${slug}/question`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo cargar la pregunta");
      setView("home");
      return;
    }
    if (data.done) {
      await load();
      play("round");
      setView("result");
      return;
    }
    setQuestion(data.question);
    setView("play");
  }

  async function start() {
    const fresh = !state?.me;
    setScore(state?.me?.score ?? 0);
    if (fresh) {
      setView("countdown");
      for (const n of [3, 2, 1]) {
        setCount(n);
        play("tap");
        await new Promise((r) => setTimeout(r, 750));
      }
      play("start");
    }
    await nextQuestion();
  }

  async function moderate(userId: string, action: "hide" | "reset") {
    if (action === "reset" && !confirm("¿Borrar este intento?")) return;
    await fetch(`/api/events/${slug}/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, userId }),
    });
    await load();
    if (action === "reset") setView("home");
  }

  if (!state) return <div className="chunk h-64 animate-pulse" aria-busy="true" />;
  const { event, status, me } = state;

  if (view === "countdown") {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-white">
        <p className="display text-2xl">¿Listo?</p>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={count}
            initial={{ scale: 2.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="display text-[10rem] leading-none [text-shadow:0_10px_0_var(--ink)]"
          >
            {count}
          </motion.span>
        </AnimatePresence>
      </div>
    );
  }

  if (view === "play" && question) {
    return (
      <EventQuestion
        key={question.id}
        slug={slug}
        q={question}
        score={score}
        onAnswered={(a) => setScore(a.score)}
        onNext={nextQuestion}
      />
    );
  }

  if (view === "selfie" && me) {
    return (
      <Selfie
        slug={slug}
        label={{ event: event.name, name: me.displayName, score: `${me.correct}/${me.total} · ${me.score} pts` }}
        onSaved={async () => {
          await load();
          setView("result");
        }}
        onCancel={() => setView("result")}
      />
    );
  }

  if (view === "result" && me?.done) {
    return (
      <div className="space-y-5">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="chunk space-y-4 p-5 text-center">
          <p className="text-sm font-black uppercase tracking-wide text-muted">{event.name}</p>
          <p className="display text-6xl tabular-nums">{me.score}</p>
          <p className="font-extrabold">
            {me.correct} de {me.total} correctas · {(me.totalMs / 1000).toFixed(1)} s
          </p>
          {me.rank && (
            <p className="chunk-sm display inline-block !bg-yellow px-4 py-1.5 text-2xl">
              Puesto {me.rank} de {me.players}
            </p>
          )}
        </motion.div>

        <NameEditor slug={slug} name={me.displayName} onSaved={load} />

        {me.photoAt ? (
          <div className="chunk flex items-center gap-4 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(slug, { userId: state.userId, photoAt: me.photoAt })} alt="Tu selfie" className="h-28 w-21 rounded-xl border-[3px] border-ink object-cover" />
            <div className="flex-1 space-y-2">
              <p className="font-black">Tu selfie está en el ranking.</p>
              <button onClick={() => setView("selfie")} className="press chunk-sm w-full py-2 text-sm font-extrabold">
                Tomar otra
              </button>
              <RemovePhoto slug={slug} onDone={load} />
            </div>
          </div>
        ) : (
          <button onClick={() => setView("selfie")} className="press chunk flex w-full items-center gap-4 !bg-yellow p-4 text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mascotDataUrl("party")} alt="" className="h-20 w-auto" />
            <span>
              <span className="display block text-2xl leading-tight">Tómate una selfie con Nubi</span>
              <span className="block text-sm font-extrabold">Será tu foto en el ranking del evento.</span>
            </span>
          </button>
        )}

        <h2 className="display text-center text-3xl text-white [text-shadow:0_3px_0_var(--ink)]">Ranking</h2>
        <Leaderboard slug={slug} rows={state.leaderboard} me={state.userId} admin={state.admin} onModerate={moderate} />
        <Link href="/" className="press chunk-sm block py-3 text-center font-extrabold">
          Seguir estudiando AWS
        </Link>
      </div>
    );
  }

  const canPlay = status === "live" || (status === "upcoming" && state.admin);
  return (
    <div className="space-y-5">
      <EventHero event={event} status={status} players={state.leaderboard.length} />

      {error && <p className="chunk-sm bg-bad-bg p-3 text-sm font-bold">{error}</p>}

      {me?.done ? (
        <button onClick={() => setView("result")} className="press chunk display w-full !bg-yellow py-4 text-2xl">
          Ver mi resultado
        </button>
      ) : canPlay ? (
        <>
          <ul className="chunk grid gap-2.5 p-4 text-sm font-extrabold">
            {[
              ["focused-lightning", `${event.questionCount} preguntas relámpago al azar sobre AWS`],
              ["stopwatch", `${event.secondsPerQuestion} segundos cada una: más rápido, más puntos (hasta 1000)`],
              ["checked-shield", "Un solo intento por persona"],
              ["podium-winner", "Al final, selfie con Nubi para tu perfil del ranking"],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-yellow">
                  <GameIcon name={icon as "stopwatch"} size={20} />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <motion.button
            onClick={start}
            whileTap={{ scale: 0.97 }}
            className="chunk display flex w-full items-center justify-center gap-3 !rounded-[28px] !bg-yellow py-6 text-4xl !shadow-[0_9px_0_var(--ink)]"
          >
            <GameIcon name="play-button" size={40} />
            {me ? "Continuar" : status === "live" ? "¡Jugar!" : "Ensayar (admin)"}
          </motion.button>
        </>
      ) : (
        <p className="chunk p-4 text-center font-extrabold">
          {status === "upcoming" ? `El juego abre el ${event.dateLabel.toLowerCase()}. ¡Te esperamos en ${event.venue}!` : "El evento terminó. ¡Gracias por jugar!"}
        </p>
      )}

      <h2 className="display text-center text-3xl text-white [text-shadow:0_3px_0_var(--ink)]">Ranking</h2>
      <Leaderboard slug={slug} rows={state.leaderboard} me={state.userId} admin={state.admin} onModerate={moderate} />

      {state.admin && (
        <div className="chunk-sm space-y-2 p-3 text-sm font-bold">
          <p>Admin</p>
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/events/${slug}/screen`} className="press chunk-sm py-2 text-center">
              Pantalla para proyectar
            </Link>
            {me && (
              <button onClick={() => moderate(state.userId, "reset")} className="press chunk-sm py-2">
                Reiniciar mi intento
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function EventHero({ event, status, players }: { event: GameEvent; status: EventStatus; players?: number }) {
  return (
    <div className="chunk relative overflow-hidden p-5">
      <div className="relative z-10 max-w-[64%] space-y-2">
        {status === "live" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-red px-2.5 py-0.5 text-xs font-black text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> EN VIVO
          </span>
        ) : (
          <span className="inline-block rounded-full border-2 border-ink bg-card-2 px-2.5 py-0.5 text-xs font-black">
            {status === "upcoming" ? "PRÓXIMO" : "TERMINADO"}
          </span>
        )}
        <h1 className="display text-3xl leading-tight">{event.name}</h1>
        <p className="text-sm font-extrabold text-muted">
          {event.dateLabel} · {event.venue}, {event.city}
        </p>
        {players !== undefined && players > 0 && <p className="text-sm font-black">{players} en el ranking</p>}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mascotDataUrl("wave")} alt="" className="absolute -right-4 bottom-0 w-[46%] max-w-[220px]" />
    </div>
  );
}

function NameEditor({ slug, name, onSaved }: { slug: string; name: string; onSaved: () => void }) {
  const [value, setValue] = useState(name);
  const [saved, setSaved] = useState(false);
  const dirty = value.trim() !== name && value.trim().length >= 2;
  return (
    <form
      className="chunk flex items-end gap-2 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!dirty) return;
        await fetch(`/api/events/${slug}/profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: value.trim() }),
        });
        setSaved(true);
        onSaved();
      }}
    >
      <label className="flex-1 text-xs font-black uppercase tracking-wide text-muted">
        Tu nombre en el ranking
        <input
          value={value}
          maxLength={24}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          className="mt-1 block w-full rounded-xl border-[3px] border-ink px-3 py-2 text-base font-extrabold normal-case tracking-normal text-ink"
        />
      </label>
      <button disabled={!dirty} className="press chunk-sm px-4 py-2.5 font-extrabold disabled:opacity-50">
        {saved ? "Listo" : "Guardar"}
      </button>
    </form>
  );
}

function RemovePhoto({ slug, onDone }: { slug: string; onDone: () => void }) {
  return (
    <button
      onClick={async () => {
        await fetch(`/api/events/${slug}/profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ removePhoto: true }),
        });
        onDone();
      }}
      className="w-full text-xs font-extrabold text-muted underline"
    >
      Quitar mi foto
    </button>
  );
}
