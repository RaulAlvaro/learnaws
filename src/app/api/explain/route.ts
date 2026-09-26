import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getContent } from "@/lib/content/load";
import { gradeExplanation } from "@/lib/ai/tutor";
import { rateLimit } from "@/lib/http/rate-limit";
import { ownAttempt } from "@/lib/study/attempts";
import { saveSelfExplanation } from "@/lib/study/session";
import { fail, handle, ok } from "@/lib/http/json";

const Body = z.object({ attemptId: z.number().int(), text: z.string().min(3).max(2000) });

export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  rateLimit(userId, "ai");
  const { attemptId, text } = Body.parse(await req.json());
  const a = await ownAttempt(userId, attemptId);
  if (!a) return fail("Intento no encontrado", 404);
  const { questions, content } = getContent();
  const q = questions.get(a.questionId);
  if (!q) return fail("Pregunta desconocida", 404);
  const g = await gradeExplanation({ userId, question: q, content: content.get(q.conceptId), explanation: text });
  await saveSelfExplanation(userId, attemptId, text, g.score, g.feedback);
  return ok(g);
});
