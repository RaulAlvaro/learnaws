import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getEvent } from "@/lib/events";
import { getEntry } from "@/lib/events-server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/http/rate-limit";
import { fail, handle, ok } from "@/lib/http/json";

const MAX_PHOTO = 400_000;
const Body = z.object({
  displayName: z.string().trim().min(2).max(24).optional(),
  /** data:image/jpeg;base64,... (the composed selfie card). Requires consent. */
  photo: z.string().max(600_000).optional(),
  consent: z.boolean().optional(),
  removePhoto: z.boolean().optional(),
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/events/[slug]/profile">) => {
  const userId = await requireUser();
  rateLimit(userId, "write");
  const e = getEvent((await ctx.params).slug);
  if (!e) return fail("Evento no encontrado", 404);
  if (!(await getEntry(e.slug, userId))) return fail("Primero juega la ronda del evento.", 409);
  const b = Body.parse(await req.json());
  const set: Partial<typeof schema.eventEntries.$inferInsert> = {};
  if (b.displayName) set.displayName = b.displayName.replace(/\s+/g, " ");
  if (b.removePhoto) {
    set.photo = null;
    set.photoAt = null;
  } else if (b.photo) {
    if (!b.consent) return fail("Necesitamos tu permiso para mostrar la foto en el ranking.");
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(b.photo);
    const buf = m ? Buffer.from(m[1], "base64") : null;
    if (!buf || buf.length > MAX_PHOTO || buf[0] !== 0xff || buf[1] !== 0xd8) return fail("La foto no es válida.");
    set.photo = buf;
    set.photoAt = new Date();
  }
  if (Object.keys(set).length) {
    await db
      .update(schema.eventEntries)
      .set(set)
      .where(and(eq(schema.eventEntries.eventId, e.slug), eq(schema.eventEntries.userId, userId)));
  }
  return ok({ ok: true });
});
