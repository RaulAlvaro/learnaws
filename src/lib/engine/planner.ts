import type { Concept, ConfusableGroup } from "../content/types";
import type { Phase } from "./mastery";

/** Rough cost of each activity, in minutes (used to fill the daily budget). */
export const MIN_PER_QUESTION = 1.5;
export const MIN_PER_NEW_CONCEPT = 9; // pretest + card + ~3–4 practice questions
export const DIAGNOSTIC_SIZE = 36;

export type QuestionMode = "diagnostic" | "pretest" | "learn" | "relearn" | "review" | "interleave";

export type QueueItem =
  | { t: "q"; mode: QuestionMode; conceptId: string }
  | { t: "card"; conceptId: string; reason: "new" | "relearn" };

export interface PlannerConcept {
  concept: Concept;
  phase: Phase;
  pretest: "none" | "wrong" | "right" | "right-sure";
  due: Date | null;
  /** Predicted recall on exam day (0 when not scheduled yet). */
  examDayR: number;
  /** Most recent answer on this concept was a high-confidence error. */
  highConfidenceError: boolean;
}

export interface PlanInput {
  concepts: PlannerConcept[];
  groups: ConfusableGroup[];
  domainWeights: Record<string, number>;
  now: Date;
  daysLeft: number;
  budgetMin: number;
  hasAnyAttempt: boolean;
}

export interface Plan {
  kind: "diagnostic" | "normal" | "reviews-only";
  queue: QueueItem[];
  counts: { reviews: number; newConcepts: number; interleave: number };
}

/**
 * Share of the hour spent on new material. It shrinks to zero in the last
 * two weeks so the end of the plan is pure consolidation.
 */
export function newShare(daysLeft: number): number {
  if (daysLeft <= 14) return 0;
  if (daysLeft >= 35) return 0.5;
  return 0.5 * ((daysLeft - 14) / 21);
}

function priorityForNew(c: PlannerConcept, weights: Record<string, number>): number {
  const pretestFactor =
    c.pretest === "right-sure" ? 0.3 : c.pretest === "right" ? 0.6 : c.pretest === "wrong" ? 1.3 : 1;
  return (weights[c.concept.domain] ?? 0.25) * c.concept.examFrequency * pretestFactor;
}

export function planSession(input: PlanInput): Plan {
  const { concepts, now, budgetMin } = input;
  const byId = new Map(concepts.map((c) => [c.concept.id, c]));

  if (!input.hasAnyAttempt) return diagnosticPlan(input);

  // 1. Due reviews — never skippable. High-confidence errors first (hypercorrection),
  //    then the concepts most likely to be forgotten by exam day.
  const endgame = input.daysLeft <= 14;
  const due = concepts
    .filter((c) => (c.phase === "reviewing" || c.phase === "graduated") && c.due)
    .filter((c) => c.due! <= now || (endgame && c.examDayR > 0 && c.examDayR < 0.85))
    .sort((a, b) => {
      if (a.highConfidenceError !== b.highConfidenceError) return a.highConfidenceError ? -1 : 1;
      return a.examDayR - b.examDayR;
    });

  const maxItems = Math.floor(budgetMin / MIN_PER_QUESTION);
  const reviews = due.slice(0, maxItems).map((c) => c.concept.id);
  let remaining = budgetMin - reviews.length * MIN_PER_QUESTION;

  const queue: QueueItem[] = reviews.map((conceptId) => ({ t: "q", mode: "review", conceptId }));
  if (remaining < MIN_PER_QUESTION * 4) {
    return { kind: "reviews-only", queue, counts: { reviews: reviews.length, newConcepts: 0, interleave: 0 } };
  }

  // 2. Interleaving pool: confusable groups where at least two members are already
  //    known, plus recent high-confidence errors (Brunmair & Richter 2019).
  const introduced = new Set(concepts.filter((c) => c.phase !== "unseen").map((c) => c.concept.id));
  const known = new Set(
    concepts.filter((c) => c.phase === "reviewing" || c.phase === "graduated").map((c) => c.concept.id),
  );
  const reviewed = new Set(reviews);
  const pool: string[] = [];
  for (const g of input.groups) {
    const members = g.concepts.filter((id) => known.has(id) && !reviewed.has(id));
    if (members.length >= 2) pool.push(...members);
  }
  for (const c of concepts) {
    if (c.highConfidenceError && known.has(c.concept.id) && !reviewed.has(c.concept.id)) {
      pool.push(c.concept.id);
    }
  }
  const interleavePool = shuffle(unique(pool), now.getTime());
  const interleaveTarget = Math.min(budgetMin * 0.25, interleavePool.length * MIN_PER_QUESTION);

  // 3. New concepts: prerequisites met, prioritised by domain weight × exam frequency × pretest.
  const newBudget = Math.min(remaining - interleaveTarget, budgetMin * newShare(input.daysLeft) * 1.2);
  const nNew = Math.max(0, Math.floor(newBudget / MIN_PER_NEW_CONCEPT));
  const candidates = concepts
    .filter((c) => c.phase === "unseen" || c.phase === "learning")
    .filter((c) => c.concept.prerequisites.every((p) => introduced.has(p) || !byId.has(p)))
    .sort((a, b) => {
      // an unfinished initial session always comes first
      if (a.phase !== b.phase) return a.phase === "learning" ? -1 : 1;
      const d = priorityForNew(b, input.domainWeights) - priorityForNew(a, input.domainWeights);
      return d !== 0 ? d : a.concept.order - b.concept.order;
    });
  const newConcepts = candidates.slice(0, nNew).map((c) => c.concept.id);
  for (const conceptId of newConcepts) {
    const c = byId.get(conceptId)!;
    // Pretesting before the card (Kornell et al. 2009), unless already pretested.
    if (c.pretest === "none") queue.push({ t: "q", mode: "pretest", conceptId });
    queue.push({ t: "card", conceptId, reason: "new" });
    queue.push({ t: "q", mode: "learn", conceptId });
  }
  remaining -= newConcepts.length * MIN_PER_NEW_CONCEPT;

  // 4. Whatever time is left goes to mixed practice.
  const interleave = interleavePool.slice(0, Math.max(0, Math.floor(remaining / MIN_PER_QUESTION)));
  for (const conceptId of interleave) queue.push({ t: "q", mode: "interleave", conceptId });

  return {
    kind: "normal",
    queue: mixTail(queue, reviews.length),
    counts: { reviews: reviews.length, newConcepts: newConcepts.length, interleave: interleave.length },
  };
}

