import { z } from "zod";
import { db, schema } from "@/db";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({
  doneSteps: z.array(z.string()),
  answers: z.record(z.string(), z.string()),
  completed: z.boolean().optional(),
  cleanedUp: z.boolean().optional(),
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/labs/[id]">) => {
  const labId = (await ctx.params).id;
  const b = Body.parse(await req.json());
  const values = {
    labId,
    doneSteps: b.doneSteps,
    answers: b.answers,
    completedAt: b.completed ? new Date() : null,
    cleanedUpAt: b.cleanedUp ? new Date() : null,
  };
  await db
    .insert(schema.labProgress)
    .values(values)
    .onConflictDoUpdate({ target: schema.labProgress.labId, set: values });
  return ok({ ok: true });
});
