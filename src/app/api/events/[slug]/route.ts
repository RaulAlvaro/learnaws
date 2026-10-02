import { eventStatus, getEvent } from "@/lib/events";
import { getEntry, leaderboard, rankOf } from "@/lib/events-server";
import { isAdmin, requireUser } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/http/json";

/** Event page state: my entry, my rank and the leaderboard. */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/events/[slug]">) => {
  const userId = await requireUser();
  const e = getEvent((await ctx.params).slug);
  if (!e) return fail("Evento no encontrado", 404);
  const entry = await getEntry(e.slug, userId);
  const board = await leaderboard(e.slug);
  return ok({
    event: e,
    status: eventStatus(e),
    admin: isAdmin(userId),
    userId,
    me: entry && {
      displayName: entry.displayName,
      done: !!entry.finishedAt,
      current: entry.current,
      total: entry.questions.length,
      score: entry.score,
      correct: entry.correct,
      totalMs: entry.totalMs,
      photoAt: entry.photoAt,
      hidden: entry.hidden,
      ...(await rankOf(e.slug, entry)),
    },
    leaderboard: board,
  });
});
