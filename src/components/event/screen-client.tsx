"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { GameEvent } from "@/lib/events";
import { Avatar, type BoardRow } from "./leaderboard";

/** Full-screen projector view; refreshes the ranking every 5 s. */
export function ScreenClient({ event, qrSvg, url }: { event: GameEvent; qrSvg: string; url: string }) {
  const [rows, setRows] = useState<BoardRow[]>([]);
  useEffect(() => {
    const load = () =>
      fetch(`/api/events/${event.slug}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setRows(d.leaderboard ?? []))
        .catch(() => {});
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [event.slug]);

  return (
    <div className="fixed inset-0 z-40 grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 overflow-hidden bg-field p-10 [background-image:radial-gradient(circle_at_2px_2px,rgba(255,255,255,.16)_2px,transparent_0)] [background-size:28px_28px]">
      <div className="flex flex-col justify-center gap-6 text-white">
        <span className="self-start rounded-full border-[3px] border-ink bg-yellow px-5 py-1 text-xl font-black text-ink">
          {event.venue} · {event.city}
        </span>
        <h1 className="display text-[clamp(2.5rem,5vw,5rem)] leading-[0.95] [text-shadow:0_6px_0_var(--ink)]">{event.name}</h1>
        <p className="text-[clamp(1rem,1.6vw,1.6rem)] font-black">
          {event.questionCount} preguntas de AWS · selfie con la mascota · ranking en vivo
        </p>
        <div className="flex items-center gap-6">
          <div className="chunk w-[min(22vw,320px)] p-4" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="space-y-3">
            <p className="display text-[clamp(1.8rem,3vw,3rem)] leading-none [text-shadow:0_4px_0_var(--ink)]">Escanea y juega</p>
            <p className="rounded-xl bg-ink px-3 py-1.5 text-[clamp(0.9rem,1.3vw,1.3rem)] font-black">{url}</p>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={event.mascot} alt="" className="absolute bottom-4 left-[27%] w-[10vw] max-w-[190px] -rotate-6" />
      </div>

      <div className="flex min-h-0 flex-col">
        <h2 className="display mb-4 text-[clamp(2rem,3.5vw,3.5rem)] text-white [text-shadow:0_5px_0_var(--ink)]">Ranking</h2>
        <ol className="flex min-h-0 flex-col gap-2.5">
          <AnimatePresence initial={false}>
            {rows.slice(0, 8).map((r, i) => (
              <motion.li
                key={r.userId}
                layout
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                className={`chunk flex items-center gap-4 px-4 py-1.5 ${i === 0 ? "!bg-yellow" : ""}`}
              >
                <span className="display w-12 text-center text-[clamp(1.4rem,2.4vw,2.4rem)] tabular-nums">{i + 1}</span>
                <Avatar slug={event.slug} row={r} size={i < 3 ? 60 : 48} />
                <span className="min-w-0 flex-1 truncate text-[clamp(1.1rem,1.8vw,1.9rem)] font-black">{r.displayName}</span>
                <span className="text-[clamp(0.9rem,1.2vw,1.2rem)] font-bold text-muted">{r.correct}/5</span>
                <span className="display w-28 text-right text-[clamp(1.4rem,2.4vw,2.4rem)] tabular-nums">{r.score}</span>
              </motion.li>
            ))}
          </AnimatePresence>
          {!rows.length && <li className="chunk p-6 text-center text-2xl font-black">Esperando a los primeros jugadores...</li>}
        </ol>
      </div>
    </div>
  );
}
