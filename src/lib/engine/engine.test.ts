import { test } from "node:test";
import assert from "node:assert/strict";
import { Rating } from "ts-fsrs";
import type { Concept } from "../content/types";
import { applyLearnAttempt, applyReviewAttempt, INITIAL_CRITERION, type MasteryState } from "./mastery";
import { newShare, planSession, type PlannerConcept } from "./planner";
import { bookingGate, estimateReadiness } from "./readiness";
import { firstCard, gradeFor, review } from "./scheduler";

const DAY = 86_400_000;
const WEIGHTS = { d1: 0.3, d2: 0.26, d3: 0.24, d4: 0.2 };

function concept(id: string, extra: Partial<Concept> = {}): Concept {
  return {
    id,
    title: id,
    titleEs: id,
    domain: "d1",
    tasks: ["d1.t1"],
    services: [],
    prerequisites: [],
    confusableGroup: null,
    examFrequency: 2,
    order: 1,
    docs: [],
    summary: "",
    ...extra,
  };
}

function pc(id: string, extra: Partial<PlannerConcept> = {}, c: Partial<Concept> = {}): PlannerConcept {
  return { concept: concept(id, c), phase: "unseen", pretest: "none", due: null, examDayR: 0, highConfidenceError: false, ...extra };
}

const fresh: MasteryState = { phase: "learning", initialStreak: 0, spacedSuccesses: 0, lastSpacedSuccessDay: null };

test("successive relearning: 3 unaided correct answers finish the initial session", () => {
  let s = fresh;
  for (let i = 1; i < INITIAL_CRITERION; i++) {
    const r = applyLearnAttempt(s, true, i);
    assert.equal(r.finished, false);
    s = r.state;
  }
  const r = applyLearnAttempt(s, true, INITIAL_CRITERION);
  assert.equal(r.finished, true);
  assert.equal(r.state.phase, "reviewing");
});

test("aided or wrong answers don't count toward the initial criterion", () => {
  const r = applyLearnAttempt(fresh, false, 1);
  assert.equal(r.state.initialStreak, 0);
});

test("graduation needs 3 spaced successes on distinct days; same day counts once; a lapse costs one", () => {
  let s: MasteryState = { ...fresh, phase: "reviewing" };
  s = applyReviewAttempt(s, true, "2026-10-01");
  s = applyReviewAttempt(s, true, "2026-10-01");
  assert.equal(s.spacedSuccesses, 1);
  s = applyReviewAttempt(s, true, "2026-10-04");
  s = applyReviewAttempt(s, false, "2026-10-09");
  assert.equal(s.spacedSuccesses, 1);
  s = applyReviewAttempt(s, true, "2026-10-10");
  s = applyReviewAttempt(s, true, "2026-10-15");
  assert.equal(s.phase, "graduated");
});

test("grades: aided/guessed answers are never Good", () => {
  assert.equal(gradeFor({ correct: false, confidence: 3, hintLevel: 0 }), Rating.Again);
  assert.equal(gradeFor({ correct: true, confidence: 2, hintLevel: 1 }), Rating.Hard);
  assert.equal(gradeFor({ correct: true, confidence: 1, hintLevel: 0 }), Rating.Hard);
  assert.equal(gradeFor({ correct: true, confidence: 2, hintLevel: 0 }), Rating.Good);
  assert.equal(gradeFor({ correct: true, confidence: 3, hintLevel: 0, timeMs: 20_000 }), Rating.Easy);
});

test("FSRS never schedules past the exam date", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const target = new Date(now.getTime() + 10 * DAY);
  let card = firstCard(now, target, 0);
  let t = now;
  assert.ok(card.due <= target);
  while (card.due < target) {
    t = card.due;
    card = review(card, t, target, { correct: true, confidence: 3, hintLevel: 0, timeMs: 10_000 });
    assert.ok(card.due <= target, `review at ${t.toISOString()} scheduled ${card.due.toISOString()}`);
  }
});

test("new material stops two weeks before the target", () => {
  assert.equal(newShare(10), 0);
  assert.equal(newShare(60), 0.5);
  assert.ok(newShare(25) > 0 && newShare(25) < 0.5);
});

test("first session is a diagnostic spread across tasks", () => {
  const concepts = Array.from({ length: 80 }, (_, i) =>
    pc(`c${i}`, {}, { tasks: [`d${(i % 4) + 1}.t${i % 3}`], order: i, examFrequency: ((i % 3) + 1) as 1 | 2 | 3 }),
  );
  const plan = planSession({
    concepts,
    groups: [],
    domainWeights: WEIGHTS,
    now: new Date(),
    daysLeft: 60,
    budgetMin: 60,
    hasAnyAttempt: false,
  });
  assert.equal(plan.kind, "diagnostic");
  assert.equal(plan.queue.length, 36);
  assert.ok(plan.queue.every((i) => i.t === "q" && i.mode === "diagnostic"));
});

