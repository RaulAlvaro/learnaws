import { z } from "zod";
import { getEvent } from "@/lib/events";
import { answerCurrent, EventConflictError, getEntry } from "@/lib/events-server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/http/rate-limit";
import { fail, handle, ok } from "@/lib/http/json";

const Body = z.object({ questionId: z.string().max(200), choice: z.string().max(4).nullable() });

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/events/[slug]/answer">) => {
  const userId = await requireUser();
  rateLimit(userId, "write");
  const e = getEvent((await ctx.params).slug);
  if (!e) return fail("Evento no encontrado", 404);
  const b = Body.parse(await req.json());
  const entry = await getEntry(e.slug, userId);
  if (!entry) return fail("Primero empieza el juego.", 409);
  try {
    return ok(await answerCurrent(e, userId, entry, b.questionId, b.choice));
  } catch (err) {
    if (err instanceof EventConflictError) return fail(err.message, 409, "conflict");
    throw err;
  }
});
