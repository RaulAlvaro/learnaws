import { requireUser } from "@/lib/auth";
import { nextRecallPrompt } from "@/lib/study/voice";
import { getContent } from "@/lib/content/load";
import { handle, ok } from "@/lib/http/json";

export const GET = handle(async (req: Request) => {
  const userId = await requireUser();
  const exclude = new URL(req.url).searchParams.get("exclude")?.split(",").filter(Boolean) ?? [];
  const p = await nextRecallPrompt(userId, exclude);
  if (!p) return ok({ prompt: null });
  const concept = getContent().concepts.get(p.conceptId);
  return ok({
    prompt: { id: p.id, conceptId: p.conceptId, kind: p.kind, prompt: p.prompt, promptEs: p.promptEs },
    concept: concept ? { title: concept.title, titleEs: concept.titleEs } : null,
  });
});
