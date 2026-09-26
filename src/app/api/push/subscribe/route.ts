import { z } from "zod";
import { db, schema } from "@/db";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export const POST = handle(async (req: Request) => {
  const sub = Body.parse(await req.json());
  await db
    .insert(schema.pushSubscriptions)
    .values(sub)
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { keys: sub.keys } });
  return ok({ ok: true });
});
