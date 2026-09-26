import { after } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getContent } from "@/lib/content/load";
import { diagnoseError } from "@/lib/ai/tutor";
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
  const input = Body.parse(await req.json());
  const result = await submitAnswer(input);
  if (!result.correct && !input.retryOf) {
    // Error log classification runs after the response so feedback stays instant.
    after(async () => {
      const q = getContent().questions.get(input.questionId);
      if (!q || !process.env.OPENAI_API_KEY) return;
      try {
        const d = await diagnoseError({ question: q, selected: input.selected, confidence: input.confidence });
        await db
          .update(schema.attempts)
          .set({ errorCategory: d.category, explanationFeedback: d.note })
          .where(eq(schema.attempts.id, result.attemptId));
      } catch (e) {
        console.error("diagnoseError", e);
      }
    });
  }
  return ok(result);
});
