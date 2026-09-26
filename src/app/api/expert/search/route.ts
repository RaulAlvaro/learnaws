import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/http/rate-limit";
import { embedQuery, search } from "@/lib/rag";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({ query: z.string().min(2).max(500), conceptId: z.string().optional() });

/** Retrieval tool used by the voice expert (the browser relays the model's function call here). */
export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  rateLimit(userId, "ai");
  const { query, conceptId } = Body.parse(await req.json());
  const hits = search(await embedQuery(userId, query), 4, { conceptId });
  return ok({
    results: hits.map((h) => ({ title: h.title, source: h.source, url: h.url, text: h.text.slice(0, 1200) })),
  });
});
