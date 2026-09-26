import { z } from "zod";
import { listMocks, startMock } from "@/lib/study/mocks";
import { handle, ok } from "@/lib/http/json";

const Body = z.object({ kind: z.enum(["mini", "full"]) });

export const GET = handle(async () => ok({ mocks: await listMocks() }));

export const POST = handle(async (req: Request) => {
  const { kind } = Body.parse(await req.json());
  const mock = await startMock(kind);
  return ok({ id: mock.id });
});
