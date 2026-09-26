"use client";

import { Discover } from "@/components/game/discover";
import type { Island, ServiceUnit, UnitOverview } from "@/lib/content/types";

export function DiscoverPreview({ all, ...props }: { unit: ServiceUnit; island: Island | null; overview: UnitOverview; all: boolean }) {
  return <Discover {...props} autoRead={false} startAtSummary={all} onDone={() => {}} />;
}
