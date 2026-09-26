import { getContent } from "@/lib/content/load";
import { gradeRecall } from "@/lib/ai/tutor";
import { transcribe } from "@/lib/ai/voice";
import { recordRecall } from "@/lib/study/voice";
import { fail, handle, ok } from "@/lib/http/json";

/** multipart: audio (Blob), promptId, durationSec, usedSpanish, timeMs */
export const POST = handle(async (req: Request) => {
  const form = await req.formData();
  const audio = form.get("audio");
  const promptId = String(form.get("promptId") ?? "");
  const { recall, content } = getContent();
  const prompt = recall.get(promptId);
  if (!prompt) return fail("Pregunta desconocida", 404);
  if (!(audio instanceof Blob) || audio.size === 0) return fail("Audio vacío");
  const durationSec = Number(form.get("durationSec") ?? 10);
  const transcript = await transcribe(audio, durationSec);
  if (!transcript.trim()) return fail("No se escuchó nada, intenta de nuevo");
  // Spoken commands instead of an answer: "en español", "repite".
  const said = transcript.trim().toLowerCase().replace(/[.,!¡¿?]/g, "");
  if (said.split(/\s+/).length <= 4) {
    if (/(en )?español|spanish/.test(said)) return ok({ command: "spanish", transcript });
    if (/repite|repetir|repeat|otra vez/.test(said)) return ok({ command: "repeat", transcript });
  }
  const grade = await gradeRecall({ prompt, content: content.get(prompt.conceptId), transcript });
  await recordRecall({
    prompt,
    transcript,
    score: grade.score,
    usedSpanish: form.get("usedSpanish") === "true",
    timeMs: Number(form.get("timeMs") ?? 0),
  });
  return ok({ transcript, ...grade, idealAnswer: prompt.idealAnswer });
});
