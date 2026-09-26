import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getContent } from "@/lib/content/load";
import { ownAttempt } from "@/lib/study/attempts";
import { revealQuestion } from "@/lib/study/session";
import { fail, handle, ok } from "@/lib/http/json";

const Body = z.object({ attemptId: z.number().int() });

/** The verified explanation is only available once an answer was recorded. */
export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  const { attemptId } = Body.parse(await req.json());
  const a = await ownAttempt(userId, attemptId);
  if (!a) return fail("Primero responde la pregunta", 403);
  const q = getContent().questions.get(a.questionId);
  if (!q) return fail("Pregunta desconocida", 404);
  return ok({ reveal: revealQuestion(q), errorCategory: a.errorCategory, errorNote: a.explanationFeedback });
});
