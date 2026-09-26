import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getContent } from "@/lib/content/load";
import { gradeExplanation } from "@/lib/ai/tutor";
import { saveSelfExplanation } from "@/lib/study/session";
import { fail, handle, ok } from "@/lib/http/json";

const Body = z.object({ attemptId: z.number().int(), text: z.string().min(3).max(2000) });

export const POST = handle(async (req: Request) => {
  const { attemptId, text } = Body.parse(await req.json());
  const [a] = await db.select().from(schema.attempts).where(eq(schema.attempts.id, attemptId));
  if (!a) return fail("Intento no encontrado", 404);
  const { questions, content } = getContent();
  const q = questions.get(a.questionId);
  if (!q) return fail("Pregunta desconocida", 404);
  const g = await gradeExplanation({ question: q, content: content.get(q.conceptId), explanation: text });
  await saveSelfExplanation(attemptId, text, g.score, g.feedback);
  return ok(g);
});
