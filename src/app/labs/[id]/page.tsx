import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getContent } from "@/lib/content/load";
import { LabRunner } from "./runner";

export const dynamic = "force-dynamic";

export default async function LabPage({ params }: PageProps<"/labs/[id]">) {
  const { id } = await params;
  const lab = getContent().labs.find((l) => l.id === id);
  if (!lab) notFound();
  const [progress] = await db.select().from(schema.labProgress).where(eq(schema.labProgress.labId, id));
  return (
    <LabRunner
      lab={lab}
      initial={{
        doneSteps: progress?.doneSteps ?? [],
        answers: progress?.answers ?? {},
        completed: !!progress?.completedAt,
        cleanedUp: !!progress?.cleanedUpAt,
      }}
    />
  );
}
