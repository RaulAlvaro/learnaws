import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { saveSettings } from "@/lib/study/store";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({
  targetDate: z.string().datetime().optional(),
  dailyMinutes: z.number().int().min(15).max(180).optional(),
  reminderHour: z.number().int().min(0).max(23).optional(),
});

export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  await saveSettings(userId, Body.parse(await req.json()));
  return ok({ ok: true });
});
