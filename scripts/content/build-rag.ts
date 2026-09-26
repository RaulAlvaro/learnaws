/**
 * Builds the retrieval index for the "Pregúntale al experto" feature.
 *
 *   pnpm tsx scripts/content/build-rag.ts
 *
 * Sources (all already verified or official):
 *  - concept cards (key facts, gotchas, look-alikes), EN + ES
 *  - explanations of PRACTICE questions (held-out mock questions are excluded so the expert
 *    can never leak a mock answer)
 *  - service overviews (narration + key points)
 *  - AWS documentation excerpts cached by the content pipeline
 *
 * Output: content/rag/chunks.json + content/rag/vectors.bin (Float32, L2-normalised, DIMS each).
 */
import { config } from "dotenv";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import type { ConceptContent, Syllabus, UnitContent } from "../../src/lib/content/types";

config({ path: [".env.local", ".env"], quiet: true });

export const EMBED_MODEL = "text-embedding-3-small";
export const DIMS = 384;
const CONTENT = path.join(process.cwd(), "content");
const OUT = path.join(CONTENT, "rag");
const DOCS = path.join(CONTENT, ".pipeline", "docs");

interface Chunk {
  id: string;
  source: "card" | "question" | "unit" | "doc";
  title: string;
  conceptId: string | null;
  unitId: string | null;
  url: string | null;
  text: string;
}

const syllabus: Syllabus = JSON.parse(fs.readFileSync(path.join(CONTENT, "syllabus.json"), "utf8"));
const conceptTitle = new Map(syllabus.concepts.map((c) => [c.id, c.title]));
const chunks: Chunk[] = [];

// Cards and practice-question explanations.
for (const f of fs.readdirSync(path.join(CONTENT, "concepts"))) {
  const cc: ConceptContent = JSON.parse(fs.readFileSync(path.join(CONTENT, "concepts", f), "utf8"));
  const title = conceptTitle.get(cc.conceptId) ?? cc.conceptId;
  const en = cc.card.en;
  const es = cc.card.es;
  chunks.push({
    id: `card:${cc.conceptId}`,
    source: "card",
    title,
    conceptId: cc.conceptId,
    unitId: null,
    url: cc.card.docs[0] ?? null,
    text: [
      `${title}. ${en.tldr}`,
      `When to use: ${en.whenToUse.join("; ")}`,
      `Key facts: ${en.keyFacts.join("; ")}`,
      `Gotchas: ${en.gotchas.join("; ")}`,
      `Confused with: ${en.confusedWith.map((c) => `${c.concept}: ${c.difference}`).join("; ")}`,
      `ES: ${es.tldr} ${es.keyFacts.join("; ")}`,
    ].join("\n"),
  });
  for (const q of cc.questions) {
    if (q.heldOut) continue;
    chunks.push({
      id: `q:${q.id}`,
      source: "question",
      title,
      conceptId: cc.conceptId,
      unitId: null,
      url: q.docs[0] ?? null,
      text: `Scenario: ${q.stem}\nCorrect: ${q.options.filter((o) => o.correct).map((o) => o.text).join(" + ")}\nWhy: ${q.explanation}\nWrong options: ${q.options
        .filter((o) => !o.correct)
        .map((o) => `${o.text} (${o.why})`)
        .join("; ")}`,
    });
  }
}

// Service overviews.
for (const f of fs.readdirSync(path.join(CONTENT, "units")).filter((x) => x.endsWith(".json"))) {
  const u: UnitContent = JSON.parse(fs.readFileSync(path.join(CONTENT, "units", f), "utf8"));
  if (!u.audited) continue;
  chunks.push({
    id: `unit:${u.unitId}`,
    source: "unit",
    title: u.overview.title,
    conceptId: null,
    unitId: u.unitId,
    url: null,
    text: `${u.overview.title}. ${u.overview.segments.map((s) => s.narration).join(" ")}\nLo esencial: ${u.overview.keyPoints.join("; ")}\nNo confundir: ${u.overview.confusedWith
      .map((c) => `${c.unitOrService}: ${c.difference}`)
      .join("; ")}`,
  });
}

// AWS documentation excerpts (~900-character windows with overlap).
const urlByHash = new Map<string, { url: string; conceptId: string }>();
for (const c of syllabus.concepts)
  for (const u of c.docs) urlByHash.set(createHash("sha1").update(u).digest("hex"), { url: u, conceptId: c.id });
if (fs.existsSync(DOCS)) {
  for (const f of fs.readdirSync(DOCS)) {
    const meta = urlByHash.get(f.replace(/\.txt$/, ""));
    if (!meta) continue;
    const body = fs.readFileSync(path.join(DOCS, f), "utf8").replace(/^SOURCE: .*\n/, "").replace(/\s+/g, " ").trim();
    for (let i = 0, n = 0; i < body.length && n < 12; i += 750, n++) {
      const text = body.slice(i, i + 900);
      if (text.length < 200) continue;
      chunks.push({
        id: `doc:${f.slice(0, 10)}:${n}`,
        source: "doc",
        title: conceptTitle.get(meta.conceptId) ?? "AWS docs",
        conceptId: meta.conceptId,
        unitId: null,
        url: meta.url,
        text,
      });
    }
  }
}

async function main() {
  console.log(`${chunks.length} fragmentos`);
  const client = new OpenAI();
  const vectors = new Float32Array(chunks.length * DIMS);
  const BATCH = 96;
  let tokens = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const res = await client.embeddings.create({ model: EMBED_MODEL, input: batch.map((c) => c.text), dimensions: DIMS });
    tokens += res.usage.total_tokens;
    res.data.forEach((d, j) => {
      const v = d.embedding;
      const norm = Math.hypot(...v) || 1;
      for (let k = 0; k < DIMS; k++) vectors[(i + j) * DIMS + k] = v[k] / norm;
    });
    process.stdout.write(`\r${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "chunks.json"), JSON.stringify({ model: EMBED_MODEL, dims: DIMS, chunks }));
  fs.writeFileSync(path.join(OUT, "vectors.bin"), Buffer.from(vectors.buffer));
  console.log(`\nlisto · ${tokens} tokens (~US$${((tokens / 1e6) * 0.02).toFixed(3)})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
