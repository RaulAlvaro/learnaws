import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { handle } from "@/lib/http/json";

/** Selfie card for the leaderboard. A hidden player's photo is only visible to that player and admins. */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/events/[slug]/photo/[userId]">) => {
  const viewer = await requireUser();
  const { slug, userId } = await ctx.params;
  const [row] = await db
    .select({ photo: schema.eventEntries.photo, hidden: schema.eventEntries.hidden })
    .from(schema.eventEntries)
    .where(and(eq(schema.eventEntries.eventId, slug), eq(schema.eventEntries.userId, userId)));
  if (!row?.photo || (row.hidden && viewer !== userId && !isAdmin(viewer))) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(row.photo), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  });
});
