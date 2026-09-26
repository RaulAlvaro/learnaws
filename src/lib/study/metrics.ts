import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getContent, studyableConcepts } from "../content/load";
import { bookingGate, estimateReadiness, type Evidence } from "../engine/readiness";
import { MONTHLY_CAP_USD, monthSpend } from "../ai/client";
import { conceptRows, dayOf, getSettings } from "./store";

const DAY_MS = 86_400_000;

/**
 * Honest evidence only: unaided, not in-session. Held-out full-mock answers,
 * plus fresh questions on concepts not practised for ≥ 7 days.
 */
async function readinessEvidence(): Promise<Evidence[]> {
  const since = new Date(Date.now() - 21 * DAY_MS);
  const fullMocks = await db
    .select({ id: schema.mocks.id })
    .from(schema.mocks)
    .where(and(eq(schema.mocks.kind, "full"), isNotNull(schema.mocks.finishedAt)));
  const fullIds = fullMocks.map((m) => m.id);
  const rows = await db
    .select({
      domain: schema.attempts.domain,
      correct: schema.attempts.correct,
      mode: schema.attempts.mode,
      mockId: schema.attempts.mockId,
      fresh: schema.attempts.fresh,
      gapDays: schema.attempts.gapDays,
    })
    .from(schema.attempts)
    .where(and(gte(schema.attempts.createdAt, since), eq(schema.attempts.aided, false)));
  return rows
    .filter(
      (r) =>
        (r.mode === "mock" && r.mockId != null && fullIds.includes(r.mockId)) ||
        (r.mode !== "diagnostic" && r.mode !== "pretest" && r.fresh && (r.gapDays ?? 0) >= 7),
    )
    .map((r) => ({ domain: r.domain, correct: r.correct }));
}

export async function dashboard() {
  const { syllabus } = getContent();
  const weights = Object.fromEntries(syllabus.domains.map((d) => [d.id, d.weight]));
  const now = new Date();
  const settings = await getSettings();
  const [evidence, rows, spend] = await Promise.all([readinessEvidence(), conceptRows(), monthSpend()]);
  const readiness = estimateReadiness(evidence, weights);

  const since14 = new Date(now.getTime() - 14 * DAY_MS);
  const recent = await db
    .select()
    .from(schema.attempts)
    .where(gte(schema.attempts.createdAt, since14));
  const firstTries = recent.filter((a) => !a.aided);

  // Delayed retention: unaided answers on concepts untouched for ≥ 7 days.
  const delayed = firstTries.filter((a) => (a.gapDays ?? 0) >= 7 && a.mode !== "diagnostic");
  const delayedRetention = delayed.length
    ? { pct: (delayed.filter((a) => a.correct).length / delayed.length) * 100, n: delayed.length }
    : null;

  // Calibration: accuracy per stated confidence.
  const calibration = ([1, 2, 3] as const).map((c) => {
    const own = firstTries.filter((a) => a.confidence === c && a.mode !== "diagnostic");
    return { confidence: c, n: own.length, pct: own.length ? (own.filter((a) => a.correct).length / own.length) * 100 : null };
  });
  const expectedByConf = { 1: 0.4, 2: 0.7, 3: 0.9 } as const;
  const brierRows = firstTries.filter((a) => a.mode !== "diagnostic");
  const brier = brierRows.length
    ? brierRows.reduce((s, a) => s + (expectedByConf[a.confidence as 1 | 2 | 3] - (a.correct ? 1 : 0)) ** 2, 0) / brierRows.length
    : null;

  // Help usage: share of answered items where the tutor was never opened.
  const tutorAttempts = recent.length
    ? await db
        .selectDistinct({ id: schema.tutorMessages.attemptId })
        .from(schema.tutorMessages)
        .where(inArray(schema.tutorMessages.attemptId, firstTries.map((a) => a.id).concat(-1)))
    : [];
  const unaidedPct = firstTries.length ? (1 - tutorAttempts.length / firstTries.length) * 100 : null;

  const since7 = now.getTime() - 7 * DAY_MS;
  const last7 = firstTries.filter((a) => a.createdAt.getTime() >= since7);
  const spanishPct = last7.length ? (last7.filter((a) => a.usedSpanish).length / last7.length) * 100 : null;

  // Mastery per domain (graduated / introduced / total).
  const concepts = studyableConcepts();
  const domains = syllabus.domains.map((d) => {
    const own = concepts.filter((c) => c.domain === d.id);
    const phases = own.map((c) => rows.get(c.id)?.phase ?? "unseen");
    const est = readiness.domains.find((x) => x.domain === d.id);
    return {
      id: d.id,
      name: d.name,
      weight: d.weight,
      total: own.length,
      graduated: phases.filter((p) => p === "graduated").length,
      learning: phases.filter((p) => p === "reviewing" || p === "learning").length,
      accuracy: est && est.n > 0 ? est.accuracy * 100 : null,
      low: est && est.n > 0 ? est.low * 100 : null,
      high: est && est.n > 0 ? est.high * 100 : null,
      n: est?.n ?? 0,
    };
  });

  const dueNow = [...rows.values()].filter((r) => r.due && r.due <= now).length;

  const days = await db.select().from(schema.studyDays).orderBy(desc(schema.studyDays.day)).limit(120);
  const studied = new Set(days.filter((d) => d.minutes >= 5).map((d) => d.day));
  let streak = 0;
  for (let t = now.getTime(); ; t -= DAY_MS) {
    const day = dayOf(new Date(t));
    if (studied.has(day)) streak++;
    else if (day !== dayOf(now)) break;
    if (streak > 365) break;
  }

  const mocks = await db.select().from(schema.mocks).where(isNotNull(schema.mocks.finishedAt));
  const gate = bookingGate(
    mocks.map((m) => ({
      kind: m.kind,
      scorePct: m.scorePct ?? 0,
      perDomain: m.perDomain ?? null,
      finishedAt: m.finishedAt!,
    })),
  );

  return {
    settings,
    daysLeft: Math.ceil((new Date(settings.targetDate).getTime() - now.getTime()) / DAY_MS),
    readiness,
    delayedRetention,
    calibration,
    brier,
    unaidedPct,
    spanishPct,
    domains,
    dueNow,
    streak,
    gate,
    spend: { month: spend, cap: MONTHLY_CAP_USD },
    lastMocks: mocks.sort((a, b) => b.finishedAt!.getTime() - a.finishedAt!.getTime()).slice(0, 5),
  };
}

export async function errorLog(limit = 100) {
  const rows = await db
    .select()
    .from(schema.attempts)
    .where(and(eq(schema.attempts.correct, false), eq(schema.attempts.aided, false)))
    .orderBy(desc(schema.attempts.createdAt))
    .limit(limit);
  const counts = await db
    .select({ category: schema.attempts.errorCategory, n: sql<number>`count(*)::int` })
    .from(schema.attempts)
    .where(and(eq(schema.attempts.correct, false), isNotNull(schema.attempts.errorCategory)))
    .groupBy(schema.attempts.errorCategory);
  return { rows, counts };
}