/**
 * Diagnostic: one question for the highest-yield concepts, spread across every
 * task statement, before any teaching. It doubles as pretesting.
 */
function diagnosticPlan(input: PlanInput): Plan {
  const byTask = new Map<string, PlannerConcept[]>();
  for (const c of input.concepts) {
    const task = c.concept.tasks[0] ?? c.concept.domain;
    if (!byTask.has(task)) byTask.set(task, []);
    byTask.get(task)!.push(c);
  }
  for (const list of byTask.values()) {
    list.sort((a, b) => b.concept.examFrequency - a.concept.examFrequency || a.concept.order - b.concept.order);
  }
  const picked: string[] = [];
  let round = 0;
  while (picked.length < DIAGNOSTIC_SIZE) {
    let added = false;
    for (const list of byTask.values()) {
      if (list[round] && picked.length < DIAGNOSTIC_SIZE) {
        picked.push(list[round].concept.id);
        added = true;
      }
    }
    if (!added) break;
    round++;
  }
  const queue: QueueItem[] = shuffle(picked, input.now.getTime()).map((conceptId) => ({
    t: "q",
    mode: "diagnostic",
    conceptId,
  }));
  return { kind: "diagnostic", queue, counts: { reviews: 0, newConcepts: 0, interleave: 0 } };
}

/** Interleave the post-review part so new material and mixed practice alternate. */
function mixTail(queue: QueueItem[], head: number): QueueItem[] {
  const tail = queue.slice(head);
  const blocks: QueueItem[][] = [];
  const mixed: QueueItem[] = [];
  let current: QueueItem[] = [];
  for (const item of tail) {
    if (item.t === "q" && item.mode === "interleave") {
      mixed.push(item);
      continue;
    }
    current.push(item);
    if (item.t === "q" && item.mode === "learn") {
      blocks.push(current);
      current = [];
    }
  }
  if (current.length) blocks.push(current);
  const out = queue.slice(0, head);
  const per = blocks.length ? Math.ceil(mixed.length / (blocks.length + 1)) : mixed.length;
  for (const block of blocks) {
    out.push(...block);
    out.push(...mixed.splice(0, per));
  }
  out.push(...mixed);
  return out;
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Deterministic shuffle so a re-plan within the same second is stable. */
export function shuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let s = seed % 2147483647 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
