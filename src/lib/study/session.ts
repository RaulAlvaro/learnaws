import "server-only";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getContent } from "../content/load";
import { chipsFor } from "../game/cues";
import { xpFor } from "../game/xp";
import type { Question } from "../content/types";
import { planSession, type QuestionMode } from "../engine/planner";
import {
  applyLearnAttempt,
  applyReviewAttempt,
  isUnaidedCorrect,
} from "../engine/mastery";
import { deserializeCard, firstCard, review, serializeCard, daysBetween } from "../engine/scheduler";
import {
  conceptRow,
  dayOf,
  gapDays,
  getSession,
  getSettings,
  hasAnyAttempt,
  isFreshQuestion,
  learnAttemptStats,
  logStudy,
  masteryOf,
  pickQuestion,
  plannerConcepts,
  saveSession,
  upsertConcept,
  type SessionState,
} from "./store";

/** Question as sent to the client before answering: no correctness data. */
export function publicQuestion(q: Question) {
  return {
    id: q.id,
    conceptId: q.conceptId,
    domain: q.domain,
    type: q.type,
    answerCount: q.options.filter((o) => o.correct).length,
    stem: q.stem,
    /** Requirement phrases from the stem (not the answer): shown as chips/highlights. */
    cues: q.keywordCues,
    chips: chipsFor(q.keywordCues, q.stem),
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
    es: { stem: q.es.stem, options: q.es.options.map((o) => ({ id: o.id, text: o.text })) },
  };
}
export type PublicQuestion = ReturnType<typeof publicQuestion>;

export function revealQuestion(q: Question) {
  return {
    correctIds: q.options.filter((o) => o.correct).map((o) => o.id),
    options: q.options.map((o) => ({ id: o.id, correct: o.correct, why: o.why })),
    optionsEs: q.es.options.map((o) => ({ id: o.id, why: o.why })),
    explanation: q.explanation,
    explanationEs: q.es.explanation,
    keywordCues: q.keywordCues,
    docs: q.docs,
  };
}

export async function buildSession(userId: string, budgetMin?: number): Promise<SessionState> {
  const settings = await getSettings(userId);
  const now = new Date();
  const target = new Date(settings.targetDate);
  const { syllabus } = getContent();
  const plan = planSession({
    concepts: await plannerConcepts(userId, now, target),
    groups: syllabus.confusableGroups,
    domainWeights: Object.fromEntries(syllabus.domains.map((d) => [d.id, d.weight])),
    now,
    daysLeft: daysBetween(now, target),
    budgetMin: budgetMin ?? settings.dailyMinutes,
    hasAnyAttempt: await hasAnyAttempt(userId),
  });
  const session: SessionState = {
    day: dayOf(now),
    kind: plan.kind,
    queue: plan.queue,
    index: 0,
    total: plan.queue.length,
    startedAt: now.toISOString(),
  };
  await saveSession(userId, session);
  return session;
}

/** Today's session; a new day starts a new plan. */
export async function todaySession(userId: string): Promise<SessionState> {
  const s = await getSession(userId);
  if (s && s.day === dayOf()) return s;
  return buildSession(userId);
}

export type CurrentItem =
  | { kind: "done"; session: SessionState }
  | { kind: "card"; conceptId: string; reason: "new" | "relearn"; session: SessionState }
  | { kind: "question"; mode: QuestionMode; question: PublicQuestion; session: SessionState };

export async function currentItem(userId: string): Promise<CurrentItem> {
  const session = await todaySession(userId);
  const { questions } = getContent();
  while (session.index < session.queue.length) {
    const item = session.queue[session.index];
    if (item.t === "card") return { kind: "card", conceptId: item.conceptId, reason: item.reason, session };
    if (!item.questionId) {
      const used = session.queue.filter((i) => i.t === "q" && i.questionId).map((i) => i.questionId!);
      // Prefer a wording not used yet today; small concepts fall back to the least recent one.
      const qid =
        (await pickQuestion(userId, item.conceptId, used)) ?? (await pickQuestion(userId, item.conceptId));
      if (!qid) {
        session.index++;
        continue;
      }
      item.questionId = qid;
      await saveSession(userId, session);
    }
    const q = questions.get(item.questionId);
    if (!q) {
      session.index++;
      continue;
    }
    return { kind: "question", mode: item.mode, question: publicQuestion(q), session };
  }
  await saveSession(userId, session);
  return { kind: "done", session };
}

export async function advance(userId: string) {
  const s = await todaySession(userId);
  s.index = Math.min(s.index + 1, s.queue.length);
  await saveSession(userId, s);
}

/** Insert a follow-up item a few positions ahead (spacing within the session). */
function insertAhead(s: SessionState, item: SessionState["queue"][number], gap: number) {
  const pos = Math.min(s.index + 1 + gap, s.queue.length);
  s.queue.splice(pos, 0, item);
  s.total = s.queue.length;
}

export interface AnswerInput {
  questionId: string;
  selected: string[];
  confidence: 1 | 2 | 3;
  timeMs: number;
  usedSpanish: boolean;
  /** Set when retrying after tutor hints: the retry is recorded as aided and changes no schedule. */
  retryOf?: number;
  hintLevel?: number;
}

export function isCorrect(q: Question, selected: string[]): boolean {
  const correct = q.options.filter((o) => o.correct).map((o) => o.id).sort();
  const sel = [...new Set(selected)].sort();
  return correct.length === sel.length && correct.every((id, i) => id === sel[i]);
}

