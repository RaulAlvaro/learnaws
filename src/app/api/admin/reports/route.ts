import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({ reportId: z.number().int(), action: z.enum(["disable-for-all", "dismiss"]) });

/** Admin decision on a question report: hide the question for everyone, or dismiss. */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const { reportId, action } = Body.parse(await req.json());
  const [r] = await db.select().from(schema.questionReports).where(eq(schema.questionReports.id, reportId));
  if (!r) return ok({ ok: false });
  if (action === "disable-for-all") {
    await db
      .insert(schema.disabledQuestions)
      .values({ userId: "*", questionId: r.questionId, reason: r.note })
      .onConflictDoNothing();
  }
  await db
    .update(schema.questionReports)
    .set({ status: action === "dismiss" ? "dismissed" : "fixed" })
    .where(eq(schema.questionReports.id, reportId));
  return ok({ ok: true });
});
