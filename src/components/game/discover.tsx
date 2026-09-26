"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiagramNode, Island, ServiceUnit, UnitOverview } from "@/lib/content/types";
import { play } from "@/lib/game/sfx";

const KIND_STYLE: Record<DiagramNode["kind"], { fill: string; stroke: string; text: string; emoji: string }> = {
  service: { fill: "#FFF3E6", stroke: "#D9731A", text: "#5A2E00", emoji: "☁️" },
  actor: { fill: "#EAF1FF", stroke: "#2F6FEB", text: "#0B2A66", emoji: "👤" },
  data: { fill: "#EAF7EF", stroke: "#1F9D55", text: "#0B3D22", emoji: "📦" },
  zone: { fill: "none", stroke: "#8A857C", text: "#5C5850", emoji: "" },
  note: { fill: "#F6F3EE", stroke: "#B8B2A7", text: "#4A463F", emoji: "💡" },
};

const W = 100;
const H = 64;
const NODE_W = 21;
const NODE_H = 10;
/** Box width grows with the label (plus room for the kind emoji). */
const widthOf = (n: DiagramNode) => Math.min(34, Math.max(NODE_W, n.label.length * 1.75 + 7));

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
        <div className="text-[0.8em] font-semibold uppercase tracking-wide" style={{ color: island?.color ?? "var(--accent)" }}>
          {island ? `${island.emoji} ${island.nameEs}` : "Descubre"} · nuevo servicio
        </div>
        <h2 className="mt-1 text-[1.6em] font-extrabold leading-tight">{overview.title}</h2>
        <p className="mt-1 text-[1em] text-muted">{overview.hook}</p>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Diagrama de ${overview.title}`}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#8A857C" />
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
                <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#8A857C" strokeWidth={0.5} markerEnd="url(#arrow)" />
                {e.label && (
                  <text
                    x={(sx + ex) / 2}
                    y={(sy + ey) / 2 - 1}
                    textAnchor="middle"
                    fontSize={2.4}
                    fill="#6B675F"
                    stroke="#FFFFFF"
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
            return (
              <motion.g
                key={n.id}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: focused ? 1.08 : 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
              >
                {focused && (
                  <motion.rect
                    x={cx - nw / 2 - 1.2}
                    y={cy - NODE_H / 2 - 1.2}
                    width={nw + 2.4}
                    height={NODE_H + 2.4}
                    rx={3.5}
                    fill="none"
                    stroke="#D9731A"
                    strokeWidth={0.8}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                  />
                )}
                <rect
                  x={cx - nw / 2}
                  y={cy - NODE_H / 2}
                  width={nw}
                  height={NODE_H}
                  rx={2.8}
                  fill={s.fill}
                  stroke={s.stroke}
                  strokeWidth={n.kind === "zone" ? 0.4 : 0.6}
                  strokeDasharray={n.kind === "zone" ? "1.5 1" : undefined}
                />
                <text x={cx} y={cy + 1.1} textAnchor="middle" fontSize={3} fontWeight={600} fill={s.text}>
                  {s.emoji ? `${s.emoji} ` : ""}
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
            <div className="flex items-center justify-center gap-2">
              {overview.segments.map((_, i) => (
                <span key={i} className={`h-2 rounded-full transition-all ${i === seg ? "w-6 bg-accent" : i < seg ? "w-2 bg-accent/50" : "w-2 bg-surface-2"}`} />
              ))}
            </div>
            {showText && <p className="rounded-2xl bg-surface p-4 text-[1.1em] leading-relaxed">{overview.segments[seg].narration}</p>}
            <div className="flex justify-center gap-2 text-[0.85em]">
              <button onClick={() => speak(`unit:${unit.id}:${seg}`)} className="rounded-full border border-border px-3 py-1.5 text-muted">
                🔊 Repetir
              </button>
              <button onClick={() => setShowText((v) => !v)} className="rounded-full border border-border px-3 py-1.5 text-muted">
                {showText ? "Ocultar texto" : "Ver texto"}
              </button>
              {seg > 0 && (
                <button onClick={() => setSeg(seg - 1)} className="rounded-full border border-border px-3 py-1.5 text-muted">
                  ← Atrás
                </button>
              )}
            </div>
            <button onClick={next} className="w-full rounded-2xl bg-accent py-4 text-[1.15em] font-bold text-accent-fg">
              {seg < last ? "Siguiente →" : "Ver resumen"}
            </button>
          </motion.div>
        ) : (
          <motion.div key="summary" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="rounded-2xl bg-surface p-4">
              <div className="mb-2 text-[0.85em] font-semibold uppercase tracking-wide text-muted">Lo esencial</div>
              <ul className="space-y-2 text-[1.1em] leading-snug">
                {overview.keyPoints.map((k) => (
                  <li key={k}>✅ {k}</li>
                ))}
              </ul>
            </div>
            {overview.confusedWith.length > 0 && (
              <div className="rounded-2xl bg-surface p-4">
                <div className="mb-2 text-[0.85em] font-semibold uppercase tracking-wide text-muted">No lo confundas con</div>
                <ul className="space-y-2 text-[1em] leading-snug">
                  {overview.confusedWith.map((c) => (
                    <li key={c.unitOrService}>
                      <b>{c.unitOrService}</b>: {c.difference}
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
              className="w-full rounded-2xl bg-accent py-4 text-[1.15em] font-bold text-accent-fg"
            >
              ¡A practicar! ▶
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
