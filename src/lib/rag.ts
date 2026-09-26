import "server-only";
import fs from "node:fs";
import path from "node:path";
import { aiForUser, assertBudget, recordUsage } from "./ai/client";

/** Retrieval over verified content + cached AWS docs (built by scripts/content/build-rag.ts). */
export interface RagChunk {
  id: string;
  source: "card" | "question" | "unit" | "doc";
  title: string;
  conceptId: string | null;
  unitId: string | null;
  url: string | null;
  text: string;
}

interface Index {
  model: string;
  dims: number;
  chunks: RagChunk[];
  vectors: Float32Array;
}

let index: Index | null = null;

function load(): Index {
  if (index) return index;
  const dir = path.join(process.env.CONTENT_DIR ?? path.join(process.cwd(), "content"), "rag");
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "chunks.json"), "utf8")) as Omit<Index, "vectors">;
  const buf = fs.readFileSync(path.join(dir, "vectors.bin"));
  const vectors = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  index = { ...meta, vectors };
  return index;
}

export async function embedQuery(userId: string, text: string): Promise<Float32Array> {
  const idx = load();
  await assertBudget(userId);
  const res = await (await aiForUser(userId)).embeddings.create({ model: idx.model, input: text.slice(0, 4000), dimensions: idx.dims });
  await recordUsage({ userId, purpose: "rag-embed", model: idx.model, inputTokens: res.usage.total_tokens });
  const v = res.data[0].embedding;
  const norm = Math.hypot(...v) || 1;
  return Float32Array.from(v, (x) => x / norm);
}

/** Cosine top-k, with a small boost for chunks about the concept being discussed. */
export function search(q: Float32Array, k = 6, opts: { conceptId?: string | null } = {}): (RagChunk & { score: number })[] {
  const idx = load();
  const { dims, vectors, chunks } = idx;
  const scored: { i: number; s: number }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    let s = 0;
    const off = i * dims;
    for (let d = 0; d < dims; d++) s += vectors[off + d] * q[d];
    if (opts.conceptId && chunks[i].conceptId === opts.conceptId) s += 0.04;
    scored.push({ i, s });
  }
  scored.sort((a, b) => b.s - a.s);
  const out: (RagChunk & { score: number })[] = [];
  const seen = new Set<string>();
  for (const { i, s } of scored) {
    const c = chunks[i];
    // Avoid several near-identical windows of the same page.
    const key = c.source === "doc" ? `${c.url}` : c.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, score: s });
    if (out.length === k) break;
  }
  return out;
}

export function formatSources(chunks: RagChunk[]): string {
  return chunks
    .map((c, i) => `[${i + 1}] (${c.source === "doc" ? "AWS docs" : c.source === "card" ? "ficha verificada" : c.source === "unit" ? "explicación del servicio" : "explicación verificada"}: ${c.title})\n${c.text}`)
    .join("\n\n");
}
