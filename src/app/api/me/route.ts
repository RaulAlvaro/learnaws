import { z } from "zod";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { estimateReadiness } from "@/lib/engine/readiness";
import { getContent } from "@/lib/content/load";
import { readinessEvidence } from "@/lib/study/metrics";
import { handle, ok } from "@/lib/http/json";

const Patch = z.object({
  privacyAck: z.literal(true).optional(),
  aiMonthlyCapUsd: z.number().min(0).max(100).optional(),
  examResult: z
    .object({ date: z.string(), passed: z.boolean(), score: z.number().int().min(100).max(1000).nullable() })
    .optional(),
});

export const PATCH = handle(async (req: Request) => {
  const userId = await requireUser();
  const body = Patch.parse(await req.json());
  const set: Partial<typeof schema.users.$inferInsert> = {};
  if (body.privacyAck) set.privacyAckAt = new Date();
  if (body.aiMonthlyCapUsd != null) set.aiMonthlyCapUsd = body.aiMonthlyCapUsd;
  if (body.examResult) {
    // Keep what the app predicted at report time: that's how we check the method.
    const weights = Object.fromEntries(getContent().syllabus.domains.map((d) => [d.id, d.weight]));
    const r = estimateReadiness(await readinessEvidence(userId), weights);
    set.examResult = {
      ...body.examResult,
      predictedPassProbability: r.enoughData ? r.passProbability : null,
      reportedAt: new Date().toISOString(),
    };
  }
  await db.update(schema.users).set(set).where(eq(schema.users.id, userId));
  return ok({ ok: true });
});

/** Delete the account and every row that belongs to it. */
export const DELETE = handle(async () => {
  const userId = await requireUser();
  for (const table of [
    schema.attempts,
    schema.conceptState,
    schema.mocks,
    schema.tutorMessages,
    schema.questionReports,
    schema.studyDays,
    schema.aiUsage,
    schema.pushSubscriptions,
    schema.labProgress,
    schema.settings,
    schema.feedback,
    schema.disabledQuestions,
  ]) {
    await db.delete(table).where(eq(table.userId, userId));
  }
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  try {
    await (await clerkClient()).users.deleteUser(userId);
  } catch (e) {
    console.error("clerk delete", e);
  }
  return ok({ ok: true });
});
