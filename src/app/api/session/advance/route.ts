import { advance } from "@/lib/study/session";
import { handle, ok } from "@/lib/http/json";

export const POST = handle(async () => {
  await advance();
  return ok({ ok: true });
});
