"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiagramNode, Island, ServiceUnit, UnitOverview } from "@/lib/content/types";
import { play } from "@/lib/game/sfx";
import { GameIcon, type GameIconName } from "./icons";

const KIND_STYLE: Record<DiagramNode["kind"], { fill: string; text: string; icon: GameIconName | null; iconClass?: string }> = {
  service: { fill: "#ffc933", text: "#1c1840", icon: "mesh-network" },
  actor: { fill: "#3d8bff", text: "#ffffff", icon: null },
  data: { fill: "#dff5e9", text: "#1c1840", icon: "cardboard-box", iconClass: "text-green" },
  zone: { fill: "none", text: "#5e5a86", icon: null },
  note: { fill: "#efeefa", text: "#1c1840", icon: "light-bulb", iconClass: "text-amber" },
}

const W = 100;
const H = 64;
const NODE_W = 21;
const NODE_H = 10;
/** Box width grows with the label (plus room for the kind glyph). */
const widthOf = (n: DiagramNode) => Math.min(36, Math.max(NODE_W, n.label.length * 1.8 + (KIND_STYLE[n.kind]?.icon ? 10 : 6)));

/** Map percentage coordinates into the viewBox, then push overlapping boxes apart. */
function relax(nodes: DiagramNode[]): Map<string, { cx: number; cy: number }> {
  const p = nodes.map((n) => ({
    id: n.id,
    w: widthOf(n),
    cx: (n.x / 100) * (W - widthOf(n)) + widthOf(n) / 2,
    cy: (n.y / 100) * (H - NODE_H) + NODE_H / 2,
  }));
  const gapY = NODE_H + 1.5;
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const dx = p[j].cx - p[i].cx;
        const dy = p[j].cy - p[i].cy;
        const ox = (p[i].w + p[j].w) / 2 + 1.5 - Math.abs(dx);
        const oy = gapY - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          moved = true;
          // resolve along the axis needing the smaller push
          if (ox < oy) {
            const s = (dx >= 0 ? 1 : -1) * (ox / 2);
            p[i].cx -= s;
            p[j].cx += s;
          } else {
            const s = (dy >= 0 ? 1 : -1) * (oy / 2);
            p[i].cy -= s;
            p[j].cy += s;
          }
        }
      }
    }
    for (const n of p) {
      n.cx = Math.min(W - n.w / 2, Math.max(n.w / 2, n.cx));
      n.cy = Math.min(H - NODE_H / 2, Math.max(NODE_H / 2, n.cy));
    }
    if (!moved) break;
  }
  return new Map(p.map((n) => [n.id, { cx: n.cx, cy: n.cy }]));
}

/**
 * "Descubrir": narrated, segmented build-up of a service's diagram (Mayer: pre-training,
 * modality, segmenting, signaling). The learner paces it; text is available on demand.
 */
