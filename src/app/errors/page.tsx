import { getContent } from "@/lib/content/load";
import { requireUser } from "@/lib/auth";
import { errorLog } from "@/lib/study/metrics";
import { Badge, Card, DOMAIN_ES } from "@/components/ui";

export const dynamic = "force-dynamic";

const CATEGORY: Record<string, { label: string; tip: string }> = {
  "knowledge-gap": { label: "Laguna de conocimiento", tip: "Te faltaba el dato: repasa la ficha." },
  "misread-keyword": { label: "Frase clave pasada por alto", tip: "Subraya mentalmente el criterio: cost-effective, least overhead, HA…" },
  "service-confusion": { label: "Confusión entre servicios", tip: "Aparecerán juntos en la práctica mezclada." },
  overconfidence: { label: "Certeza alta equivocada", tip: "Los más valiosos: se priorizan en el repaso." },
};

export default async function ErrorsPage() {
  const { rows, counts } = await errorLog(await requireUser());
  const { questions, concepts } = getContent();
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h1 className="text-lg font-semibold">Registro de errores</h1>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(CATEGORY).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-2 p-2.5">
              <div className="text-xs text-muted">{v.label}</div>
              <div className="text-lg font-semibold tabular-nums">{counts.find((c) => c.category === k)?.n ?? 0}</div>
              <div className="text-xs text-muted">{v.tip}</div>
            </div>
          ))}
        </div>
      </Card>
      {rows.length === 0 && <p className="text-sm text-muted">Sin errores todavía.</p>}
      {rows.map((a) => {
        const q = questions.get(a.questionId);
        const c = concepts.get(a.conceptId);
        const correct = q?.options.filter((o) => o.correct).map((o) => o.id) ?? [];
        return (
          <Card key={a.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {a.errorCategory && <Badge tone={a.errorCategory === "overconfidence" ? "bad" : "warn"}>{CATEGORY[a.errorCategory].label}</Badge>}
              {c && <Badge>{c.titleEs}</Badge>}
              <span className="text-xs text-muted">
                {DOMAIN_ES[a.domain]} · {a.createdAt.toLocaleDateString("es-PE")} · {a.mode}
              </span>
            </div>
            {q ? (
              <details>
                <summary className="cursor-pointer text-sm">{q.stem.slice(0, 160)}…</summary>
                <div className="mt-2 space-y-1.5 text-sm">
                  {q.options.map((o) => (
                    <div key={o.id} className={o.correct ? "text-good" : a.selected.includes(o.id) ? "text-bad" : "text-muted"}>
                      <b>{o.id}.</b> {o.text}
                      <div className="text-xs text-muted">{o.why}</div>
                    </div>
                  ))}
                  <p className="pt-1">{q.es.explanation}</p>
                </div>
              </details>
            ) : (
              <p className="text-sm text-muted">{a.transcript ?? a.questionId}</p>
            )}
            <div className="text-xs text-muted">
              Elegiste {a.selected.join(", ") || "—"} · correcta {correct.join(", ") || "—"}
              {a.explanationFeedback ? ` · ${a.explanationFeedback}` : ""}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
