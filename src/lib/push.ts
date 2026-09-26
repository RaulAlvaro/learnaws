import "server-only";
import webpush from "web-push";
import { and, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { dayOf, getSettings, getUserSetting, hourOf, putUserSetting } from "./study/store";

function configured() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);
  return true;
}

/** Daily reminder with the number of due reviews ("12 repasos pendientes, ~18 min"). */
export async function sendReminder(userId: string) {
  if (!configured()) return { sent: 0, reason: "VAPID no configurado" };
  const now = new Date();
  const due = await db.$count(
    schema.conceptState,
    and(eq(schema.conceptState.userId, userId), lte(schema.conceptState.due, now)),
  );
  const minutes = Math.max(5, Math.round(due * 1.5));
  const body = due
    ? `${due} repasos pendientes (~${minutes} min). Si hoy solo tienes 15 min, haz esos.`
    : "Tu sesión de hoy está lista: conceptos nuevos + práctica mezclada.";
  const payload = JSON.stringify({ title: "AWS SAA · sesión de hoy", body, url: "/study" });
  const subs = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
      }
    }
  }
  return { sent };
}

/**
 * Called every minute from instrumentation: for each user with a push
 * subscription, send at most once per day at their chosen hour, unless they
 * already studied ≥ 20 min today.
 */
export async function reminderTick() {
  const now = new Date();
  const today = dayOf(now);
  const hour = hourOf(now);
  const subscribers = await db.selectDistinct({ userId: schema.pushSubscriptions.userId }).from(schema.pushSubscriptions);
  for (const { userId } of subscribers) {
    const settings = await getSettings(userId);
    if (hour !== settings.reminderHour) continue;
    if ((await getUserSetting<string>(userId, "lastReminderDay")) === today) continue;
    await putUserSetting(userId, "lastReminderDay", today);
    const [studied] = await db
      .select()
      .from(schema.studyDays)
      .where(and(eq(schema.studyDays.userId, userId), eq(schema.studyDays.day, today)));
    if (studied && studied.minutes >= 20) continue;
    await sendReminder(userId);
  }
}
