import { notFound } from "next/navigation";
import { getContent } from "@/lib/content/load";
import { DiscoverPreview } from "./preview";

/** Development-only preview of a unit's "Descubrir" overview. */
export default async function DevDiscover({ params, searchParams }: PageProps<"/dev/discover/[unitId]">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { unitId } = await params;
  const { units, unitContent, islands } = getContent();
  const unit = units.get(unitId);
  const overview = unitContent.get(unitId)?.overview;
  if (!unit || !overview) notFound();
  const all = (await searchParams).all === "1";
  return <DiscoverPreview unit={unit} island={islands.find((i) => i.id === unit.island) ?? null} overview={overview} all={all} />;
}
