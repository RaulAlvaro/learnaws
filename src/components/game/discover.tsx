"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiagramNode, Island, ServiceUnit, UnitOverview } from "@/lib/content/types";
import { play } from "@/lib/game/sfx";
import { edgePath, hasGlyph, labelLines, layoutDiagram, LINE_H } from "@/lib/game/diagram-layout";
import { GameIcon, type GameIconName } from "./icons";

const KIND_STYLE: Record<DiagramNode["kind"], { fill: string; text: string; icon: GameIconName | null; iconClass?: string }> = {
  service: { fill: "#ffc933", text: "#1c1840", icon: "mesh-network" },
  actor: { fill: "#3d8bff", text: "#ffffff", icon: null },
  data: { fill: "#dff5e9", text: "#1c1840", icon: "cardboard-box", iconClass: "text-green" },
  zone: { fill: "none", text: "#5e5a86", icon: null },
  note: { fill: "#efeefa", text: "#1c1840", icon: "light-bulb", iconClass: "text-amber" },
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
  startAtSummary = false,
}: {
  unit: ServiceUnit;
  island: Island | null;
  overview: UnitOverview;
  autoRead: boolean;
  onDone: () => void;
  /** Dev preview only: open with the whole diagram revealed. */
  startAtSummary?: boolean;
}) {
  const [seg, setSeg] = useState(0);
  const [summary, setSummary] = useState(startAtSummary);
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
  const layout = useMemo(() => layoutDiagram(overview.diagram), [overview.diagram]);
  const scroller = useRef<HTMLDivElement>(null);
  // Keep the narrated node in view when the diagram is wider than the screen.
  useEffect(() => {
    const el = scroller.current;
    const f = overview.segments[seg]?.focus;
    const node = layout.nodes.find((n) => n.id === f) ?? layout.clusters.find((c) => c.id === f);
    if (!el || !node || el.scrollWidth <= el.clientWidth) return;
    const px = (node.x / layout.width) * el.scrollWidth;
    el.scrollTo({ left: px - el.clientWidth / 2, behavior: "smooth" });
  }, [seg, layout, overview.segments]);

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
        <div ref={scroller} className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="mx-auto block h-auto"
          // Never shrink text below ~11px: very wide diagrams scroll sideways instead.
          style={{ width: `max(100%, ${Math.round(layout.width * (11 / 15))}px)`, maxWidth: layout.width * 1.25 }}
          role="img"
          aria-label={`Diagrama de ${overview.title}`}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#1c1840" />
            </marker>
          </defs>
          {layout.clusters.map((c) =>
            visible.has(c.id) ? (
              <motion.g key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <rect
                  x={c.x - c.w / 2}
                  y={c.y - c.h / 2}
                  width={c.w}
                  height={c.h}
                  rx={16}
                  fill="#efeefa"
                  stroke="#1c1840"
                  strokeWidth={focus === c.id ? 3.5 : 2}
                  strokeDasharray="7 5"
                />
                {/* container name as a tab sitting on the top border, so it never collides with children */}
                <rect x={c.x + c.w / 2 - 12 - (c.node.label.length * 8.2 + 18)} y={c.y - c.h / 2 - 11} width={c.node.label.length * 8.2 + 18} height={22} rx={11} fill="#ffffff" stroke="#1c1840" strokeWidth={2} />
                <text x={c.x + c.w / 2 - 12 - (c.node.label.length * 8.2 + 18) + 9} y={c.y - c.h / 2 + 4.5} fontSize={13} fontWeight={900} fill="#1c1840">
                  {c.node.label}
                </text>
              </motion.g>
            ) : null,
          )}
          {layout.edges.map((e, i) => {
            if (!visible.has(e.from) || !visible.has(e.to)) return null;
            return (
              <motion.g key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                <path d={edgePath(e.points)} fill="none" stroke="#1c1840" strokeWidth={2.4} markerEnd="url(#arrow)" />
                {e.label && e.labelAt && (
                  <g>
                    <rect
                      x={e.labelAt.x - (e.label.length * 6.6 + 10) / 2}
                      y={e.labelAt.y - 9}
                      width={e.label.length * 6.6 + 10}
                      height={18}
                      rx={9}
                      fill="#ffffff"
                      stroke="#1c1840"
                      strokeWidth={1.5}
                    />
                    <text x={e.labelAt.x} y={e.labelAt.y + 4} textAnchor="middle" fontSize={11.5} fontWeight={800} fill="#1c1840">
                      {e.label}
                    </text>
                  </g>
                )}
              </motion.g>
            );
          })}
          {layout.nodes.map((ln) => {
            if (!visible.has(ln.id)) return null;
            const n = ln.node;
            const s = KIND_STYLE[n.kind] ?? KIND_STYLE.note;
            const focused = focus === n.id;
            const x = ln.x - ln.w / 2;
            const y = ln.y - ln.h / 2;
            const glyph = hasGlyph(n) ? s.icon : null;
            return (
              <motion.g
                key={n.id}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: focused ? 1.06 : 1 }}
                transition={{ type: "spring", stiffness: 280, damping: 16 }}
                style={{ transformOrigin: `${ln.x}px ${ln.y}px` }}
              >
                {focused && (
                  <motion.rect
                    x={x - 6}
                    y={y - 6}
                    width={ln.w + 12}
                    height={ln.h + 12}
                    rx={16}
                    fill="none"
                    stroke="#ffc933"
                    strokeWidth={5}
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.3, repeat: Infinity }}
                  />
                )}
                {n.kind !== "zone" && <rect x={x} y={y + 4} width={ln.w} height={ln.h} rx={12} fill="#1c1840" />}
                <rect
                  x={x}
                  y={y}
                  width={ln.w}
                  height={ln.h}
                  rx={12}
                  fill={s.fill}
                  stroke="#1c1840"
                  strokeWidth={n.kind === "zone" ? 2 : 3}
                  strokeDasharray={n.kind === "zone" ? "7 5" : undefined}
                />
                {glyph && <GameIcon name={glyph} x={x + 12} y={ln.y - 10} size={20} className={s.iconClass} />}
                <text x={ln.x + (glyph ? 12 : 0)} textAnchor="middle" fontSize={15} fontWeight={900} fill={s.text}>
                  {labelLines(n.label).map((line, li, all) => (
                    <tspan key={li} x={ln.x + (glyph ? 12 : 0)} y={ln.y + 5.5 - ((all.length - 1) * LINE_H) / 2 + li * LINE_H}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </motion.g>
            );
          })}
        </svg>
        </div>
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
