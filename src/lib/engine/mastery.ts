/**
 * Successive relearning (Rawson & Dunlosky): a concept is learned when it is
 * recalled correctly 3 times in the initial session, then once in each of 3
 * later spaced sessions — always without help.
 */
export const INITIAL_CRITERION = 3;
export const SPACED_CRITERION = 3;
/** Hard stop for the initial session so one concept can't eat the hour. */
export const MAX_LEARN_ATTEMPTS = 7;

export type Phase = "unseen" | "learning" | "reviewing" | "graduated";

export interface MasteryState {
  phase: Phase;
  initialStreak: number;
  spacedSuccesses: number;
  lastSpacedSuccessDay: string | null;
}

export interface LearnResult {
  state: MasteryState;
  /** true → initial session finished, hand the concept to FSRS. */
  finished: boolean;
}

export function applyLearnAttempt(
  s: MasteryState,
  unaidedCorrect: boolean,
  learnAttempts: number,
): LearnResult {
  const initialStreak = unaidedCorrect ? s.initialStreak + 1 : s.initialStreak;
  const reached = initialStreak >= INITIAL_CRITERION;
  const exhausted = learnAttempts >= MAX_LEARN_ATTEMPTS;
  return {
    state: {
      ...s,
      initialStreak,
      phase: reached || exhausted ? "reviewing" : "learning",
    },
    finished: reached || exhausted,
  };
}

/**
 * A spaced success counts at most once per calendar day. A lapse costs one
 * spaced success (the concept must be relearned, not restarted).
 */
export function applyReviewAttempt(
  s: MasteryState,
  unaidedCorrect: boolean,
  day: string,
): MasteryState {
  if (!unaidedCorrect) {
    return {
      ...s,
      spacedSuccesses: Math.max(0, s.spacedSuccesses - 1),
      phase: s.phase === "graduated" ? "reviewing" : s.phase,
    };
  }
  if (s.lastSpacedSuccessDay === day) return s;
  const spacedSuccesses = s.spacedSuccesses + 1;
  return {
    ...s,
    spacedSuccesses,
    lastSpacedSuccessDay: day,
    phase: spacedSuccesses >= SPACED_CRITERION ? "graduated" : "reviewing",
  };
}

/** Spanish is a comprehension aid, not a knowledge aid, so it does not void an answer. */
export function isUnaidedCorrect(correct: boolean, hintLevel: number): boolean {
  return correct && hintLevel === 0;
}
