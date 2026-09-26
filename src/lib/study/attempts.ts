import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** An attempt, only if it belongs to this user. */
export async function ownAttempt(userId: string, attemptId: number) {
  const [a] = await db
    .select()
    .from(schema.attempts)
    .where(and(eq(schema.attempts.id, attemptId), eq(schema.attempts.userId, userId)));
  return a ?? null;
}