test("due reviews come first, high-confidence errors at the very front, then new concepts with pretest → card → learn", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const past = new Date(now.getTime() - DAY);
  const concepts = [
    pc("due-a", { phase: "reviewing", due: past, examDayR: 0.9 }),
    pc("due-b", { phase: "reviewing", due: past, examDayR: 0.5, highConfidenceError: true }),
    pc("new-1", {}, { examFrequency: 3, order: 3 }),
    pc("new-2", {}, { examFrequency: 1, order: 4 }),
    pc("blocked", {}, { prerequisites: ["new-1"], order: 5 }),
  ];
  const plan = planSession({ concepts, groups: [], domainWeights: WEIGHTS, now, daysLeft: 50, budgetMin: 60, hasAnyAttempt: true });
  assert.deepEqual(
    plan.queue.slice(0, 2).map((i) => i.conceptId),
    ["due-b", "due-a"],
  );
  const rest = plan.queue.slice(2).map((i) => `${i.t}:${i.t === "q" ? i.mode : i.reason}:${i.conceptId}`);
  assert.deepEqual(rest.slice(0, 3), ["q:pretest:new-1", "card:new:new-1", "q:learn:new-1"]);
  assert.ok(!rest.some((r) => r.endsWith(":blocked")), "prerequisite not introduced yet");
});

test("too many due reviews → reviews-only session", () => {
  const now = new Date();
  const concepts = Array.from({ length: 60 }, (_, i) => pc(`r${i}`, { phase: "reviewing", due: new Date(now.getTime() - DAY), examDayR: 0.7 }));
  const plan = planSession({ concepts, groups: [], domainWeights: WEIGHTS, now, daysLeft: 40, budgetMin: 60, hasAnyAttempt: true });
  assert.equal(plan.kind, "reviews-only");
  assert.equal(plan.queue.length, 40);
});

test("interleaving only mixes confusable concepts already known", () => {
  const now = new Date();
  const known = { phase: "reviewing" as const, due: new Date(now.getTime() + 5 * DAY), examDayR: 0.9 };
  const concepts = [pc("sqs", known), pc("sns", known), pc("kinesis")];
  const plan = planSession({
    concepts,
    groups: [{ id: "msg", title: "", concepts: ["sqs", "sns", "kinesis"], discriminators: [] }],
    domainWeights: WEIGHTS,
    now,
    daysLeft: 10,
    budgetMin: 60,
    hasAnyAttempt: true,
  });
  const inter = plan.queue.filter((i) => i.t === "q" && i.mode === "interleave").map((i) => i.conceptId).sort();
  assert.deepEqual(inter, ["sns", "sqs"]);
});

test("readiness: strong evidence → high pass probability; weak → low; little data flagged", () => {
  const mk = (acc: number, n: number) =>
    Object.keys(WEIGHTS).flatMap((d) => Array.from({ length: n }, (_, i) => ({ domain: d, correct: i < acc * n })));
  const strong = estimateReadiness(mk(0.88, 40), WEIGHTS);
  const weak = estimateReadiness(mk(0.6, 40), WEIGHTS);
  assert.ok(strong.passProbability > 0.9, `strong ${strong.passProbability}`);
  assert.ok(weak.passProbability < 0.2, `weak ${weak.passProbability}`);
  assert.ok(strong.passLow <= strong.passProbability + 0.05 && strong.passHigh >= strong.passLow);
  assert.equal(estimateReadiness(mk(0.9, 2), WEIGHTS).enoughData, false);
});

test("booking gate needs two full mocks ≥ 80%, no weak domain, and an external confirmation", () => {
  const full = (score: number, weak = false, t = 1) => ({
    kind: "full" as const,
    scorePct: score,
    perDomain: { d1: { correct: weak ? 5 : 17, total: 20 } },
    finishedAt: new Date(t),
  });
  assert.equal(bookingGate([full(85, false, 1), full(82, false, 2)]).ready, false);
  assert.equal(
    bookingGate([full(85, false, 1), full(82, false, 2), { kind: "external", scorePct: 81, perDomain: null, finishedAt: new Date(3) }]).ready,
    true,
  );
  assert.equal(bookingGate([full(85, true, 1), full(82, false, 2), { kind: "external", scorePct: 90, perDomain: null, finishedAt: new Date(3) }]).ready, false);
});
