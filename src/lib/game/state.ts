import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { dayOf, getUserSetting, putUserSetting } from "../study/store";
import { levelFor, streakWithFreeze } from "./xp";

export const DAILY_ROUND_GOAL = 8;
export const ROUND_SIZE = 8;

function startOfTodayLocal(): Date {
  // Good enough for "today": last 24h window anchored at local midnight via dayOf().
  const now = new Date();
  const today = dayOf(now);
  for (let h = 0; h < 30; h++) {
    const t = new Date(now.getTime() - h * 3_600_000);
    if (dayOf(t) !== today) return new Date(t.getTime() + 3_600_000);
  }
  return new Date(now.getTime() - 24 * 3_600_000);
}

export async function gameState(userId: string) {
  const today = dayOf();
  const [[totals], [todayRow], days, rounds, dueNow] = await Promise.all([
    db
      .select({ xp: sql<number>`coalesce(sum(${schema.attempts.xp}), 0)::int` })
      .from(schema.attempts)
      .where(eq(schema.attempts.userId, userId)),
    db
      .select({ xp: sql<number>`coalesce(sum(${schema.attempts.xp}), 0)::int` })
      .from(schema.attempts)
      .where(and(eq(schema.attempts.userId, userId), gte(schema.attempts.createdAt, startOfTodayLocal()))),
    db
      .select({ day: schema.studyDays.day, items: schema.studyDays.items })
      .from(schema.studyDays)
      .where(eq(schema.studyDays.userId, userId)),
    getUserSetting<number>(userId, `rounds:${today}`),
    db.$count(schema.conceptState, and(eq(schema.conceptState.userId, userId), lte(schema.conceptState.due, new Date()))),
  ]);
  const studied = new Set(days.filter((d) => d.items > 0).map((d) => d.day));
  const { streak, freezeUsed } = streakWithFreeze(studied, today);
  const totalXp = Math.max(0, totals?.xp ?? 0);
  return {
    totalXp,
    todayXp: todayRow?.xp ?? 0,
    ...levelFor(totalXp),
    roundsToday: rounds ?? 0,
    goal: DAILY_ROUND_GOAL,
    streak,
    freezeUsed,
    dueNow,
  };
}

export async function completeRound(userId: string) {
  const key = `rounds:${dayOf()}`;
  const current = (await getUserSetting<number>(userId, key)) ?? 0;
  await putUserSetting(userId, key, current + 1);
}
