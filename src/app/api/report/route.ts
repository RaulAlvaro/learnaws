import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({ questionId: z.string(), note: z.string().min(3).max(1000) });

/** "Esto está mal": hidden for this user right away; the admin decides whether to hide it for everyone. */
export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  const { questionId, note } = Body.parse(await req.json());
  await db.insert(schema.questionReports).values({ userId, questionId, note });
  await db.insert(schema.disabledQuestions).values({ userId, questionId, reason: note }).onConflictDoNothing();
  return ok({ ok: true });
});
