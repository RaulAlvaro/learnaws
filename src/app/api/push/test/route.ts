import { sendReminder } from "@/lib/push";
import { handle, ok } from "@/lib/http/json";

export const POST = handle(async () => ok(await sendReminder()));
