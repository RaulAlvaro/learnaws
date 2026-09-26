import "server-only";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getContent } from "../content/load";
import type { Question } from "../content/types";
import { shuffle } from "../engine/planner";
import { disabledQuestionIds, logStudy } from "./store";
import { isCorrect, publicQuestion } from "./session";

export const MOCK_SPECS = {
  mini: { size: 25, minutes: 50 },
  full: { size: 65, minutes: 130 },
} as const;

/** Sample by official domain weights, ~20% multi-response, like the real exam. */
function sampleByWeight(pool: Question[], size: number, seed: number): Question[] {
  const { syllabus } = getContent();
  const out: Question[] = [];
  for (const d of syllabus.domains) {
    const want = Math.round(d.weight * size);
    const own = shuffle(pool.filter((q) => q.domain === d.id), seed + d.id.charCodeAt(1));
    const multi = own.filter((q) => q.type === "multi");
    const single = own.filter((q) => q.type === "single");
    const nMulti = Math.min(multi.length, Math.round(want * 0.2));
    out.push(...multi.slice(0, nMulti), ...single.slice(0, want - nMulti));
  }
  // top up if a domain was short
  if (out.length < size) {
    const used = new Set(out.map((q) => q.id));
    out.push(...shuffle(pool.filter((q) => !used.has(q.id)), seed).slice(0, size - out.length));
  }
  return shuffle(out.slice(0, size), seed);
}

async function usedInMocks(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ ids: schema.mocks.questionIds })
    .from(schema.mocks)
    .where(and(eq(schema.mocks.userId, userId), isNotNull(schema.mocks.finishedAt)));
  return new Set(rows.flatMap((r) => r.ids));
}

/**
 * Full mocks use only the held-out bank (never practised). Mini mocks measure
 * delayed retention: practice questions not seen in the last 14 days.
 */
export async function startMock(userId: string, kind: "mini" | "full") {
  const { questions } = getContent();
  const disabled = await disabledQuestionIds(userId);
  const all = [...questions.values()].filter((q) => !disabled.has(q.id));
  const seed = Date.now();
  let pool: Question[];
  if (kind === "full") {
    const used = await usedInMocks(userId);
    const heldOut = all.filter((q) => q.heldOut);
    const unused = heldOut.filter((q) => !used.has(q.id));
    pool = unused.length >= MOCK_SPECS.full.size ? unused : heldOut;
  } else {
    const since = new Date(Date.now() - 14 * 86_400_000);
    const recent = await db
      .selectDistinct({ id: schema.attempts.questionId })
      .from(schema.attempts)
      .where(and(eq(schema.attempts.userId, userId), gte(schema.attempts.createdAt, since)));
    const recentIds = new Set(recent.map((r) => r.id));
    pool = all.filter((q) => !q.heldOut && !recentIds.has(q.id));
  }
  const picked = sampleByWeight(pool, MOCK_SPECS[kind].size, seed);
  const [mock] = await db
    .insert(schema.mocks)
    .values({ userId, kind, questionIds: picked.map((q) => q.id), durationMin: MOCK_SPECS[kind].minutes })
    .returning();
  return mock;
}

export async function getMock(userId: string, id: number) {
  const [mock] = await db
    .select()
    .from(schema.mocks)
    .where(and(eq(schema.mocks.id, id), eq(schema.mocks.userId, userId)));
  if (!mock) return null;
  const { questions } = getContent();
  return {
    mock,
    questions: mock.questionIds.map((qid) => questions.get(qid)).filter((q): q is Question => !!q),
  };
}

export async function mockForClient(userId: string, id: number) {
  const m = await getMock(userId, id);
  if (!m) return null;
  return { mock: m.mock, questions: m.questions.map(publicQuestion) };
}

export interface MockAnswer {
  selected: string[];
  confidence: 1 | 2 | 3;
  usedSpanish: boolean;
}

/** Delayed feedback: everything is scored at the end (Butler et al. 2007). */
export async function submitMock(userId: string, id: number, answers: Record<string, MockAnswer>, elapsedMs: number) {
  const m = await getMock(userId, id);
  if (!m) throw new Error("Simulacro no encontrado");
  if (m.mock.finishedAt) throw new Error("Simulacro ya enviado");
  const perDomain: Record<string, { correct: number; total: number }> = {};
  const rows: (typeof schema.attempts.$inferInsert)[] = [];
  let correctCount = 0;
  const seen = await db
    .selectDistinct({ id: schema.attempts.questionId })
    .from(schema.attempts)
    .where(eq(schema.attempts.userId, userId));
  const seenIds = new Set(seen.map((r) => r.id));
  for (const q of m.questions) {
    const a = answers[q.id] ?? { selected: [], confidence: 1, usedSpanish: false };
    const ok = isCorrect(q, a.selected);
    perDomain[q.domain] ??= { correct: 0, total: 0 };
    perDomain[q.domain].total++;
    if (ok) {
      perDomain[q.domain].correct++;
      correctCount++;
    }
    rows.push({
      userId,
      questionId: q.id,
      conceptId: q.conceptId,
      domain: q.domain,
      mode: "mock",
      mockId: id,
      selected: a.selected,
      correct: ok,
      confidence: a.confidence,
      usedSpanish: a.usedSpanish,
      fresh: !seenIds.has(q.id),
    });
  }
  if (rows.length) await db.insert(schema.attempts).values(rows);
  const scorePct = m.questions.length ? (correctCount / m.questions.length) * 100 : 0;
  await db
    .update(schema.mocks)
    .set({ finishedAt: new Date(), scorePct, perDomain })
    .where(eq(schema.mocks.id, id));
  await logStudy(userId, elapsedMs / 60_000);
  return { scorePct, perDomain };
}

export async function addExternalMock(userId: string, source: string, scorePct: number) {
  const [row] = await db
    .insert(schema.mocks)
    .values({ userId, kind: "external", questionIds: [], durationMin: 130, finishedAt: new Date(), scorePct, source })
    .returning();
  return row;
}

export async function listMocks(userId: string) {
  return db.select().from(schema.mocks).where(eq(schema.mocks.userId, userId)).orderBy(desc(schema.mocks.startedAt));
}

export async function mockAttempts(userId: string, id: number) {
  return db
    .select()
    .from(schema.attempts)
    .where(and(eq(schema.attempts.userId, userId), eq(schema.attempts.mockId, id), eq(schema.attempts.mode, "mock")))
    .orderBy(sql`${schema.attempts.id}`);
}
