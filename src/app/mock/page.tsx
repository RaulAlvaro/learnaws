import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listMocks } from "@/lib/study/mocks";
import { Badge, Card } from "@/components/ui";
import { ExternalMockForm, StartMockButtons } from "./start";

export const dynamic = "force-dynamic";

const KIND = { mini: "Mini (25 preg · 50 min)", full: "Completo (65 preg · 130 min)", external: "Externo" };

export default async function MockPage() {
  const mocks = await listMocks(await requireUser());
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h1 className="display text-2xl">Simulacros</h1>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            <b className="text-fg">Mini semanal</b>: 25 preguntas que no ves hace 14+ días. Mide retención, no memoria de corto plazo.
            Reemplaza la sesión de ese día.
          </li>
          <li>
            <b className="text-fg">Completo</b>: 65 preguntas del banco reservado (nunca las practicaste), 130 min, proporción real de
            dominios. Haz dos en las últimas 2 semanas.
          </li>
          <li>Feedback al final, como en el examen. Marca las dudosas y vuelve a ellas.</li>
        </ul>
        <StartMockButtons />
      </Card>

      <Card className="space-y-3">
        <h2 className="display text-xl">Simulacro externo</h2>
        <p className="text-sm text-muted">
          Registra tu resultado del Official Practice Exam (Skill Builder) o de Tutorials Dojo. Es la confirmación externa para reservar.
        </p>
        <ExternalMockForm />
      </Card>

      <Card className="space-y-2">
        <h2 className="display text-xl">Historial</h2>
        {mocks.length === 0 && <p className="text-sm text-muted">Todavía no hiciste ninguno.</p>}
        {mocks.map((m) => (
          <Link
            key={m.id}
            href={m.kind === "external" ? "/mock" : `/mock/${m.id}`}
            className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:bg-surface-2"
          >
            <span>
              {KIND[m.kind]} {m.source ? `· ${m.source}` : ""}
              <span className="block text-xs text-muted">{m.startedAt.toLocaleDateString("es-PE")}</span>
            </span>
            {m.finishedAt ? (
              <Badge tone={(m.scorePct ?? 0) >= 80 ? "good" : (m.scorePct ?? 0) >= 72 ? "warn" : "bad"}>
                {(m.scorePct ?? 0).toFixed(0)}%
              </Badge>
            ) : (
              <Badge tone="accent">Continuar</Badge>
            )}
          </Link>
        ))}
      </Card>
    </div>
  );
}
