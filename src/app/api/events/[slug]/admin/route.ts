import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getEvent } from "@/lib/events";
import { requireAdmin } from "@/lib/auth";
import { fail, handle, ok } from "@/lib/http/json";

const Body = z.object({ action: z.enum(["hide", "show", "reset"]), userId: z.string().max(100) });

/** Moderation: hide a player (name and photo) from the leaderboard, or reset an attempt (e.g. a rehearsal). */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/events/[slug]/admin">) => {
  await requireAdmin();
  const e = getEvent((await ctx.params).slug);
  if (!e) return fail("Evento no encontrado", 404);
  const b = Body.parse(await req.json());
  const where = and(eq(schema.eventEntries.eventId, e.slug), eq(schema.eventEntries.userId, b.userId));
  if (b.action === "reset") await db.delete(schema.eventEntries).where(where);
  else await db.update(schema.eventEntries).set({ hidden: b.action === "hide" }).where(where);
  return ok({ ok: true });
});
