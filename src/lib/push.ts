import "server-only";
import webpush from "web-push";
import { eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { dayOf, getSettings, hourOf } from "./study/store";

function configured() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);
  return true;
}

/** Daily reminder with the number of due reviews ("12 repasos pendientes, ~18 min"). */
export async function sendReminder() {
  if (!configured()) return { sent: 0, reason: "VAPID no configurado" };
  const now = new Date();
  const due = await db.$count(schema.conceptState, lte(schema.conceptState.due, now));
  const minutes = Math.max(5, Math.round(due * 1.5));
  const body = due
    ? `${due} repasos pendientes (~${minutes} min). Si hoy solo tienes 15 min, haz esos.`
    : "Tu sesión de hoy está lista: conceptos nuevos + práctica mezclada.";
  const payload = JSON.stringify({ title: "AWS SAA · sesión de hoy", body, url: "/study" });
  const subs = await db.select().from(schema.pushSubscriptions);
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

/** Called every minute from instrumentation; sends at most once per day at the chosen hour. */
export async function reminderTick() {
  const settings = await getSettings();
  const now = new Date();
  if (hourOf(now) !== settings.reminderHour) return;
  const today = dayOf(now);
  const [last] = await db.select().from(schema.settings).where(eq(schema.settings.key, "lastReminderDay"));
  if (last?.value === today) return;
  // Skip if already studied today.
  const [studied] = await db.select().from(schema.studyDays).where(eq(schema.studyDays.day, today));
  await db
    .insert(schema.settings)
    .values({ key: "lastReminderDay", value: today })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: today } });
  if (studied && studied.minutes >= 20) return;
  await sendReminder();
}
