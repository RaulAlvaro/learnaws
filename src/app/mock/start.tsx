"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function StartMockButtons() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function start(kind: "mini" | "full") {
    setBusy(true);
    const res = await fetch("/api/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/mock/${data.id}`);
    setBusy(false);
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => start("mini")} disabled={busy}>
        Mini simulacro
      </Button>
      <Button variant="secondary" onClick={() => start("full")} disabled={busy}>
        Simulacro completo
      </Button>
    </div>
  );
}

export function ExternalMockForm() {
  const router = useRouter();
  const [source, setSource] = useState("AWS Official Practice Exam");
  const [score, setScore] = useState("");
  async function save() {
    await fetch("/api/mock/external", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, scorePct: Number(score) }),
    });
    setScore("");
    router.refresh();
  }
  return (
    <div className="flex flex-wrap gap-2">
      <select
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
      >
        <option>AWS Official Practice Exam</option>
        <option>Tutorials Dojo</option>
        <option>Otro</option>
      </select>
      <input
        type="number"
        min={0}
        max={100}
        placeholder="% aciertos"
        value={score}
        onChange={(e) => setScore(e.target.value)}
        className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
      />
      <Button variant="secondary" onClick={save} disabled={score === ""}>
        Guardar
      </Button>
    </div>
  );
}
