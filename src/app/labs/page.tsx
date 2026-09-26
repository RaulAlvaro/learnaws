import Link from "next/link";
import { db, schema } from "@/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getContent } from "@/lib/content/load";
import { Badge, Card, DOMAIN_ES } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Labs are recommended where you fail most: concepts with ≥ 2 errors in the last 21 days. */
async function strugglingConcepts(userId: string): Promise<Set<string>> {
  const since = new Date(Date.now() - 21 * 86_400_000);
  const rows = await db
    .select({ conceptId: schema.attempts.conceptId, n: sql<number>`count(*)::int` })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.userId, userId),
        eq(schema.attempts.correct, false),
        eq(schema.attempts.aided, false),
        gte(schema.attempts.createdAt, since),
      ),
    )
    .groupBy(schema.attempts.conceptId);
  return new Set(rows.filter((r) => r.n >= 2).map((r) => r.conceptId));
}

export default async function LabsPage() {
  const { labs } = getContent();
  const userId = await requireUser();
  const [progress, struggling] = await Promise.all([
    db.select().from(schema.labProgress).where(eq(schema.labProgress.userId, userId)),
    strugglingConcepts(userId),
  ]);
  const byId = new Map(progress.map((p) => [p.labId, p]));
  const lab0Done = !!byId.get(labs[0]?.id)?.completedAt;

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h1 className="display text-2xl">Labs en tu cuenta de AWS</h1>
        <p className="text-sm text-muted">
          Pocos y dirigidos: haz el lab cuando la app lo recomiende por tus errores. Cada uno tiene preguntas de predicción (“¿qué
          pasará si…?”) y una limpieza obligatoria. <b className="text-fg">El lab 0 (alerta de presupuesto) va primero.</b>
        </p>
      </Card>
      {labs.map((l) => {
        const p = byId.get(l.id);
        const recommended = l.order === 0 ? !lab0Done : l.concepts.some((c) => struggling.has(c));
        return (
          <Link key={l.id} href={`/labs/${l.id}`} className="block">
            <Card className="space-y-1.5 hover:bg-surface-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Lab {l.order}</span>
                {recommended && <Badge tone="accent">Recomendado</Badge>}
                {p?.completedAt && <Badge tone="good">Hecho</Badge>}
                {p?.completedAt && !p.cleanedUpAt && <Badge tone="bad">Falta limpiar</Badge>}
              </div>
              <div className="font-medium">{l.titleEs}</div>
              <div className="text-xs text-muted">
                {DOMAIN_ES[l.domain]} · {l.minutes} min · {l.estimatedCostUsd}
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
