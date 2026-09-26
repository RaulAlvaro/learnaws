import { requireUser } from "@/lib/auth";
import { advance } from "@/lib/study/session";
import { handle, ok } from "@/lib/http/json";

export const POST = handle(async () => {
  await advance(await requireUser());
  return ok({ ok: true });
});
