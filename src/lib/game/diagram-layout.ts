import dagre from "@dagrejs/dagre";
import type { DiagramNode, UnitOverview } from "../content/types";

/**
 * Auto-layout for service diagrams (dagre, layered): no overlapping boxes, edges routed
 * around nodes, labels placed on the edge. "contains"-type edges from a zone become
 * nesting (the child is drawn inside the zone). The authored x/y are ignored.
 */
export const NODE_H = 44;
export const LINE_H = 18;
const CHAR_W = 8.4;
const PAD_X = 12;
const ICON_W = 24;
const LABEL_H = 16;
const CONTAINS = /contien|contain|incluye|dentro|aloja|hosts|inside/i;

export interface LaidNode {
  id: string;
  x: number; // centre
  y: number;
  w: number;
  h: number;
  node: DiagramNode;
}
export interface LaidEdge {
  from: string;
  to: string;
  label?: string;
  points: { x: number; y: number }[];
  labelAt: { x: number; y: number } | null;
}
export interface LaidCluster {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  node: DiagramNode;
}
export interface DiagramLayout {
  width: number;
  height: number;
  nodes: LaidNode[];
  edges: LaidEdge[];
  clusters: LaidCluster[];
  rankdir: "LR" | "TB";
}

export const hasGlyph = (n: DiagramNode) => n.kind === "service" || n.kind === "data" || n.kind === "note";

/** Labels longer than ~11 characters wrap onto two balanced lines. */
export function labelLines(label: string): string[] {
  if (label.length <= 11 || !label.includes(" ")) return [label];
  const words = label.split(" ");
  let best: string[] = [label];
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const w = Math.max(a.length, b.length);
    if (w < bestW) {
      bestW = w;
      best = [a, b];
    }
  }
  return best;
}
export const nodeWidth = (n: DiagramNode) =>
  Math.round(Math.max(...labelLines(n.label).map((l) => l.length)) * CHAR_W + PAD_X * 2 + (hasGlyph(n) ? ICON_W : 0));
export const nodeHeight = (n: DiagramNode) => (labelLines(n.label).length > 1 ? NODE_H + LINE_H - 4 : NODE_H);

function layoutOnce(d: UnitOverview["diagram"], rankdir: "LR" | "TB"): DiagramLayout {
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({ rankdir, nodesep: 14, ranksep: rankdir === "LR" ? 44 : 40, edgesep: 10, marginx: 8, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));

  const ids = new Set(d.nodes.map((n) => n.id));
  // Containment: zone --contains--> child becomes nesting when the zone is a real container.
  const parentOf = new Map<string, string>();
  for (const e of d.edges) {
    const from = d.nodes.find((n) => n.id === e.from);
    if (from?.kind === "zone" && CONTAINS.test(e.label ?? "") && ids.has(e.to) && !parentOf.has(e.to)) parentOf.set(e.to, e.from);
  }
  const containers = new Set(parentOf.values());

  for (const n of d.nodes) {
    if (containers.has(n.id)) g.setNode(n.id, { label: n.label, paddingTop: 30, paddingLeft: 12, paddingRight: 12, paddingBottom: 12 });
    else g.setNode(n.id, { width: nodeWidth(n), height: nodeHeight(n) });
  }
  for (const [child, parent] of parentOf) g.setParent(child, parent);

  d.edges.forEach((e, i) => {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) return;
    if (parentOf.get(e.to) === e.from && CONTAINS.test(e.label ?? "")) return; // shown as nesting
    if (containers.has(e.from) || containers.has(e.to)) return; // dagre can't route edges to clusters
    const label = e.label?.trim();
    g.setEdge(
      e.from,
      e.to,
      label ? { label, width: Math.round(label.length * 6.2 + 10), height: LABEL_H, labelpos: "c" } : {},
      `e${i}`,
    );
  });

  dagre.layout(g);

  const nodes: LaidNode[] = [];
  const clusters: LaidCluster[] = [];
  for (const n of d.nodes) {
    const v = g.node(n.id);
    if (!v) continue;
    if (containers.has(n.id)) clusters.push({ id: n.id, x: v.x, y: v.y, w: v.width, h: v.height, node: n });
    else nodes.push({ id: n.id, x: v.x, y: v.y, w: v.width, h: v.height, node: n });
  }
  const edges: LaidEdge[] = g.edges().map((ed) => {
    const lab = g.edge(ed) as { points: { x: number; y: number }[]; label?: string; x?: number; y?: number };
    return {
      from: ed.v,
      to: ed.w,
      label: lab.label,
      points: lab.points ?? [],
      labelAt: lab.label && lab.x != null && lab.y != null ? { x: lab.x, y: lab.y } : null,
    };
  });
  const gl = g.graph() as { width?: number; height?: number };
  return { width: gl.width ?? 300, height: gl.height ?? 200, nodes, edges, clusters, rankdir };
}

/**
 * Pick the orientation that keeps text largest on a phone-width container
 * (scale = containerWidth / layoutWidth), while not getting absurdly tall.
 */
export function layoutDiagram(d: UnitOverview["diagram"], containerWidth = 340, maxHeight = 620): DiagramLayout {
  const options = (["LR", "TB"] as const).map((dir) => {
    const l = layoutOnce(d, dir);
    const scale = Math.min(1, containerWidth / l.width);
    const tall = l.height * scale > maxHeight ? (l.height * scale) / maxHeight : 1;
    return { l, score: scale / tall };
  });
  options.sort((a, b) => b.score - a.score);
  return options[0].l;
}

/** Rounded polyline through dagre's edge points. */
export function edgePath(points: { x: number; y: number }[], r = 10): string {
  if (points.length < 2) return "";
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1];
    const c = points[i];
    const n = points[i + 1];
    const d1 = Math.hypot(c.x - p.x, c.y - p.y) || 1;
    const d2 = Math.hypot(n.x - c.x, n.y - c.y) || 1;
    const k1 = Math.min(r, d1 / 2) / d1;
    const k2 = Math.min(r, d2 / 2) / d2;
    d += ` L${c.x - (c.x - p.x) * k1},${c.y - (c.y - p.y) * k1} Q${c.x},${c.y} ${c.x + (n.x - c.x) * k2},${c.y + (n.y - c.y) * k2}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last.x},${last.y}`;
}
