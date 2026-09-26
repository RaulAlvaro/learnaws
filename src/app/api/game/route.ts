import { requireUser } from "@/lib/auth";
import { completeRound, gameState } from "@/lib/game/state";
import { handle, ok } from "@/lib/http/json";

export const GET = handle(async () => ok(await gameState(await requireUser())));

/** A round finished: count it toward the daily goal and return the new state (the client compares levels). */
export const POST = handle(async () => {
  const userId = await requireUser();
  await completeRound(userId);
  return ok(await gameState(userId));
});
