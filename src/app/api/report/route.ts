import { z } from "zod";
import { db, schema } from "@/db";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({ questionId: z.string(), note: z.string().min(3).max(1000) });

/** "Esto está mal": the question is hidden immediately and queued for review. */
export const POST = handle(async (req: Request) => {
  const { questionId, note } = Body.parse(await req.json());
  await db.insert(schema.questionReports).values({ questionId, note });
  await db.insert(schema.disabledQuestions).values({ questionId, reason: note }).onConflictDoNothing();
  return ok({ ok: true });
});
