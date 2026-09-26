import { getContent } from "@/lib/content/load";
import { speak } from "@/lib/ai/voice";
import { fail, handle } from "@/lib/http/json";

/**
 * GET /api/tts?ref=question:<id>|card:<conceptId>|recall:<id>|feedback&lang=en|es[&text=...]
 * Text is resolved server-side from verified content (only "feedback" takes free text).
 */
export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref") ?? "";
  const lang = url.searchParams.get("lang") === "es" ? "es" : "en";
  const { questions, content, recall } = getContent();
  const [kind, id] = ref.split(":");
  let text: string | undefined;
  if (kind === "question") {
    const q = questions.get(id);
    if (q) {
      const stem = lang === "es" ? q.es.stem : q.stem;
      const opts = (lang === "es" ? q.es.options : q.options).map((o) => `${o.id}. ${o.text}`).join(". ");
      text = `${stem} ${opts}`;
    }
  } else if (kind === "card") {
    const c = content.get(id)?.card[lang];
    if (c) text = [c.tldr, ...c.keyFacts, ...c.gotchas].join(". ");
  } else if (kind === "recall") {
    const r = recall.get(id);
    if (r) text = lang === "es" ? r.promptEs : r.prompt;
  } else if (kind === "feedback") {
    text = url.searchParams.get("text")?.slice(0, 800);
  }
  if (!text) return fail("Nada que leer", 404);
  const audio = await speak(text, lang);
  return new Response(new Uint8Array(audio), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
});
