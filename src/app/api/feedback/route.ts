import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/http/rate-limit";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({
  kind: z.enum(["idea", "bug", "content", "other"]),
  message: z.string().trim().min(3).max(3000),
  page: z.string().max(200).optional(),
});

export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  rateLimit(userId, "write");
  const b = Body.parse(await req.json());
  await db.insert(schema.feedback).values({ userId, ...b });
  return ok({ ok: true });
});
