import { requireUser } from "@/lib/auth";
import { getMock, mockAttempts, mockForClient } from "@/lib/study/mocks";
import { revealQuestion } from "@/lib/study/session";
import { fail, handle, ok } from "@/lib/http/json";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/mock/[id]">) => {
  const userId = await requireUser();
  const id = Number((await ctx.params).id);
  const m = await mockForClient(userId, id);
  if (!m) return fail("No encontrado", 404);
  if (!m.mock.finishedAt) return ok(m);
  // Finished: include answers + verified explanations for review.
  const full = await getMock(userId, id);
  const attempts = await mockAttempts(userId, id);
  return ok({
    ...m,
    review: full!.questions.map((q) => ({
      questionId: q.id,
      reveal: revealQuestion(q),
      attempt: attempts.find((a) => a.questionId === q.id) ?? null,
    })),
  });
});
