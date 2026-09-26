import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { dashboard } from "@/lib/study/metrics";
import { Badge, Bar, Button, Card, DOMAIN_ES, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

const pct = (v: number | null | undefined, digits = 0) => (v == null ? "—" : `${v.toFixed(digits)}%`);

export default async function ProgressPage() {
  const d = await dashboard(await requireUser());
  const r = d.readiness;

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-muted">Hoy</div>
            <div className="text-2xl font-semibold">
              {d.dueNow > 0 ? `${d.dueNow} repasos pendientes` : "Sesión lista"}
            </div>
            <div className="mt-1 text-sm text-muted">
              {d.dueNow > 0 ? `~${Math.round(d.dueNow * 1.5)} min de repaso + conceptos nuevos` : "Conceptos nuevos + práctica mezclada"}
              {" · "}racha {d.streak} {d.streak === 1 ? "día" : "días"}
            </div>
          </div>
          <Badge tone={d.daysLeft <= 14 ? "warn" : "neutral"}>
            {d.daysLeft > 0 ? `${d.daysLeft} días a la meta` : "Meta alcanzada"}
          </Badge>
        </div>
        <Link href="/" className="block">
          <Button className="w-full">Jugar ▶</Button>
        </Link>
      </Card>

      {d.gate.ready && (
        <Card className="border-good bg-good-bg">
          <div className="font-semibold text-good">Estás listo: reserva el examen para dentro de 5–7 días.</div>
          <p className="mt-1 text-sm">2 simulacros completos ≥ 80%, ningún dominio &lt; 70% y un simulacro externo que lo confirma.</p>
        </Card>
      )}

      <Card className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Probabilidad de aprobar</h2>
          <span className="text-xs text-muted">{r.evidence} respuestas válidas</span>
        </div>
        {r.enoughData ? (
          <>
            <div className="text-3xl font-semibold tabular-nums">
              {pct(r.passProbability * 100)}
              <span className="ml-2 text-base font-normal text-muted">
                rango {pct(r.passLow * 100)}–{pct(r.passHigh * 100)}
              </span>
            </div>
            <p className="text-xs text-muted">
              Solo cuenta lo que respondes sin ayuda: simulacros con preguntas reservadas y preguntas nuevas de conceptos que no ves hace
              7+ días. AWS no publica la equivalencia exacta de 720/1000, así que es un rango, no una promesa.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            Aún no hay suficiente evidencia honesta (mínimo 30 respuestas). Aparece cuando empiecen los repasos diferidos o hagas un
            simulacro.
          </p>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Dominios</h2>
        {d.domains.map((dm) => (
          <div key={dm.id} className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span>
                {DOMAIN_ES[dm.id]} <span className="text-muted">· {Math.round(dm.weight * 100)}%</span>
              </span>
              <span className="text-xs text-muted tabular-nums">
                {dm.graduated}/{dm.total} dominados · {dm.accuracy != null ? `${dm.accuracy.toFixed(0)}% acierto` : "sin datos"}
              </span>
            </div>
            <div className="flex gap-1">
              <div className="flex-1">
                <Bar value={dm.total ? ((dm.graduated + dm.learning * 0.4) / dm.total) * 100 : 0} className="bg-good" />
              </div>
            </div>
          </div>
        ))}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Retención a 7+ días"
          value={pct(d.delayedRetention?.pct)}
          hint={d.delayedRetention ? `${d.delayedRetention.n} respuestas` : "sin datos aún"}
        />
        <Stat label="Sin pedir pistas" value={pct(d.unaidedPct)} hint="últimos 14 días" />
        <Stat label="Uso de español" value={pct(d.spanishPct)} hint="últimos 7 días" />
        <Stat label="IA este mes" value={`$${d.spend.month.toFixed(2)}`} hint={`tope $${d.spend.cap}`} />
      </div>

      <Card className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Calibración</h2>
          {d.brier != null && <span className="text-xs text-muted">Brier {d.brier.toFixed(3)} (menor es mejor)</span>}
        </div>
        <p className="text-xs text-muted">¿Aciertas cuando dices estar seguro? Si “Seguro” está por debajo de 85%, estás sobreconfiado.</p>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          {d.calibration.map((c) => (
            <div key={c.confidence} className="rounded-lg bg-surface-2 p-2">
              <div className="text-xs text-muted">{["Adivinando", "Bastante seguro", "Seguro"][c.confidence - 1]}</div>
              <div
                className={`text-lg font-semibold tabular-nums ${c.confidence === 3 && c.pct != null && c.pct < 85 ? "text-bad" : ""}`}
              >
                {pct(c.pct)}
              </div>
              <div className="text-xs text-muted">n={c.n}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Para reservar el examen</h2>
        <GateRow ok={d.gate.twoFullOver80} text="2 simulacros completos seguidos ≥ 80%" />
        <GateRow ok={d.gate.noWeakDomain} text="Ningún dominio < 70% en esos simulacros" />
        <GateRow ok={d.gate.externalOk} text="Simulacro externo ≥ 80% (Skill Builder o Tutorials Dojo)" />
      </Card>
    </div>
  );
}

function GateRow({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${ok ? "bg-good-bg text-good" : "bg-surface-2 text-muted"}`}>
        {ok ? "✓" : "·"}
      </span>
      <span className={ok ? "" : "text-muted"}>{text}</span>
    </div>
  );
}
