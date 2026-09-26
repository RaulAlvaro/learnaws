import "server-only";
import { db, schema } from "@/db";
import { getContent } from "../content/load";
import type { RecallPrompt } from "../content/types";
import { applyReviewAttempt } from "../engine/mastery";
import { deserializeCard, review, serializeCard } from "../engine/scheduler";
import { shuffle } from "../engine/planner";
import { conceptRow, conceptRows, dayOf, gapDays, getSettings, logStudy, masteryOf, upsertConcept } from "./store";

/**
 * Hands-free queue: due concepts first, then concepts already introduced whose
 * recall is weakest. Only known concepts — voice is for retrieval, not first exposure.
 */
export async function nextRecallPrompt(userId: string, exclude: string[] = []): Promise<RecallPrompt | null> {
  const { recallByConcept } = getContent();
  const rows = await conceptRows(userId);
  const now = new Date();
  const known = [...rows.values()].filter(
    (r) => (r.phase === "reviewing" || r.phase === "graduated") && recallByConcept.get(r.conceptId)?.length,
  );
  const due = known.filter((r) => r.due && r.due <= now);
  const rest = known.filter((r) => !(r.due && r.due <= now)).sort((a, b) => (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0));
  for (const r of [...shuffle(due, now.getTime()), ...rest]) {
    const prompts = (recallByConcept.get(r.conceptId) ?? []).filter((p) => !exclude.includes(p.id));
    if (prompts.length) return prompts[Math.floor(Math.random() * prompts.length)];
  }
  return null;
}

export async function recordRecall(opts: {
  userId: string;
  prompt: RecallPrompt;
  transcript: string;
  score: number;
  usedSpanish: boolean;
  timeMs: number;
}) {
  const now = new Date();
  const { prompt } = opts;
  const correct = opts.score === 2;
  const concept = getContent().concepts.get(prompt.conceptId);
  const { userId } = opts;
  const [gap, row, settings] = await Promise.all([
    gapDays(userId, prompt.conceptId, now),
    conceptRow(userId, prompt.conceptId),
    getSettings(userId),
  ]);
  await db.insert(schema.attempts).values({
    userId,
    questionId: prompt.id,
    conceptId: prompt.conceptId,
    domain: concept?.domain ?? "d1",
    mode: "voice",
    selected: [],
    correct,
    confidence: 2,
    usedSpanish: opts.usedSpanish,
    timeMs: opts.timeMs,
    gapDays: gap,
    transcript: opts.transcript,
    explanationScore: opts.score,
  });
  await logStudy(userId, Math.min(opts.timeMs, 5 * 60_000) / 60_000);

  // Free recall is harder than recognition: it moves FSRS and mastery, but never readiness.
  if (row?.fsrs) {
    const target = new Date(settings.targetDate);
    const card = review(deserializeCard(row.fsrs), now, target, {
      correct: opts.score > 0,
      confidence: opts.score === 2 ? 2 : 1,
      hintLevel: 0,
    });
    const next = applyReviewAttempt(masteryOf(row), correct, dayOf(now));
    await upsertConcept(userId, prompt.conceptId, {
      fsrs: serializeCard(card),
      due: card.due,
      phase: next.phase,
      spacedSuccesses: next.spacedSuccesses,
      lastSpacedSuccessDay: next.lastSpacedSuccessDay,
    });
  }
}
