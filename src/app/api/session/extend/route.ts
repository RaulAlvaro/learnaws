import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { buildSession } from "@/lib/study/session";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({ minutes: z.number().int().min(10).max(120) });

/** "Seguir estudiando": plans an extra block on top of today's session. */
export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  const { minutes } = Body.parse(await req.json());
  const s = await buildSession(userId, minutes);
  return ok({ total: s.queue.length });
});
