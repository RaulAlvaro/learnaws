import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/study/store";
import { monthSpend, MODELS } from "@/lib/ai/client";
import { Card, Stat } from "@/components/ui";
import { ApiKeyForm, CapForm, DeleteAccount, ExamResultForm, PushToggle, SettingsForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUser();
  const [s, spend, [user]] = await Promise.all([
    getSettings(userId),
    monthSpend(userId),
    db.select().from(schema.users).where(eq(schema.users.id, userId)),
  ]);
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

      <Card className="space-y-3" >
        <h2 id="ia" className="font-semibold">IA (tu propia API key de OpenAI)</h2>
        <p className="text-sm text-muted">
          Activa las pistas del tutor, la corrección de tus explicaciones y el modo voz. Sin key la app funciona igual: preguntas,
          explicaciones verificadas, repasos y simulacros. Tu key se guarda cifrada y nunca se muestra completa.
        </p>
        <ApiKeyForm last4={user?.openaiKeyLast4 ?? null} />
        <details className="text-sm">
          <summary className="cursor-pointer text-accent">¿Cómo consigo una API key?</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
            <li>
              Entra a{" "}
              <a className="text-accent underline" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                platform.openai.com/api-keys
              </a>{" "}
              (crea una cuenta si no tienes).
            </li>
            <li>“Create new secret key” → copia la clave (empieza con sk-).</li>
            <li>Carga saldo en Billing (con US$5 alcanza para meses: cada sesión cuesta centavos).</li>
            <li>Pégala aquí arriba.</li>
          </ol>
        </details>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Gasto del mes" value={`$${spend.toFixed(2)}`} hint={`tu tope $${user?.aiMonthlyCapUsd ?? 5}`} />
          <Stat label="Modelo tutor" value={<span className="text-sm">{MODELS.fast}</span>} hint={`voz: ${MODELS.tts}`} />
        </div>
        <CapForm initial={user?.aiMonthlyCapUsd ?? 5} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Recordatorio diario</h2>
        <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
        <p className="text-xs text-muted">
          En iPhone: primero “Agregar a pantalla de inicio” desde Safari y abre la app desde el ícono; luego activa las notificaciones.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">¿Ya rendiste el examen?</h2>
        <p className="text-sm text-muted">
          Cuéntanos el resultado real: lo comparamos con lo que la app predecía para saber si el método funciona.
        </p>
        <ExamResultForm initial={user?.examResult ?? null} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Privacidad y cuenta</h2>
        <p className="text-sm text-muted">
          El administrador de la app puede ver tu progreso de estudio (no tu API key) para mejorar el método. Puedes borrar tu cuenta y
          todos tus datos cuando quieras.
        </p>
        <DeleteAccount />
      </Card>
    </div>
  );
}
