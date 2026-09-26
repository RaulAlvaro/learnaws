/**
 * XP rewards learning, not activity (Deci et al. 1999: completion-contingent rewards
 * undermine intrinsic motivation; informational feedback supports it).
 * - only unaided first answers earn XP (help ≠ learning, Bastani et al. 2025)
 * - confidence is scored like certainty-based marking: sure+right earns more,
 *   sure+wrong costs a little — it trains calibration.
 */
export const XP = {
  base: 10,
  sureBonus: 5,
  surePenalty: -5,
  guessCorrect: 5,
} as const;

export function xpFor(o: { correct: boolean; confidence: 1 | 2 | 3; aided: boolean }): number {
  if (o.aided) return 0;
  if (o.correct) {
    if (o.confidence === 1) return XP.guessCorrect;
    return XP.base + (o.confidence === 3 ? XP.sureBonus : 0);
  }
  return o.confidence === 3 ? XP.surePenalty : 0;
}

/** Level curve: each level needs a bit more XP (level 1 → 0 XP, level 2 → 100, level 3 → 250 …). */
export function levelFor(totalXp: number): { level: number; into: number; needed: number } {
  let level = 1;
  let floor = 0;
  let step = 100;
  while (totalXp >= floor + step) {
    floor += step;
    level++;
    step = Math.round(step * 1.25);
  }
  return { level, into: totalXp - floor, needed: step };
}

/**
 * Streak with one automatic "freeze" per ISO week: a single missed day inside a
 * week doesn't break it (streaks should motivate, not punish).
 */
export function streakWithFreeze(studiedDays: Set<string>, today: string): { streak: number; freezeUsed: boolean } {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const week = (d: Date) => {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dayNum + 3);
    return `${t.getUTCFullYear()}-${Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7)}`;
  };
  const cursor = new Date(`${today}T12:00:00Z`);
  // Today not studied yet doesn't break anything.
  if (!studiedDays.has(day(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  let freezeUsed = false;
  const frozenWeeks = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const d = day(cursor);
    if (studiedDays.has(d)) {
      streak++;
    } else if (!frozenWeeks.has(week(cursor)) && studiedDays.has(day(new Date(cursor.getTime() - 86_400_000)))) {
      frozenWeeks.add(week(cursor));
      if (i < 7) freezeUsed = true;
    } else {
      break;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { streak, freezeUsed };
}
