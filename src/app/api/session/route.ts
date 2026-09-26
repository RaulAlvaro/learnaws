import { getContent } from "@/lib/content/load";
import { currentItem } from "@/lib/study/session";
import { handle, ok } from "@/lib/http/json";

export const GET = handle(async () => {
  const item = await currentItem();
  const { session } = item;
  const progress = { index: session.index, total: session.queue.length, kind: session.kind };
  if (item.kind === "card") {
    const { content, concepts } = getContent();
    return ok({
      kind: "card",
      reason: item.reason,
      concept: concepts.get(item.conceptId),
      card: content.get(item.conceptId)?.card ?? null,
      progress,
    });
  }
  if (item.kind === "question") {
    const concept = getContent().concepts.get(item.question.conceptId);
    return ok({ kind: "question", mode: item.mode, question: item.question, concept, progress });
  }
  return ok({ kind: "done", progress });
});
