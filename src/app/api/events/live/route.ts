import { liveEvent } from "@/lib/events";
import { getEntry } from "@/lib/events-server";
import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/http/json";

/** For the hub banner: the event happening today and whether I already played it. */
export const GET = handle(async () => {
  const userId = await requireUser();
  const e = liveEvent();
  if (!e) return ok({ event: null });
  const entry = await getEntry(e.slug, userId);
  return ok({ event: { slug: e.slug, name: e.name, venue: e.venue, mascot: e.mascot }, played: !!entry?.finishedAt });
});
