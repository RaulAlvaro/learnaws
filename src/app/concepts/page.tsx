import { getContent } from "@/lib/content/load";
import { requireUser } from "@/lib/auth";
import { conceptRows } from "@/lib/study/store";
import { Badge, Card, DOMAIN_ES } from "@/components/ui";

export const dynamic = "force-dynamic";

const PHASE: Record<string, { label: string; tone: "neutral" | "accent" | "warn" | "good" }> = {
  unseen: { label: "Sin ver", tone: "neutral" },
  learning: { label: "Aprendiendo", tone: "accent" },
  reviewing: { label: "En repaso", tone: "warn" },
  graduated: { label: "Dominado", tone: "good" },
};

export default async function ConceptsPage() {
  const { syllabus, content } = getContent();
  const rows = await conceptRows(await requireUser());
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="display text-2xl">Conceptos</h1>
        <p className="text-sm text-muted">
          “Dominado” = 3 aciertos al aprenderlo + 3 repasos espaciados correctos sin ayuda. Las fichas se abren desde la sesión; aquí
          solo ves el mapa.
        </p>
      </Card>
      {syllabus.domains.map((d) => (
        <Card key={d.id} className="space-y-2">
          <h2 className="display text-xl">
            {DOMAIN_ES[d.id]} <span className="text-sm font-normal text-muted">· {Math.round(d.weight * 100)}%</span>
          </h2>
          <ul className="divide-y divide-border">
            {syllabus.concepts
              .filter((c) => c.domain === d.id)
              .sort((a, b) => a.order - b.order)
              .map((c) => {
                const r = rows.get(c.id);
                const ph = PHASE[r?.phase ?? "unseen"];
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      {c.titleEs}
                      {!content.has(c.id) && <span className="ml-1 text-xs text-muted">(sin contenido)</span>}
                      <span className="ml-1.5 inline-flex gap-0.5 align-middle" aria-label={`Frecuencia en el examen: ${c.examFrequency} de 3`}>{[1, 2, 3].map((k) => <span key={k} className={`h-2 w-2 rounded-full border border-ink ${k <= c.examFrequency ? "bg-yellow" : "bg-card"}`} />)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {r?.due && r.phase !== "unseen" && (
                        <span className="text-xs text-muted">{r.due.toLocaleDateString("es-PE", { day: "numeric", month: "short" })}</span>
                      )}
                      <Badge tone={ph.tone}>{ph.label}</Badge>
                    </span>
                  </li>
                );
              })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
