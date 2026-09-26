import { z } from "zod";
import { addExternalMock } from "@/lib/study/mocks";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({ source: z.string().min(2).max(100), scorePct: z.number().min(0).max(100) });

export const POST = handle(async (req: Request) => {
  const { source, scorePct } = Body.parse(await req.json());
  return ok(await addExternalMock(source, scorePct));
});
