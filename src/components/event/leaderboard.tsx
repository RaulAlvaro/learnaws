"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { GameIcon } from "@/components/game/icons";

export interface BoardRow {
  userId: string;
  displayName: string;
  score: number;
  correct: number;
  totalMs: number;
  photoAt: string | null;
}

const TINTS = ["bg-red", "bg-blue", "bg-amber", "bg-green", "bg-[#7c4ddb]"];
const tint = (id: string) => TINTS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
export const photoUrl = (slug: string, r: { userId: string; photoAt: string | null }) =>
  `/api/events/${slug}/photo/${encodeURIComponent(r.userId)}?v=${encodeURIComponent(r.photoAt ?? "")}`;

export function Avatar({ slug, row, size, onOpen }: { slug: string; row: BoardRow; size: number; onOpen?: () => void }) {
  const style = { width: size, height: size };
  if (!row.photoAt) {
    return (
      <span style={style} className={`display flex shrink-0 items-center justify-center rounded-2xl border-[3px] border-ink text-white ${tint(row.userId)}`}>
        <span style={{ fontSize: size * 0.42 }}>{row.displayName.slice(0, 1).toUpperCase()}</span>
      </span>
    );
  }
  return (
    <button onClick={onOpen} style={style} className="shrink-0 overflow-hidden rounded-2xl border-[3px] border-ink bg-card-2" aria-label={`Ver la selfie de ${row.displayName}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl(slug, row)} alt="" className="h-full w-full object-cover object-[50%_32%]" loading="lazy" />
    </button>
  );
}

const PODIUM = [
  { place: 2, h: "h-20", bg: "bg-[#c9cbe8]", size: 72 },
  { place: 1, h: "h-28", bg: "bg-yellow", size: 92 },
  { place: 3, h: "h-14", bg: "bg-[#f0b48a]", size: 64 },
];

export function Leaderboard({
  slug,
  rows,
  me,
  admin,
  onModerate,
}: {
  slug: string;
  rows: BoardRow[];
  me?: string;
  admin?: boolean;
  onModerate?: (userId: string, action: "hide" | "reset") => void;
}) {
  const [open, setOpen] = useState<BoardRow | null>(null);
  if (!rows.length) {
    return (
      <div className="chunk p-6 text-center">
        <GameIcon name="podium-winner" size={44} className="mx-auto text-muted" />
        <p className="display mt-2 text-xl">Aún no hay puntajes</p>
        <p className="text-sm font-bold text-muted">Sé la primera persona en el ranking.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 items-end gap-2">
        {PODIUM.map((p) => {
          const r = rows[p.place - 1];
          return (
            <div key={p.place} className="flex flex-col items-center gap-1.5">
              {r ? (
                <>
                  <Avatar slug={slug} row={r} size={p.size} onOpen={() => setOpen(r)} />
                  <span className="max-w-full truncate text-center text-sm font-black text-white [text-shadow:0_2px_0_var(--ink)]">{r.displayName}</span>
                  <span className="text-xs font-black text-white/90 tabular-nums">{r.score} pts</span>
                </>
              ) : (
                <span style={{ width: p.size, height: p.size }} className="rounded-2xl border-[3px] border-dashed border-white/50" />
              )}
              <div className={`chunk-sm display flex w-full items-start justify-center pt-1 text-3xl ${p.h} ${p.bg}`}>{p.place}</div>
            </div>
          );
        })}
      </div>

      <ol className="chunk divide-y-2 divide-card-2 !p-0">
        {rows.map((r, i) => (
          <li key={r.userId} className={`flex items-center gap-3 px-3 py-2.5 ${r.userId === me ? "bg-amber-bg" : ""}`}>
            <span className="display w-7 text-center text-lg tabular-nums">{i + 1}</span>
            <Avatar slug={slug} row={r} size={40} onOpen={() => setOpen(r)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-black">
                {r.displayName}
                {r.userId === me && <span className="ml-1.5 text-xs text-muted">(tú)</span>}
              </span>
              <span className="block text-xs font-bold text-muted">
                {r.correct}/5 · {(r.totalMs / 1000).toFixed(1)} s
              </span>
            </span>
            <span className="display text-xl tabular-nums">{r.score}</span>
            {admin && onModerate && (
              <span className="flex gap-1">
                <button onClick={() => onModerate(r.userId, "hide")} className="press chunk-sm px-1.5 py-1 text-[11px] font-black" title="Ocultar del ranking">
                  Ocultar
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          >
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="chunk w-full max-w-xs overflow-hidden !p-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(slug, open)} alt={`Selfie de ${open.displayName}`} className="w-full" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
