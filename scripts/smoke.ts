/**
 * End-to-end smoke test of the study loop against a throwaway database and
 * synthetic content (no OpenAI calls).
 *
 *   TEST_DATABASE_URL=postgres://… pnpm smoke
 *
 * Run with the react-server condition so "server-only" modules load outside Next.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import type { ConceptContent, Syllabus } from "../src/lib/content/types";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required (never point it at the real database)");

// ---- synthetic content: 12 concepts × 4 questions (A is always correct)
const syllabus: Syllabus = JSON.parse(fs.readFileSync("content/syllabus.json", "utf8"));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "learnaws-smoke-"));
fs.mkdirSync(path.join(dir, "concepts"));
const picked = [...syllabus.concepts].sort((a, b) => a.order - b.order).slice(0, 12).map((c) => ({ ...c, prerequisites: [] }));
fs.writeFileSync(path.join(dir, "syllabus.json"), JSON.stringify({ ...syllabus, concepts: picked }));
const body = { tldr: "t", whenToUse: ["w"], keyFacts: ["k"], gotchas: ["g"], confusedWith: [], examCues: ["c"] };
for (const c of picked) {
  const cc: ConceptContent = {
    conceptId: c.id,
    card: { en: body, es: body, docs: [] },
    questions: Array.from({ length: 4 }, (_, i) => ({
      id: `${c.id}--q${i}`,
      conceptId: c.id,
      secondaryConcepts: [],
      domain: c.domain,
      type: "single",
      difficulty: 2,
      stem: `stem ${i}`,
      options: ["A", "B", "C", "D"].map((id) => ({ id, text: id, correct: id === "A", why: "" })),
      explanation: "",
      keywordCues: [],
      docs: [],
      es: { stem: "", options: ["A", "B", "C", "D"].map((id) => ({ id, text: id, why: "" })), explanation: "" },
      heldOut: i === 3,
      source: "generated",
      verification: { status: "pass", notes: "" },
    })),
    recall: [],
  };
  fs.writeFileSync(path.join(dir, "concepts", `${c.id}.json`), JSON.stringify(cc));
}
process.env.CONTENT_DIR = dir;
process.env.DATABASE_URL = url;

const U = "smoke-user-a";
const OTHER = "smoke-user-b";

async function main() {
  // fresh schema
  const sql = postgres(url!, { onnotice: () => {} });
  await sql`drop schema if exists public cascade`;
  await sql`drop schema if exists drizzle cascade`;
  await sql`create schema public`;
  await sql.end();

  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db, schema } = await import("../src/db");
  await migrate(db, { migrationsFolder: "drizzle" });
  const session = await import("../src/lib/study/session");
  const store = await import("../src/lib/study/store");
  const mocks = await import("../src/lib/study/mocks");
  const metrics = await import("../src/lib/study/metrics");

  // 1) first session is the diagnostic
  let item = await session.currentItem(U);
  assert.equal(item.session.kind, "diagnostic");
  let n = 0;
  while (item.kind === "question") {
    // get half right with high confidence, half wrong
    const right = n % 2 === 0;
    await session.submitAnswer(U, { questionId: item.question.id, selected: [right ? "A" : "B"], confidence: right ? 3 : 2, timeMs: 30_000, usedSpanish: false });
    await session.advance(U);
    item = await session.currentItem(U);
    n++;
  }
  assert.equal(item.kind, "done");
  console.log(`✓ diagnóstico: ${n} preguntas`);

  // 2) next plan teaches new concepts: card → learn until 3 unaided corrects
  await store.saveSession(U, null);
  await session.buildSession(U, 60);
  item = await session.currentItem(U);
  assert.equal(item.session.kind, "normal");
  const seenPerConcept = new Map<string, string[]>();
  let steps = 0;
  while (item.kind !== "done" && steps++ < 200) {
    if (item.kind === "card" || item.kind === "discover") {
      await session.advance(U);
    } else {
      const q = item.question;
      assert.ok(!q.id.endsWith("--q3"), "held-out question leaked into practice");
      const prev = seenPerConcept.get(q.conceptId) ?? [];
      assert.notEqual(prev.at(-1), q.id, "same question twice in a row");
      seenPerConcept.set(q.conceptId, [...prev, q.id]);
      // first learn attempt of each concept wrong, rest right
      const wrong = item.mode === "learn" && prev.length === 0;
      const r = await session.submitAnswer(U, { questionId: q.id, selected: [wrong ? "C" : "A"], confidence: 2, timeMs: 20_000, usedSpanish: false });
      assert.equal(r.correct, !wrong);
      assert.equal(r.reveal == null, wrong, "wrong answers must not reveal the key");
      await session.advance(U);
    }
    item = await session.currentItem(U);
  }
  assert.equal(item.kind, "done");
  const rows = (await db.select().from(schema.conceptState)).filter((r) => r.userId === U);
  const reviewing = rows.filter((r) => r.phase === "reviewing");
  assert.ok(reviewing.length > 0, "some concepts reached FSRS");
  const settings = await store.getSettings(U);
  for (const r of reviewing) {
    assert.ok(r.initialStreak >= 3, "graduated initial session needs 3 unaided corrects");
    assert.ok(r.due && r.due <= new Date(settings.targetDate), "due after target");
  }
  console.log(`✓ sesión normal: ${reviewing.length} conceptos pasaron a repaso espaciado`);

  // 3) make them due and review: wrong answer → relearn card + relearn question inserted
  await db.update(schema.conceptState).set({ due: new Date(Date.now() - 60_000) });
  await store.saveSession(U, null);
  await session.buildSession(U, 20);
  item = await session.currentItem(U);
  assert.equal(item.kind, "question");
  if (item.kind === "question") {
    assert.equal(item.mode, "review");
    await session.submitAnswer(U, { questionId: item.question.id, selected: ["B"], confidence: 3, timeMs: 10_000, usedSpanish: false });
    await session.advance(U);
    const next = await session.currentItem(U);
    assert.equal(next.kind, "card", "relearn card follows a lapse");
    const s = await store.getSession(U);
    assert.ok(s!.queue.some((i) => i.t === "q" && i.mode === "relearn"));
    const hce = await store.highConfidenceErrors(U);
    assert.ok(hce.has(item.question.conceptId));
  }
  console.log("✓ repaso fallado → ficha + reaprendizaje; error de certeza alta registrado");

  // 4) mini mock + dashboard
  const m = await mocks.startMock(U, "mini");
  const full = await mocks.getMock(U, m.id);
  assert.ok(full!.questions.every((q) => !q.heldOut), "mini mock uses practice questions");
  const fm = await mocks.startMock(U, "full");
  const fullQ = await mocks.getMock(U, fm.id);
  assert.ok(fullQ!.questions.every((q) => q.heldOut), "full mock uses held-out questions only");
  const res = await mocks.submitMock(U, fm.id, Object.fromEntries(fullQ!.questions.map((q) => [q.id, { selected: ["A"], confidence: 2 as const, usedSpanish: false }])), 60_000);
  assert.equal(res.scorePct, 100);
  const d = await metrics.dashboard(U);
  assert.ok(d.readiness.evidence >= fullQ!.questions.length);
  console.log(`✓ simulacros y panel (evidencia ${d.readiness.evidence}, P(aprobar) ${(d.readiness.passProbability * 100).toFixed(0)}%)`);

  // 5) isolation: another user starts from zero
  const other = await session.currentItem(OTHER);
  assert.equal(other.session.kind, "diagnostic", "a new user gets their own diagnostic");
  const od = await metrics.dashboard(OTHER);
  assert.equal(od.readiness.evidence, 0);
  assert.equal((await mocks.listMocks(OTHER)).length, 0);
  assert.equal(await mocks.getMock(OTHER, m.id), null, "cannot read another user's mock");
  console.log("✓ aislamiento entre usuarios");

  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
