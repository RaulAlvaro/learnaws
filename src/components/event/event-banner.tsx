"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GameIcon } from "@/components/game/icons";
import { mascotDataUrl } from "@/lib/game/mascot";

interface Live {
  event: { slug: string; name: string; venue: string } | null;
  played?: boolean;
}

/** Hub call-to-action while an event is live: big before playing, a slim link to the ranking after. */
export function EventBanner() {
  const reduce = useReducedMotion();
  const [live, setLive] = useState<Live | null>(null);
  useEffect(() => {
    fetch("/api/events/live", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setLive)
      .catch(() => {});
  }, []);
  const e = live?.event;
  if (!e) return null;

  if (live.played) {
    return (
      <Link href={`/events/${e.slug}`} className="press chunk-sm flex items-center gap-3 p-3 font-extrabold">
        <GameIcon name="podium-winner" size={24} className="text-amber" />
        <span className="flex-1">Ranking de {e.name}</span>
        <GameIcon name="play-button" size={16} />
      </Link>
    );
  }

  return (
    <motion.div
      initial={reduce ? false : { y: -12, opacity: 0 }}
      animate={reduce ? undefined : { y: 0, opacity: 1, rotate: [0, -1, 1, 0] }}
      transition={{ rotate: { duration: 0.6, delay: 0.4 } }}
    >
      <Link href={`/events/${e.slug}`} className="press chunk relative block overflow-hidden !bg-red p-4 pr-32 text-white">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-xs font-black text-ink">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red" /> EN VIVO HOY · {e.venue}
        </span>
        <span className="display mt-2 block text-2xl leading-tight [text-shadow:0_3px_0_var(--ink)]">{e.name}</span>
        <span className="mt-1 block text-sm font-extrabold">5 preguntas, ranking en vivo y selfie con Nubi.</span>
        <span className="chunk-sm display mt-3 inline-flex items-center gap-2 !bg-yellow px-4 py-1.5 text-lg text-ink">
          <GameIcon name="play-button" size={18} /> Participar
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mascotDataUrl("wave")} alt="" className="absolute -right-3 bottom-1 w-36" />
      </Link>
    </motion.div>
  );
}
