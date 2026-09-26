import { desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getContent } from "@/lib/content/load";
import { estimateReadiness } from "@/lib/engine/readiness";
import { readinessEvidence } from "@/lib/study/metrics";
import { Badge, Card } from "@/components/ui";
import { ReportActions } from "./actions";

export const dynamic = "force-dynamic";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function windows() {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  return { since7: new Date(Date.now() - 7 * 86_400_000), monthStart };
}

export default async function AdminPage() {
  await requireAdmin();
  const weights = Object.fromEntries(getContent().syllabus.domains.map((d) => [d.id, d.weight]));
  const { since7, monthStart } = windows();

  const [users, days, recent, graduated, spend, feedback, reports] = await Promise.all([
    db.select().from(schema.users).orderBy(desc(schema.users.lastSeenAt)),
    db
      .select({ userId: schema.studyDays.userId, days: sql<number>`count(*)::int`, minutes: sql<number>`sum(${schema.studyDays.minutes})` })
      .from(schema.studyDays)
      .groupBy(schema.studyDays.userId),
    db
      .select({ userId: schema.attempts.userId, n: sql<number>`count(*)::int` })
      .from(schema.attempts)
      .where(gte(schema.attempts.createdAt, since7))
      .groupBy(schema.attempts.userId),
    db
      .select({ userId: schema.conceptState.userId, n: sql<number>`count(*)::int` })
      .from(schema.conceptState)
      .where(eq(schema.conceptState.phase, "graduated"))
      .groupBy(schema.conceptState.userId),
    db
      .select({ userId: schema.aiUsage.userId, usd: sql<number>`sum(${schema.aiUsage.costUsd})` })
      .from(schema.aiUsage)
      .where(gte(schema.aiUsage.createdAt, monthStart))
      .groupBy(schema.aiUsage.userId),
    db.select().from(schema.feedback).orderBy(desc(schema.feedback.createdAt)).limit(50),
    db.select().from(schema.questionReports).where(eq(schema.questionReports.status, "open")).orderBy(desc(schema.questionReports.createdAt)),
  ]);
  const by = <T extends { userId: string }>(rows: T[]) => new Map(rows.map((r) => [r.userId, r]));
  const dayMap = by(days);
  const recentMap = by(recent);
  const gradMap = by(graduated);
  const spendMap = by(spend);
  const names = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  const readiness = new Map(
    await Promise.all(users.map(async (u) => [u.id, estimateReadiness(await readinessEvidence(u.id), weights)] as const)),
  );
  const totalConcepts = getContent().syllabus.concepts.length;
  const { questions } = getContent();

  return (
    <div className="space-y-4">
      <Card className="space-y-1">
        <h1 className="text-lg font-semibold">Administración</h1>
        <p className="text-sm text-muted">
          {users.length} usuarios · {users.filter((u) => recentMap.has(u.id)).length} activos esta semana · IA del sistema este mes: $
          {Number(spendMap.get("system")?.usd ?? 0).toFixed(2)}
        </p>
      </Card>

      <Card className="space-y-2 overflow-x-auto">
        <h2 className="font-semibold">Usuarios</h2>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1">Usuario</th>
              <th>Días</th>
              <th>Resp. 7d</th>
              <th>Dominados</th>
              <th>P(aprobar)</th>
              <th>Examen real</th>
              <th>IA mes</th>
              <th>Key</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => {
              const r = readiness.get(u.id);
              return (
                <tr key={u.id}>
                  <td className="py-2">
                    {u.name ?? u.email ?? u.id}
                    <div className="text-xs text-muted">visto {u.lastSeenAt.toLocaleDateString("es-PE")}</div>
                  </td>
                  <td className="tabular-nums">{dayMap.get(u.id)?.days ?? 0}</td>
                  <td className="tabular-nums">{recentMap.get(u.id)?.n ?? 0}</td>
                  <td className="tabular-nums">
                    {gradMap.get(u.id)?.n ?? 0}/{totalConcepts}
                  </td>
                  <td className="tabular-nums">{r?.enoughData ? pct(r.passProbability) : "—"}</td>
                  <td>
                    {u.examResult ? (
                      <Badge tone={u.examResult.passed ? "good" : "bad"}>
                        {u.examResult.passed ? "Aprobó" : "No aprobó"} {u.examResult.score ?? ""} · pred {pct(u.examResult.predictedPassProbability)}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="tabular-nums">${Number(spendMap.get(u.id)?.usd ?? 0).toFixed(2)}</td>
                  <td>{u.openaiKeyLast4 ? "✓" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Preguntas reportadas ({reports.length})</h2>
        {reports.length === 0 && <p className="text-sm text-muted">Nada pendiente.</p>}
        {reports.map((r) => (
          <div key={r.id} className="space-y-1 rounded-lg border border-border p-3 text-sm">
            <div className="text-xs text-muted">
              {names.get(r.userId)} · {r.createdAt.toLocaleDateString("es-PE")} · {r.questionId}
            </div>
            <p className="italic">“{r.note}”</p>
            <details>
              <summary className="cursor-pointer text-xs text-accent">Ver pregunta</summary>
              <p className="mt-1 whitespace-pre-line">{questions.get(r.questionId)?.stem}</p>
              <ul className="mt-1 text-xs">
                {questions.get(r.questionId)?.options.map((o) => (
                  <li key={o.id} className={o.correct ? "text-good" : ""}>
                    {o.id}. {o.text}
                  </li>
                ))}
              </ul>
            </details>
            <ReportActions reportId={r.id} />
          </div>
        ))}
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Feedback</h2>
        {feedback.length === 0 && <p className="text-sm text-muted">Sin comentarios todavía.</p>}
        {feedback.map((f) => (
          <div key={f.id} className="rounded-lg bg-surface-2 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted">
              <Badge>{f.kind}</Badge> {names.get(f.userId) ?? f.userId} · {f.createdAt.toLocaleDateString("es-PE")} {f.page ?? ""}
            </div>
            <p className="whitespace-pre-line">{f.message}</p>
          </div>
        ))}
      </Card>
    </div>
  );
}
