"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function ReportActions({ reportId }: { reportId: number }) {
  const router = useRouter();
  async function act(action: "disable-for-all" | "dismiss") {
    await fetch("/api/admin/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, action }),
    });
    router.refresh();
  }
  return (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={() => act("disable-for-all")}>
        Ocultar para todos
      </Button>
      <Button variant="ghost" onClick={() => act("dismiss")}>
        Descartar
      </Button>
    </div>
  );
}
