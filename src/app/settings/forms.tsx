"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

export function SettingsForm({ initial }: { initial: { targetDate: string; dailyMinutes: number; reminderHour: number } }) {
  const router = useRouter();
  const [target, setTarget] = useState(initial.targetDate.slice(0, 10));
  const [minutes, setMinutes] = useState(initial.dailyMinutes);
  const [hour, setHour] = useState(initial.reminderHour);
  const [saved, setSaved] = useState(false);

  async function save() {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetDate: new Date(`${target}T12:00:00Z`).toISOString(), dailyMinutes: minutes, reminderHour: hour }),
    });
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm">
        <span className="text-muted">Fecha meta</span>
        <input
          type="date"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2"
        />
      </label>
      <label className="text-sm">
        <span className="text-muted">Minutos por día</span>
        <input
          type="number"
          min={15}
          max={180}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2"
        />
      </label>
      <label className="text-sm">
        <span className="text-muted">Hora del recordatorio</span>
        <select
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {h.toString().padStart(2, "0")}:00
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-3">
        <Button onClick={save}>{saved ? "Guardado" : "Guardar"}</Button>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushToggle({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<"unknown" | "unsupported" | "off" | "on" | "denied">("unknown");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState(Notification.permission === "denied" ? "denied" : sub ? "on" : "off");
    });
  }, []);

  async function enable() {
    if (!vapidKey) {
      setMsg("Faltan las claves VAPID en el servidor (corre el script de setup).");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setState("denied");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
    await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
    setState("on");
  }

  async function test() {
    const res = await fetch("/api/push/test", { method: "POST" });
    const data = await res.json();
    setMsg(data.sent ? "Enviada" : (data.reason ?? data.error ?? "No se envió"));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {state === "unsupported" && <span className="text-muted">Este navegador no soporta notificaciones push.</span>}
      {state === "denied" && <span className="text-bad">Notificaciones bloqueadas en el navegador.</span>}
      {state === "off" && <Button onClick={enable}>Activar notificaciones</Button>}
      {state === "on" && (
        <>
          <span className="text-good">Activadas en este dispositivo</span>
          <Button variant="secondary" onClick={test}>
            Probar
          </Button>
        </>
      )}
      {msg && <span className="text-muted">{msg}</span>}
    </div>
  );
}
