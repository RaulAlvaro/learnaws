import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { submitMock } from "@/lib/study/mocks";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({
  elapsedMs: z.number().int().nonnegative(),
  answers: z.record(
    z.string(),
    z.object({
      selected: z.array(z.string()),
      confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      usedSpanish: z.boolean(),
    }),
  ),
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/mock/[id]/submit">) => {
  const userId = await requireUser();
  const id = Number((await ctx.params).id);
  const { answers, elapsedMs } = Body.parse(await req.json());
  return ok(await submitMock(userId, id, answers, elapsedMs));
});
