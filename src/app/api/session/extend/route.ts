import { z } from "zod";
import { buildSession } from "@/lib/study/session";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({ minutes: z.number().int().min(10).max(120) });

/** "Seguir estudiando": plans an extra block on top of today's session. */
export const POST = handle(async (req: Request) => {
  const { minutes } = Body.parse(await req.json());
  const s = await buildSession(minutes);
  return ok({ total: s.queue.length });
});
