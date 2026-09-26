import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({ seconds: z.number().min(0).max(7200), model: z.string().max(60) });

/**
 * Voice sessions run browser↔OpenAI directly, so the client reports their length.
 * Estimated cost per minute of conversation (audio in + out + context), from published token prices.
 */
const USD_PER_MIN: Record<string, number> = { mini: 0.04, full: 0.12 };

export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  const { seconds, model } = Body.parse(await req.json());
  const rate = model.includes("mini") ? USD_PER_MIN.mini : USD_PER_MIN.full;
  await db.insert(schema.aiUsage).values({
    userId,
    purpose: "expert-voice",
    model,
    audioSeconds: seconds,
    costUsd: (seconds / 60) * rate,
  });
  return ok({ ok: true });
});
