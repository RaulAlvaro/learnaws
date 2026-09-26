"use client";

import { Discover } from "@/components/game/discover";
import type { Island, ServiceUnit, UnitOverview } from "@/lib/content/types";

export function DiscoverPreview(props: { unit: ServiceUnit; island: Island | null; overview: UnitOverview }) {
  return <Discover {...props} autoRead={false} onDone={() => alert("done")} />;
}
