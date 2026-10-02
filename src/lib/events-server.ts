import "server-only";
import { and, asc, count, desc, eq, gt, isNotNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { EventQuestionState } from "@/db/schema";
import { getContent } from "./content/load";
import { pointsFor, type GameEvent } from "./events";

const GRACE_MS = 1500; // network slack on top of the visible timer

function shuffle<T>(a: T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Random 4-option lightning items (short, audited, bilingual), each from a different service unit. */
export function pickQuestions(n: number): EventQuestionState[] {
  const c = getContent();
  const pool = shuffle(
    [...c.questions.values()].filter((q) => q.format === "lightning" && q.type === "single" && q.options.length === 4 && !q.heldOut),
  );
  const units = new Set<string>();
  const picked: EventQuestionState[] = [];
  for (const q of pool) {
    const unit = c.unitByConcept.get(q.conceptId) ?? q.conceptId;
    if (units.has(unit)) continue;
    units.add(unit);
    picked.push({ id: q.id, order: shuffle(q.options.map((o) => o.id)) });
    if (picked.length === n) break;
  }
  return picked;
}

export async function getEntry(eventId: string, userId: string) {
  const [row] = await db
    .select({
      displayName: schema.eventEntries.displayName,
      questions: schema.eventEntries.questions,
      current: schema.eventEntries.current,
      score: schema.eventEntries.score,
      correct: schema.eventEntries.correct,
      totalMs: schema.eventEntries.totalMs,
      finishedAt: schema.eventEntries.finishedAt,
      photoAt: schema.eventEntries.photoAt,
      hidden: schema.eventEntries.hidden,
    })
    .from(schema.eventEntries)
    .where(and(eq(schema.eventEntries.eventId, eventId), eq(schema.eventEntries.userId, userId)));
  return row ?? null;
}
export type Entry = NonNullable<Awaited<ReturnType<typeof getEntry>>>;

/** First name from the profile, else a neutral handle. Never the email. */
export async function defaultDisplayName(userId: string) {
  const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId));
  const first = u?.name?.trim().split(/\s+/)[0];
  if (first) return first.slice(0, 24);
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) % 9000;
  return `Jugador ${1000 + h}`;
}

export async function startEntry(e: GameEvent, userId: string) {
  await db
    .insert(schema.eventEntries)
    .values({ eventId: e.slug, userId, displayName: await defaultDisplayName(userId), questions: pickQuestions(e.questionCount) })
    .onConflictDoNothing();
  return (await getEntry(e.slug, userId))!;
}

/** The current question as the player sees it; stamps servedAt the first time (the timer starts here). */
export async function serveCurrent(e: GameEvent, userId: string, entry: Entry) {
  if (entry.current >= entry.questions.length) return null;
  const qs = [...entry.questions];
  const state = qs[entry.current];
  if (!state.servedAt) {
    qs[entry.current] = { ...state, servedAt: new Date().toISOString() };
    await db
      .update(schema.eventEntries)
      .set({ questions: qs })
      .where(and(eq(schema.eventEntries.eventId, e.slug), eq(schema.eventEntries.userId, userId), eq(schema.eventEntries.current, entry.current)));
  }
  const servedAt = new Date(qs[entry.current].servedAt!).getTime();
  const q = getContent().questions.get(state.id)!;
  return {
    index: entry.current,
    total: entry.questions.length,
    id: q.id,
    seconds: e.secondsPerQuestion,
    remainingMs: Math.max(0, servedAt + e.secondsPerQuestion * 1000 - Date.now()),
    stem: { en: q.stem, es: q.es.stem },
    options: state.order.map((id) => ({
      id,
      en: q.options.find((o) => o.id === id)!.text,
      es: q.es.options.find((o) => o.id === id)?.text ?? q.options.find((o) => o.id === id)!.text,
    })),
  };
}

export class EventConflictError extends Error {}

export async function answerCurrent(e: GameEvent, userId: string, entry: Entry, questionId: string, choice: string | null) {
  const idx = entry.current;
  const state = entry.questions[idx];
  if (!state || state.id !== questionId || !state.servedAt) throw new EventConflictError("Esa pregunta ya no está activa.");
  const q = getContent().questions.get(state.id)!;
  const correctId = q.options.find((o) => o.correct)!.id;
  const now = Date.now();
  const elapsed = now - new Date(state.servedAt).getTime();
  const inTime = elapsed <= e.secondsPerQuestion * 1000 + GRACE_MS;
  const correct = inTime && choice === correctId;
  const points = pointsFor(correct, elapsed, e.secondsPerQuestion);

  const qs = [...entry.questions];
  qs[idx] = { ...state, answeredAt: new Date(now).toISOString(), chosen: choice, correct, points };
  const done = idx + 1 >= qs.length;
  const [row] = await db
    .update(schema.eventEntries)
    .set({
      questions: qs,
      current: idx + 1,
      score: entry.score + points,
      correct: entry.correct + (correct ? 1 : 0),
      totalMs: entry.totalMs + Math.min(elapsed, e.secondsPerQuestion * 1000),
      finishedAt: done ? new Date(now) : null,
    })
    .where(and(eq(schema.eventEntries.eventId, e.slug), eq(schema.eventEntries.userId, userId), eq(schema.eventEntries.current, idx)))
    .returning({ score: schema.eventEntries.score });
  if (!row) throw new EventConflictError("Esa respuesta ya se registró.");
  return {
    correct,
    timedOut: !inTime,
    correctId,
    points,
    score: row.score,
    done,
    explanation: q.es.explanation || q.explanation,
  };
}

export async function leaderboard(eventId: string, limit = 100) {
  return db
    .select({
      userId: schema.eventEntries.userId,
      displayName: schema.eventEntries.displayName,
      score: schema.eventEntries.score,
      correct: schema.eventEntries.correct,
      totalMs: schema.eventEntries.totalMs,
      photoAt: schema.eventEntries.photoAt,
    })
    .from(schema.eventEntries)
    .where(and(eq(schema.eventEntries.eventId, eventId), isNotNull(schema.eventEntries.finishedAt), eq(schema.eventEntries.hidden, false)))
    .orderBy(desc(schema.eventEntries.score), asc(schema.eventEntries.totalMs), asc(schema.eventEntries.finishedAt))
    .limit(limit);
}

/** 1-based position among finished, visible players (same ordering as the leaderboard). */
export async function rankOf(eventId: string, entry: Entry) {
  if (!entry.finishedAt) return null;
  const t = schema.eventEntries;
  const [{ n }] = await db
    .select({ n: count() })
    .from(t)
    .where(
      and(
        eq(t.eventId, eventId),
        isNotNull(t.finishedAt),
        eq(t.hidden, false),
        or(
          gt(t.score, entry.score),
          and(eq(t.score, entry.score), lt(t.totalMs, entry.totalMs)),
          and(eq(t.score, entry.score), eq(t.totalMs, entry.totalMs), lt(t.finishedAt, entry.finishedAt)),
        ),
      ),
    );
  const [{ players }] = await db
    .select({ players: count() })
    .from(t)
    .where(and(eq(t.eventId, eventId), isNotNull(t.finishedAt), eq(t.hidden, false)));
  return { rank: n + 1, players };
}

export async function playerCount(eventId: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.eventEntries)
    .where(and(eq(schema.eventEntries.eventId, eventId), isNotNull(schema.eventEntries.finishedAt), eq(schema.eventEntries.hidden, false)));
  return n;
}
