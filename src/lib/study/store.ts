import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { deserializeCard, retrievability } from "../engine/scheduler";
import type { MasteryState, Phase } from "../engine/mastery";
import type { PlannerConcept, QueueItem } from "../engine/planner";
import { getContent, studyableConcepts } from "../content/load";

export const TZ = process.env.APP_TIMEZONE ?? "America/Lima";
const DAY_MS = 86_400_000;

/** Calendar day (YYYY-MM-DD) in the learner's timezone. */
export function dayOf(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function hourOf(d: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(d));
}

// ---------- settings ----------

export interface Settings {
  targetDate: string; // ISO
  dailyMinutes: number;
  reminderHour: number;
  startedAt: string;
}

export interface SessionState {
  day: string;
  kind: "diagnostic" | "normal" | "reviews-only";
  queue: (QueueItem & { questionId?: string })[];
  index: number;
  total: number;
  startedAt: string;
}

async function getSetting<T>(key: string): Promise<T | null> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  return (row?.value as T) ?? null;
}

async function putSetting(key: string, value: unknown) {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

/** Default plan: ~10 weeks at 1 h/day. */
export async function getSettings(): Promise<Settings> {
  const s = await getSetting<Settings>("settings");
  if (s) return s;
  const now = new Date();
  const fresh: Settings = {
    targetDate: new Date(now.getTime() + 70 * DAY_MS).toISOString(),
    dailyMinutes: 60,
    reminderHour: 20,
    startedAt: now.toISOString(),
  };
  await putSetting("settings", fresh);
  return fresh;
}

export async function saveSettings(patch: Partial<Settings>) {
  const s = await getSettings();
  await putSetting("settings", { ...s, ...patch });
}

export const getSession = () => getSetting<SessionState>("session");
export const saveSession = (s: SessionState | null) => putSetting("session", s);

// ---------- concept state ----------

export type ConceptRow = typeof schema.conceptState.$inferSelect;

export function masteryOf(row: ConceptRow | undefined): MasteryState {
  return {
    phase: (row?.phase ?? "unseen") as Phase,
    initialStreak: row?.initialStreak ?? 0,
    spacedSuccesses: row?.spacedSuccesses ?? 0,
    lastSpacedSuccessDay: row?.lastSpacedSuccessDay ?? null,
  };
}

export async function conceptRows(): Promise<Map<string, ConceptRow>> {
  const rows = await db.select().from(schema.conceptState);
  return new Map(rows.map((r) => [r.conceptId, r]));
}

export async function conceptRow(conceptId: string): Promise<ConceptRow | undefined> {
  const [row] = await db.select().from(schema.conceptState).where(eq(schema.conceptState.conceptId, conceptId));
  return row;
}

export async function upsertConcept(conceptId: string, patch: Partial<typeof schema.conceptState.$inferInsert>) {
  await db
    .insert(schema.conceptState)
    .values({ conceptId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.conceptState.conceptId, set: { ...patch, updatedAt: new Date() } });
}

/** Concepts whose latest graded answer was wrong with confidence 3. */
export async function highConfidenceErrors(): Promise<Set<string>> {
  const rows = await db.execute<{ concept_id: string }>(sql`
    select concept_id from (
      select distinct on (concept_id) concept_id, correct, confidence
      from attempts where hint_level = 0
      order by concept_id, created_at desc
    ) last where correct = false and confidence = 3`);
  return new Set(rows.map((r) => r.concept_id));
}

export async function plannerConcepts(now: Date, target: Date): Promise<PlannerConcept[]> {
  const [rows, hce] = await Promise.all([conceptRows(), highConfidenceErrors()]);
  return studyableConcepts().map((concept) => {
    const row = rows.get(concept.id);
    const card = row?.fsrs ? deserializeCard(row.fsrs) : null;
    return {
      concept,
      phase: (row?.phase ?? "unseen") as Phase,
      pretest: row?.pretest ?? "none",
      due: row?.due ?? null,
      examDayR: card ? retrievability(card, target, target) : 0,
      highConfidenceError: hce.has(concept.id),
    };
  });
}

// ---------- question selection ----------

export async function disabledQuestionIds(): Promise<Set<string>> {
  const rows = await db.select({ id: schema.disabledQuestions.questionId }).from(schema.disabledQuestions);
  return new Set(rows.map((r) => r.id));
}

/**
 * Pick a practice question for a concept: never held-out, never disabled,
 * never the one shown last time; unseen questions first, then least recent.
 * Each review sees a different wording of the same concept.
 */
export async function pickQuestion(conceptId: string, exclude: string[] = []): Promise<string | null> {
  const { questionsByConcept } = getContent();
  const disabled = await disabledQuestionIds();
  const row = await conceptRow(conceptId);
  const pool = (questionsByConcept.get(conceptId) ?? []).filter(
    (q) => !q.heldOut && !disabled.has(q.id) && !exclude.includes(q.id),
  );
  if (!pool.length) return null;
  const last = await db
    .select({ questionId: schema.attempts.questionId, at: sql<Date>`max(${schema.attempts.createdAt})` })
    .from(schema.attempts)
    .where(eq(schema.attempts.conceptId, conceptId))
    .groupBy(schema.attempts.questionId);
  const lastSeen = new Map(last.map((r) => [r.questionId, new Date(r.at).getTime()]));
  const candidates = pool.filter((q) => q.id !== row?.lastQuestionId);
  const list = candidates.length ? candidates : pool;
  const unseen = list.filter((q) => !lastSeen.has(q.id));
  if (unseen.length) return unseen[Math.floor(Math.random() * unseen.length)].id;
  return list.sort((a, b) => (lastSeen.get(a.id) ?? 0) - (lastSeen.get(b.id) ?? 0))[0].id;
}

export async function hasAnyAttempt(): Promise<boolean> {
  const [row] = await db.select({ id: schema.attempts.id }).from(schema.attempts).limit(1);
  return !!row;
}

export async function isFreshQuestion(questionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.attempts.id })
    .from(schema.attempts)
    .where(eq(schema.attempts.questionId, questionId))
    .limit(1);
  return !row;
}

/** Days since this concept was last practised (null if never). */
export async function gapDays(conceptId: string, now: Date): Promise<number | null> {
  const [row] = await db
    .select({ at: schema.attempts.createdAt })
    .from(schema.attempts)
    .where(eq(schema.attempts.conceptId, conceptId))
    .orderBy(desc(schema.attempts.createdAt))
    .limit(1);
  return row ? (now.getTime() - row.at.getTime()) / DAY_MS : null;
}

export async function learnAttemptStats(conceptId: string) {
  const rows = await db
    .select({ correct: schema.attempts.correct })
    .from(schema.attempts)
    .where(and(eq(schema.attempts.conceptId, conceptId), eq(schema.attempts.mode, "learn")));
  return { attempts: rows.length, errors: rows.filter((r) => !r.correct).length };
}

export async function logStudy(minutes: number) {
  const day = dayOf();
  await db
    .insert(schema.studyDays)
    .values({ day, minutes, items: 1 })
    .onConflictDoUpdate({
      target: schema.studyDays.day,
      set: {
        minutes: sql`${schema.studyDays.minutes} + ${minutes}`,
        items: sql`${schema.studyDays.items} + 1`,
      },
    });
}
