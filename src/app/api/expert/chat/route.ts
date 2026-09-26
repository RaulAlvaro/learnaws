import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { aiForUser, assertBudget, MODELS, recordUsage } from "@/lib/ai/client";
import { EXPERT_INSTRUCTIONS, questionContext } from "@/lib/ai/expert";
import { rateLimit } from "@/lib/http/rate-limit";
import { embedQuery, formatSources, search } from "@/lib/rag";
import { fail, handle } from "@/lib/http/json";

const Body = z.object({
  attemptId: z.number().int(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(30),
});

/**
 * Streams an expert answer as NDJSON lines:
 *   {"type":"sources","sources":[{n,title,url,source}]}  then  {"type":"delta","text":"..."}…  then {"type":"done"}
 */
export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  rateLimit(userId, "ai");
  const { attemptId, messages } = Body.parse(await req.json());
  const ctx = await questionContext(userId, attemptId);
  if (!ctx) return fail("Primero responde la pregunta", 403);
  await assertBudget(userId);

  const last = messages.filter((m) => m.role === "user").at(-1)!.content;
  const hits = search(await embedQuery(userId, `${ctx.conceptTitle}. ${last}`), 6, { conceptId: ctx.conceptId });
  const ai = await aiForUser(userId);

  // Using the expert counts as help for this item (it never counts as unaided learning).
  await db.insert(schema.tutorMessages).values({ userId, attemptId, role: "user", level: 9, content: last });

  const stream = await ai.responses.create({
    model: MODELS.smart,
    instructions: EXPERT_INSTRUCTIONS,
    input: [
      { role: "user", content: `${ctx.text}\n\nFUENTES:\n${formatSources(hits)}` },
      { role: "assistant", content: "Entendido. Tengo la pregunta y las fuentes." },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    reasoning: { effort: "low" },
    stream: true,
  });

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(obj)}\n`));
      send({
        type: "sources",
        sources: hits.map((h, i) => ({ n: i + 1, title: h.title, url: h.url, source: h.source })),
      });
      let full = "";
      try {
        for await (const ev of stream) {
          if (ev.type === "response.output_text.delta") {
            full += ev.delta;
            send({ type: "delta", text: ev.delta });
          } else if (ev.type === "response.completed") {
            const u = ev.response.usage;
            await recordUsage({ userId, purpose: "expert-chat", model: MODELS.smart, inputTokens: u?.input_tokens, outputTokens: u?.output_tokens });
          }
        }
        await db.insert(schema.tutorMessages).values({ userId, attemptId, role: "assistant", level: 9, content: full });
        send({ type: "done" });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Error" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
});
