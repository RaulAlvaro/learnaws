import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { listMocks, startMock } from "@/lib/study/mocks";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({ kind: z.enum(["mini", "full"]) });

export const GET = handle(async () => ok({ mocks: await listMocks(await requireUser()) }));

export const POST = handle(async (req: Request) => {
  const userId = await requireUser();
  const { kind } = Body.parse(await req.json());
  const mock = await startMock(userId, kind);
  return ok({ id: mock.id });
});
