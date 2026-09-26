import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { assertBudget, NoApiKeyError } from "@/lib/ai/client";
import { EXPERT_INSTRUCTIONS, questionContext, VOICE_ADDENDUM } from "@/lib/ai/expert";
import { decrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/http/rate-limit";
import { embedQuery, formatSources, search } from "@/lib/rag";
import { fail, handle, ok } from "@/lib/http/json";

const REALTIME_MODEL = process.env.OPENAI_MODEL_REALTIME ?? "gpt-realtime-2.1-mini";
const VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin";

const Body = z.object({ attemptId: z.number().int() });

/**
 * Mints a short-lived Realtime client secret with the USER's own key (BYOK), preloaded
 * with the question context and the best-matching sources. The browser then talks to
 * OpenAI directly over WebRTC; our key never leaves the server.
 */
export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  rateLimit(userId, "ai");
  const { attemptId } = Body.parse(await req.json());
  const ctx = await questionContext(userId, attemptId);
  if (!ctx) return fail("Primero responde la pregunta", 403);
  await assertBudget(userId);

  const [u] = await db.select({ enc: schema.users.openaiKeyEnc }).from(schema.users).where(eq(schema.users.id, userId));
  if (!u?.enc) throw new NoApiKeyError();

  const hits = search(await embedQuery(userId, `${ctx.conceptTitle}. ${ctx.question.stem}`), 5, { conceptId: ctx.conceptId });
  const instructions = `${EXPERT_INSTRUCTIONS}\n\n${VOICE_ADDENDUM}\n\n${ctx.text}\n\nFUENTES:\n${formatSources(hits)}\n\nEmpieza tú: en una o dos frases, di qué decidía esta pregunta y pregúntale al estudiante qué le gustaría entender.`;

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${decrypt(u.enc)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 120 },
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions,
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe", language: "es" },
            turn_detection: { type: "semantic_vad" },
          },
          output: { voice: VOICE },
        },
        tools: [
          {
            type: "function",
            name: "search_aws_notes",
            description:
              "Busca en las fichas verificadas, explicaciones y documentación de AWS del curso. Úsala para datos técnicos que no estén en el contexto.",
            parameters: {
              type: "object",
              properties: { query: { type: "string", description: "Qué buscar, en inglés o español" } },
              required: ["query"],
            },
          },
        ],
        tool_choice: "auto",
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message ?? "No se pudo iniciar la voz";
    if (res.status === 401) return fail("OpenAI rechazó tu API key. Revísala en Ajustes > IA.", 412, "bad-api-key");
    if (res.status === 429 && /quota|billing|credits/i.test(msg)) return fail("Tu cuenta de OpenAI no tiene saldo.", 402, "no-credits");
    return fail(msg, 502);
  }
  await db.insert(schema.tutorMessages).values({ userId, attemptId, role: "user", level: 9, content: "[voz] sesión con el experto" });
  return ok({ value: data.value, expiresAt: data.expires_at, model: REALTIME_MODEL, conceptId: ctx.conceptId });
});
