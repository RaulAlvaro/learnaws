import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";

const DAY_MS = 86_400_000;

export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

/**
 * FSRS-6 tuned for a fixed exam date:
 * - nothing is ever scheduled after the target date (maximum_interval),
 * - retention target rises in the last 10 days (Cepeda 2008: gaps shrink as the test nears),
 * - short-term steps are off: in-session learning is handled by successive relearning instead.
 */
export function schedulerFor(now: Date, target: Date) {
  const daysLeft = Math.max(1, Math.floor(daysBetween(now, target)));
  return fsrs({
    request_retention: daysLeft <= 10 ? 0.93 : 0.9,
    maximum_interval: daysLeft,
    enable_fuzz: true,
    enable_short_term: false,
  });
}

export interface Outcome {
  correct: boolean;
  confidence: 1 | 2 | 3;
  hintLevel: number;
  timeMs?: number | null;
}

/**
 * Map one answer to an FSRS grade. Aided or guessed answers never count as "Good":
 * performance with help is not learning (Bastani et al. 2025).
 */
export function gradeFor(o: Outcome): Grade {
  if (!o.correct) return Rating.Again;
  if (o.hintLevel > 0 || o.confidence === 1) return Rating.Hard;
  if (o.confidence === 3 && o.timeMs != null && o.timeMs < 45_000) return Rating.Easy;
  return Rating.Good;
}

export function serializeCard(card: Card): Record<string, unknown> {
  return {
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review?.toISOString() ?? null,
  };
}

export function deserializeCard(raw: Record<string, unknown>): Card {
  return {
    ...(raw as unknown as Card),
    due: new Date(raw.due as string),
    last_review: raw.last_review ? new Date(raw.last_review as string) : undefined,
  };
}

/**
 * ts-fsrs can exceed maximum_interval (e.g. Easy must beat Good), so clamp:
 * the last review before the exam lands the day before it.
 */
function clampToTarget(card: Card, now: Date, target: Date): Card {
  if (now >= target || card.due <= target) return card;
  const dayBefore = new Date(target.getTime() - DAY_MS);
  const due = dayBefore.getTime() - now.getTime() >= DAY_MS / 2 ? dayBefore : target;
  return { ...card, due, scheduled_days: Math.max(1, Math.round(daysBetween(now, due))) };
}

/** First FSRS review once the initial session reached its criterion. */
export function firstCard(now: Date, target: Date, errorsWhileLearning: number): Card {
  const grade: Grade =
    errorsWhileLearning === 0 ? Rating.Good : errorsWhileLearning <= 2 ? Rating.Hard : Rating.Again;
  return clampToTarget(schedulerFor(now, target).next(createEmptyCard(now), now, grade).card, now, target);
}

export function review(card: Card, now: Date, target: Date, outcome: Outcome): Card {
  return clampToTarget(schedulerFor(now, target).next(card, now, gradeFor(outcome)).card, now, target);
}

/** Predicted probability of recalling the concept at `at` (e.g. on exam day). */
export function retrievability(card: Card, at: Date, target: Date): number {
  if (card.state === State.New) return 0;
  return schedulerFor(at, target).get_retrievability(card, at, false);
}