export async function submitAnswer(userId: string, input: AnswerInput) {
  const { questions } = getContent();
  const q = questions.get(input.questionId);
  if (!q) throw new Error("Pregunta desconocida");
  const now = new Date();
  const session = await todaySession(userId);
  const item = session.queue[session.index];
  const mode: QuestionMode =
    item && item.t === "q" && item.questionId === q.id ? item.mode : "review";
  const correct = isCorrect(q, input.selected);
  const hintLevel = input.hintLevel ?? 0;
  const aided = !!input.retryOf || hintLevel > 0;

  const xp = xpFor({ correct, confidence: input.confidence, aided });
  const [fresh, gap] = await Promise.all([isFreshQuestion(userId, q.id), gapDays(userId, q.conceptId, now)]);
  const [attempt] = await db
    .insert(schema.attempts)
    .values({
      userId,
      questionId: q.id,
      conceptId: q.conceptId,
      domain: q.domain,
      mode: aided ? "relearn" : mode,
      selected: input.selected,
      correct,
      confidence: input.confidence,
      hintLevel,
      aided,
      usedSpanish: input.usedSpanish,
      timeMs: input.timeMs,
      fresh: fresh && !aided,
      gapDays: gap,
      xp,
    })
    .returning({ id: schema.attempts.id });
  await logStudy(userId, Math.min(input.timeMs, 5 * 60_000) / 60_000);

  let needsSelfExplanation = false;
  if (!aided) {
    needsSelfExplanation = await applyToSchedule(userId, q, mode, correct, input, session, now);
    await saveSession(userId, session);
  }

  return {
    attemptId: attempt.id,
    correct,
    xp,
    needsSelfExplanation,
    reveal: correct || aided ? revealQuestion(q) : null,
  };
}

/** The only place where answers move a concept through its phases and FSRS schedule. */
async function applyToSchedule(
  userId: string,
  q: Question,
  mode: QuestionMode,
  correct: boolean,
  input: AnswerInput,
  session: SessionState,
  now: Date,
): Promise<boolean> {
  const settings = await getSettings(userId);
  const target = new Date(settings.targetDate);
  const row = await conceptRow(userId, q.conceptId);
  const m = masteryOf(row);
  const unaided = isUnaidedCorrect(correct, input.hintLevel ?? 0);
  const base = { lastQuestionId: q.id };

  switch (mode) {
    case "diagnostic":
    case "pretest": {
      const pretest = !correct ? "wrong" : input.confidence === 3 ? "right-sure" : "right";
      await upsertConcept(userId, q.conceptId, { ...base, pretest });
      return false;
    }
    case "learn": {
      const stats = await learnAttemptStats(userId, q.conceptId);
      const { state, finished } = applyLearnAttempt(
        { ...m, phase: m.phase === "unseen" ? "learning" : m.phase },
        unaided,
        stats.attempts,
      );
      const patch: Partial<typeof schema.conceptState.$inferInsert> = {
        ...base,
        phase: state.phase,
        initialStreak: state.initialStreak,
        introducedAt: row?.introducedAt ?? now,
      };
      if (finished) {
        const card = firstCard(now, target, stats.errors);
        patch.fsrs = serializeCard(card);
        patch.due = card.due;
      } else {
        // Keep practising this concept later in the session, with other items in between.
        insertAhead(session, { t: "q", mode: "learn", conceptId: q.conceptId }, 2);
      }
      await upsertConcept(userId, q.conceptId, patch);
      // Explain your reasoning on the first correct answer of a new concept, or when guessing.
      return correct && (state.initialStreak === 1 || input.confidence === 1);
    }
    case "relearn": {
      const pending = session.queue.filter((i) => i.t === "q" && i.mode === "relearn" && i.conceptId === q.conceptId);
      if (!correct && pending.length < 3) {
        insertAhead(session, { t: "q", mode: "relearn", conceptId: q.conceptId }, 3);
      }
      return false;
    }
    case "review":
    case "interleave": {
      if (!row?.fsrs) return correct && input.confidence === 1;
      const card = review(deserializeCard(row.fsrs), now, target, {
        correct,
        confidence: input.confidence,
        hintLevel: input.hintLevel ?? 0,
        timeMs: input.timeMs,
      });
      const next = applyReviewAttempt(m, unaided, dayOf(now));
      await upsertConcept(userId, q.conceptId, {
        ...base,
        fsrs: serializeCard(card),
        due: card.due,
        phase: next.phase,
        spacedSuccesses: next.spacedSuccesses,
        lastSpacedSuccessDay: next.lastSpacedSuccessDay,
      });
      if (!correct) {
        // Relearn to criterion within the session: card, then another question later.
        insertAhead(session, { t: "card", conceptId: q.conceptId, reason: "relearn" }, 0);
        insertAhead(session, { t: "q", mode: "relearn", conceptId: q.conceptId }, 3);
      }
      return correct && input.confidence === 1;
    }
  }
}

export async function saveSelfExplanation(userId: string, attemptId: number, text: string, score: number, feedback: string) {
  await db
    .update(schema.attempts)
    .set({ selfExplanation: text, explanationScore: score, explanationFeedback: feedback })
    .where(and(eq(schema.attempts.id, attemptId), eq(schema.attempts.userId, userId)));
}
