import { after } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getContent } from "@/lib/content/load";
import { diagnoseError } from "@/lib/ai/tutor";
import { rateLimit } from "@/lib/http/rate-limit";
import { submitAnswer } from "@/lib/study/session";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({
  questionId: z.string(),
  selected: z.array(z.string()).min(1),
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  timeMs: z.number().int().nonnegative(),
  usedSpanish: z.boolean(),
  retryOf: z.number().int().optional(),
  hintLevel: z.number().int().min(0).max(3).optional(),
});

export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  rateLimit(userId, "write");
  const input = Body.parse(await req.json());
  const result = await submitAnswer(userId, input);
  if (!result.correct && !input.retryOf) {
    // Error-log classification runs after the response so feedback stays instant.
    // Without the user's API key it's skipped (the log still records the error).
    after(async () => {
      const q = getContent().questions.get(input.questionId);
      if (!q) return;
      try {
        const d = await diagnoseError({ userId, question: q, selected: input.selected, confidence: input.confidence });
        await db
          .update(schema.attempts)
          .set({ errorCategory: d.category, explanationFeedback: d.note })
          .where(and(eq(schema.attempts.id, result.attemptId), eq(schema.attempts.userId, userId)));
      } catch {
        // no key / no budget: fine, the error stays uncategorised
      }
    });
  }
  return ok(result);
});
