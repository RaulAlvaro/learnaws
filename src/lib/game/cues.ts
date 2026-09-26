/**
 * Turns the verified keyword cues of a long scenario into visual requirement chips
 * (signaling principle: highlight what decides the answer, cut reading load).
 */
export interface Chip {
  emoji: string;
  label: string;
}

const RULES: [RegExp, Chip][] = [
  [/cost|cheap|budget|price|spend|economic/i, { emoji: "💰", label: "Menor costo" }],
  [/operational overhead|manage|maintenance|administ|serverless|fully managed/i, { emoji: "⚙️", label: "Menos operación" }],
  [/highly available|high availability|availability zone|multi-az|fault[- ]toleran|resilien|failover|outage|disaster|rpo|rto/i, { emoji: "🛡️", label: "Alta disponibilidad" }],
  [/latency|performance|throughput|fast|milliseconds|iops|scal/i, { emoji: "⚡", label: "Rendimiento" }],
  [/secur|encrypt|least privilege|compliance|audit|private|public internet|access control|permission/i, { emoji: "🔒", label: "Seguridad" }],
  [/decoupl|asynchron|queue|buffer|event|loosely/i, { emoji: "🔗", label: "Desacoplar" }],
  [/global|region|worldwide|geograph|edge/i, { emoji: "🌍", label: "Global / multi-región" }],
  [/order|exactly once|duplicate|fifo/i, { emoji: "🔢", label: "Orden / sin duplicados" }],
  [/real[- ]time|stream|near real/i, { emoji: "📡", label: "Tiempo real" }],
  [/archiv|retain|retention|long-term|years|infrequent/i, { emoji: "🗄️", label: "Retención / archivo" }],
  [/migrat|on-premises|on premises|hybrid/i, { emoji: "🏢", label: "Híbrido / migración" }],
];

export function chipsFor(cues: string[], stem = ""): Chip[] {
  const text = `${cues.join(" | ")} ${stem.slice(-300)}`;
  const out: Chip[] = [];
  for (const [re, chip] of RULES) {
    if (re.test(text) && !out.some((c) => c.label === chip.label)) out.push(chip);
    if (out.length === 4) break;
  }
  return out;
}

/** Split a stem into plain and highlighted parts for the given cue phrases (case-insensitive). */
export function highlight(stem: string, cues: string[]): { text: string; hit: boolean }[] {
  const phrases = cues.map((c) => c.trim()).filter((c) => c.length >= 3).sort((a, b) => b.length - a.length);
  if (!phrases.length) return [{ text: stem, hit: false }];
  const re = new RegExp(`(${phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return stem.split(re).filter(Boolean).map((text) => ({ text, hit: phrases.some((p) => p.toLowerCase() === text.toLowerCase()) }));
}
