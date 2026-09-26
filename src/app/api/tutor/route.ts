import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getContent } from "@/lib/content/load";
import { hint } from "@/lib/ai/tutor";
import { fail, handle, ok } from "@/lib/http/json";

const Body = z.object({
  attemptId: z.number().int(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  message: z.string().max(500).optional(),
});

/** Graded hints, only after a wrong first attempt. */
export const POST = handle(async (req: Request) => {
  const { attemptId, level, message } = Body.parse(await req.json());
  const [a] = await db.select().from(schema.attempts).where(eq(schema.attempts.id, attemptId));
  if (!a) return fail("Primero responde la pregunta", 403);
  if (a.correct) return fail("La pista es solo para respuestas incorrectas", 400);
  const { questions, content } = getContent();
  const q = questions.get(a.questionId);
  if (!q) return fail("Pregunta desconocida", 404);
  const text = await hint({ question: q, content: content.get(q.conceptId), selected: a.selected, level, learnerMessage: message });
  await db.insert(schema.tutorMessages).values([
    ...(message ? [{ attemptId, role: "user" as const, level, content: message }] : []),
    { attemptId, role: "assistant" as const, level, content: text },
  ]);
  return ok({ hint: text, level });
});
