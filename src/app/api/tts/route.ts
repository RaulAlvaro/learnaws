import { requireUser } from "@/lib/auth";
import { getContent } from "@/lib/content/load";
import { speakPersonal, speakShared } from "@/lib/ai/voice";
import { rateLimit } from "@/lib/http/rate-limit";
import { fail, handle } from "@/lib/http/json";

/**
 * GET /api/tts?ref=question:<id>|card:<conceptId>|recall:<id>|feedback&lang=en|es[&text=...]
 * Content refs resolve server-side and are shared + cached (server key).
 * "feedback" is personal free text: user's own key, never cached.
 */
export const GET = handle(async (req: Request) => {
  const userId = await requireUser();
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref") ?? "";
  const lang = url.searchParams.get("lang") === "es" ? "es" : "en";
  const { questions, content, recall } = getContent();
  const [kind, id] = ref.split(":");

  let audio: Buffer | null = null;
  if (kind === "feedback") {
    rateLimit(userId, "ai");
    const text = url.searchParams.get("text")?.slice(0, 800);
    if (text) audio = await speakPersonal(userId, text, lang);
  } else {
    rateLimit(userId, "audio");
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
    }
    if (text) audio = await speakShared(text, lang);
  }
  if (!audio) return fail("Nada que leer", 404);
  return new Response(new Uint8Array(audio), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": kind === "feedback" ? "no-store" : "private, max-age=31536000, immutable",
    },
  });
});
