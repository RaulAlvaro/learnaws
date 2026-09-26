import OpenAI from "openai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/http/rate-limit";
import { fail, handle, ok } from "@/lib/http/json";

const Body = z.object({ apiKey: z.string().trim().min(20).max(400).startsWith("sk-") });

/** Save the user's own OpenAI key (validated, encrypted at rest, never returned). */
export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  rateLimit(userId, "ai");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return fail("Eso no parece una API key de OpenAI (empieza con sk-).");
  const { apiKey } = parsed.data;
  try {
    await new OpenAI({ apiKey }).models.list();
  } catch (e) {
    const status = (e as { status?: number }).status;
    return fail(status === 401 ? "OpenAI rechazó esa key. Cópiala de nuevo." : "No pude validar la key con OpenAI; intenta en un momento.");
  }
  await db
    .update(schema.users)
    .set({ openaiKeyEnc: encrypt(apiKey), openaiKeyLast4: apiKey.slice(-4) })
    .where(eq(schema.users.id, userId));
  return ok({ last4: apiKey.slice(-4) });
});

export const DELETE = handle(async () => {
  const userId = await requireUser();
  await db.update(schema.users).set({ openaiKeyEnc: null, openaiKeyLast4: null }).where(eq(schema.users.id, userId));
  return ok({ ok: true });
});