export function Discover({
  unit,
  island,
  overview,
  autoRead,
  onDone,
}: {
  unit: ServiceUnit;
  island: Island | null;
  overview: UnitOverview;
  autoRead: boolean;
  onDone: () => void;
}) {
  const [seg, setSeg] = useState(0);
  const [summary, setSummary] = useState(false);
  const [showText, setShowText] = useState(!autoRead);
  const audio = useRef<HTMLAudioElement | null>(null);
  const last = overview.segments.length - 1;

  const speak = (ref: string) => {
    audio.current?.pause();
    const a = new Audio(`/api/tts?ref=${encodeURIComponent(ref)}&lang=es`);
    audio.current = a;
    a.play().catch(() => {});
  };

  useEffect(() => {
    if (autoRead) speak(summary ? `unit:${unit.id}:summary` : `unit:${unit.id}:${seg}`);
    return () => audio.current?.pause();
  }, [seg, summary, autoRead, unit.id]);

  const visible = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i <= (summary ? last : seg); i++) for (const id of overview.segments[i]?.show ?? []) ids.add(id);
    return ids;
  }, [seg, summary, last, overview.segments]);
  const focus = summary ? undefined : overview.segments[seg]?.focus;
  const byId = new Map(overview.diagram.nodes.map((n) => [n.id, n]));
  const layout = useMemo(() => relax(overview.diagram.nodes), [overview.diagram.nodes]);
  const pos = (n: DiagramNode) => layout.get(n.id)!;

  function next() {
    play("tap");
    if (seg < last) setSeg(seg + 1);
    else setSummary(true);
  }

  return (
    <div className="space-y-4" style={{ fontSize: "calc(1rem * var(--fs, 1))" }}>
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-yellow px-3 py-1 text-[0.8em] font-black uppercase tracking-wide text-ink">
          <GameIcon name="gift-of-knowledge" size={15} />
          {island ? island.nameEs : "Descubre"} · servicio nuevo
        </span>
        <h2 className="display mt-2 text-[2.1em] leading-tight text-white [text-shadow:0_4px_0_var(--ink)]">{overview.title}</h2>
        <p className="mx-auto mt-1 max-w-[34ch] text-[1.02em] font-extrabold text-white/90">{overview.hook}</p>
      </div>

      <div className="chunk p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Diagrama de ${overview.title}`}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#1c1840" />
            </marker>
          </defs>
          {overview.diagram.edges.map((e, i) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b || !visible.has(a.id) || !visible.has(b.id)) return null;
            const p = pos(a);
            const q = pos(b);
            const dx = q.cx - p.cx;
            const dy = q.cy - p.cy;
            const len = Math.hypot(dx, dy) || 1;
            const pad = Math.min(Math.max(widthOf(a), widthOf(b)) / 2, (NODE_H / 2) * (len / Math.max(Math.abs(dy), 0.01)));
            const sx = p.cx + (dx / len) * Math.min(pad, len / 3);
            const sy = p.cy + (dy / len) * Math.min(pad, len / 3);
            const ex = q.cx - (dx / len) * Math.min(pad, len / 3);
            const ey = q.cy - (dy / len) * Math.min(pad, len / 3);
            return (
              <motion.g key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#1c1840" strokeWidth={0.7} markerEnd="url(#arrow)" />
                {e.label && (
                  <text
                    x={(sx + ex) / 2}
                    y={(sy + ey) / 2 - 1}
                    textAnchor="middle"
                    fontSize={2.5}
                    fontWeight={800}
                    fill="#5e5a86"
                    stroke="#ffffff"
                    strokeWidth={0.9}
                    paintOrder="stroke"
                  >
                    {e.label}
                  </text>
                )}
              </motion.g>
            );
          })}
          {overview.diagram.nodes.map((n) => {
            if (!visible.has(n.id)) return null;
            const s = KIND_STYLE[n.kind] ?? KIND_STYLE.note;
            const { cx, cy } = pos(n);
            const nw = widthOf(n);
            const focused = focus === n.id;
            const glyph = s.icon;
            return (
              <motion.g
                key={n.id}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: focused ? 1.08 : 1 }}
                transition={{ type: "spring", stiffness: 280, damping: 16 }}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
              >
                {focused && (
                  <motion.rect
                    x={cx - nw / 2 - 1.4}
                    y={cy - NODE_H / 2 - 1.4}
                    width={nw + 2.8}
                    height={NODE_H + 2.8}
                    rx={3.8}
                    fill="none"
                    stroke="#ffc933"
                    strokeWidth={1.3}
                    animate={{ opacity: [0.35, 1, 0.35] }}
                    transition={{ duration: 1.3, repeat: Infinity }}
                  />
                )}
                {n.kind !== "zone" && <rect x={cx - nw / 2} y={cy - NODE_H / 2 + 1} width={nw} height={NODE_H} rx={2.8} fill="#1c1840" />}
                <rect
                  x={cx - nw / 2}
                  y={cy - NODE_H / 2}
                  width={nw}
                  height={NODE_H}
                  rx={2.8}
                  fill={s.fill}
                  stroke="#1c1840"
                  strokeWidth={n.kind === "zone" ? 0.5 : 0.8}
                  strokeDasharray={n.kind === "zone" ? "1.5 1" : undefined}
                />
                {glyph && <GameIcon name={glyph} x={cx - nw / 2 + 1.6} y={cy - 2.3} size={4.6} className={s.iconClass} />}
                <text x={cx + (glyph ? 2.2 : 0)} y={cy + 1.1} textAnchor="middle" fontSize={3} fontWeight={900} fill={s.text}>
                  {n.label}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>

      <AnimatePresence mode="wait">
        {!summary ? (
          <motion.div key={seg} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="flex items-center justify-center gap-1.5">
              {overview.segments.map((_, i) => (
                <span
                  key={i}
                  className={`h-3 rounded-full border-2 border-ink transition-all ${i === seg ? "w-8 bg-yellow" : i < seg ? "w-3 bg-yellow/70" : "w-3 bg-white/40"}`}
                />
              ))}
            </div>
            {showText && <p className="chunk p-4 text-[1.1em] font-bold leading-relaxed">{overview.segments[seg].narration}</p>}
            <div className="flex justify-center gap-2">
              <button onClick={() => speak(`unit:${unit.id}:${seg}`)} className="press chunk-sm flex items-center gap-1.5 px-3 py-2 text-[0.9em] font-extrabold">
                <GameIcon name="speaker" size={16} /> Repetir
              </button>
              <button onClick={() => setShowText((v) => !v)} className="press chunk-sm flex items-center gap-1.5 px-3 py-2 text-[0.9em] font-extrabold">
                <GameIcon name="open-book" size={16} /> {showText ? "Ocultar texto" : "Ver texto"}
              </button>
              {seg > 0 && (
                <button onClick={() => setSeg(seg - 1)} className="press chunk-sm px-3 py-2 text-[0.9em] font-extrabold">
                  Atrás
                </button>
              )}
            </div>
            <button onClick={next} className="press chunk display w-full !bg-yellow py-4 text-[1.5em]">
              {seg < last ? "Siguiente" : "Ver resumen"}
            </button>
          </motion.div>
        ) : (
          <motion.div key="summary" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="chunk p-4">
              <div className="display mb-3 text-xl">Lo esencial</div>
              <ul className="grid gap-2.5 text-[1.08em] font-bold leading-snug">
                {overview.keyPoints.map((k) => (
                  <li key={k} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green text-white">
                      <GameIcon name="check-mark" size={14} />
                    </span>
                    {k}
                  </li>
                ))}
              </ul>
            </div>
            {overview.confusedWith.length > 0 && (
              <div className="chunk p-4">
                <div className="display mb-3 text-xl">No lo confundas con</div>
                <ul className="grid gap-2.5 text-[1em] font-bold leading-snug">
                  {overview.confusedWith.map((c) => (
                    <li key={c.unitOrService} className="rounded-xl border-2 border-ink bg-card-2 p-3">
                      <span className="font-black">{c.unitOrService}</span>
                      <span className="block text-muted">{c.difference}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              onClick={() => {
                play("round");
                onDone();
              }}
              className="press chunk display flex w-full items-center justify-center gap-2 !bg-yellow py-4 text-[1.5em]"
            >
              <GameIcon name="play-button" size={24} /> A practicar
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
