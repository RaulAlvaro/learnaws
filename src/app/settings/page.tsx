import { getSettings } from "@/lib/study/store";
import { monthSpend, MONTHLY_CAP_USD, MODELS } from "@/lib/ai/client";
import { Card, Stat } from "@/components/ui";
import { PushToggle, SettingsForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [s, spend] = await Promise.all([getSettings(), monthSpend()]);
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h1 className="text-lg font-semibold">Ajustes</h1>
        <SettingsForm initial={s} />
        <p className="text-xs text-muted">
          La fecha meta limita el repaso espaciado (nada se agenda después) y controla cuándo dejan de entrar conceptos nuevos (14 días
          antes). Muévela si vas más lento o más rápido; la fecha real del examen la reservas cuando el panel te diga que estás listo.
        </p>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Recordatorio diario</h2>
        <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
        <p className="text-xs text-muted">
          En iPhone: primero “Agregar a pantalla de inicio” desde Safari y abre la app desde el ícono; luego activa las notificaciones.
        </p>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">IA</h2>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Gasto del mes" value={`$${spend.toFixed(2)}`} hint={`tope $${MONTHLY_CAP_USD}`} />
          <Stat label="Modelo tutor" value={<span className="text-sm">{MODELS.fast}</span>} hint={`voz: ${MODELS.tts}`} />
        </div>
      </Card>
    </div>
  );
}
