import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { LEGACY_OWNER } from "@/db/schema";

export class UnauthorizedError extends Error {
  constructor() {
    super("Necesitas iniciar sesión");
  }
}

export function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).includes(userId);
}

const known = new Map<string, number>(); // userId → last lastSeen update (ms)

/**
 * Current Clerk user id; creates the users row on first sight and keeps lastSeenAt fresh.
 * Local UI testing can bypass Clerk with AUTH_BYPASS=1 (never in production).
 */
export async function requireUser(): Promise<string> {
  let userId: string | null = null;
  if (process.env.NODE_ENV !== "production" && process.env.AUTH_BYPASS === "1") {
    userId = process.env.AUTH_BYPASS_USER ?? "dev-user";
  } else {
    userId = (await auth()).userId;
  }
  if (!userId) throw new UnauthorizedError();

  const last = known.get(userId);
  if (!last || Date.now() - last > 10 * 60_000) {
    known.set(userId, Date.now());
    const [row] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId));
    if (!row) {
      const u = process.env.AUTH_BYPASS === "1" ? null : await currentUser();
      await db
        .insert(schema.users)
        .values({
          id: userId,
          email: u?.primaryEmailAddress?.emailAddress ?? null,
          name: [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.username || null,
        })
        .onConflictDoNothing();
      if (isAdmin(userId)) await claimLegacyData(userId);
    } else {
      await db.update(schema.users).set({ lastSeenAt: new Date() }).where(eq(schema.users.id, userId));
    }
  }
  return userId;
}

/** Data created before multi-user belongs to the first admin who signs in. */
async function claimLegacyData(userId: string) {
  for (const table of [
    "concept_state",
    "attempts",
    "mocks",
    "tutor_messages",
    "question_reports",
    "study_days",
    "ai_usage",
    "push_subscriptions",
    "lab_progress",
    "settings",
  ]) {
    await db.execute(sql`update ${sql.identifier(table)} set user_id = ${userId} where user_id = ${LEGACY_OWNER}`);
  }
}

export async function requireAdmin(): Promise<string> {
  const userId = await requireUser();
  if (!isAdmin(userId)) throw new UnauthorizedError();
  return userId;
}
