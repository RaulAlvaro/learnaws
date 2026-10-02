import { eventStatus, getEvent } from "@/lib/events";
import { getEntry, serveCurrent, startEntry } from "@/lib/events-server";
import { isAdmin, requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/http/rate-limit";
import { fail, handle, ok } from "@/lib/http/json";

/** Starts the player's single attempt if needed and returns the current question (the timer runs server-side). */
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/events/[slug]/question">) => {
  const userId = await requireUser();
  rateLimit(userId, "write");
  const e = getEvent((await ctx.params).slug);
  if (!e) return fail("Evento no encontrado", 404);
  let entry = await getEntry(e.slug, userId);
  if (!entry) {
    const status = eventStatus(e);
    // Admins can rehearse before the doors open.
    if (status !== "live" && !(status === "upcoming" && isAdmin(userId))) {
      return fail(status === "upcoming" ? "El juego abre el día del evento." : "El evento ya terminó.", 409);
    }
    entry = await startEntry(e, userId);
  }
  const question = await serveCurrent(e, userId, entry);
  return ok({ question, done: !question });
});
