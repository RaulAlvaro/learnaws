import { requireUser } from "@/lib/auth";
import { getContent } from "@/lib/content/load";
import { gradeRecall } from "@/lib/ai/tutor";
import { transcribe } from "@/lib/ai/voice";
import { rateLimit } from "@/lib/http/rate-limit";
import { recordRecall } from "@/lib/study/voice";
import { fail, handle, ok } from "@/lib/http/json";

/** multipart: audio (Blob), promptId, durationSec, usedSpanish, timeMs */
export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  rateLimit(userId, "ai");
  const form = await req.formData();
  const audio = form.get("audio");
  const promptId = String(form.get("promptId") ?? "");
  const { recall, content } = getContent();
  const prompt = recall.get(promptId);
  if (!prompt) return fail("Pregunta desconocida", 404);
  if (!(audio instanceof Blob) || audio.size === 0) return fail("Audio vacío");
  if (audio.size > 5_000_000) return fail("Audio demasiado largo");
  const durationSec = Math.min(Number(form.get("durationSec") ?? 10), 120);
  const transcript = await transcribe(userId, audio, durationSec);
  if (!transcript.trim()) return fail("No se escuchó nada, intenta de nuevo");
  // Spoken commands instead of an answer: "en español", "repite".
  const said = transcript.trim().toLowerCase().replace(/[.,!¡¿?]/g, "");
  if (said.split(/\s+/).length <= 4) {
    if (/(en )?español|spanish/.test(said)) return ok({ command: "spanish", transcript });
    if (/repite|repetir|repeat|otra vez/.test(said)) return ok({ command: "repeat", transcript });
  }
  const grade = await gradeRecall({ userId, prompt, content: content.get(prompt.conceptId), transcript });
  await recordRecall({
    userId,
    prompt,
    transcript,
    score: grade.score,
    usedSpanish: form.get("usedSpanish") === "true",
    timeMs: Number(form.get("timeMs") ?? 0),
  });
  return ok({ transcript, ...grade, idealAnswer: prompt.idealAnswer });
});
