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
  const [state, setState] = useState<"unknown" | "unsupported" | "off" | "on" | "denied">(() =>
    typeof window !== "undefined" && !("serviceWorker" in navigator && "PushManager" in window) ? "unsupported" : "unknown",
  );
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
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

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export function ApiKeyForm({ last4 }: { last4: string | null }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await send("/api/me/key", "POST", { apiKey: key });
    setBusy(false);
    if (!r.ok) return setMsg(r.data.error ?? "No se pudo guardar");
    setKey("");
    setMsg("Guardada y validada");
    router.refresh();
  }

  async function remove() {
    await send("/api/me/key", "DELETE");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {last4 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-md bg-surface-2 px-2 py-1 font-mono">sk-…{last4}</span>
          <button onClick={remove} className="text-xs text-bad">
            Borrar
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={last4 ? "Reemplazar por otra key…" : "sk-…"}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm"
        />
        <Button onClick={save} disabled={busy || key.trim().length < 20}>
          {busy ? "Validando…" : "Guardar"}
        </Button>
      </div>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  );
}

export function CapForm({ initial }: { initial: number }) {
  const router = useRouter();
  const [cap, setCap] = useState(initial);
  const [saved, setSaved] = useState(false);
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Tope mensual (US$)</span>
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={cap}
        onChange={(e) => {
          setCap(Number(e.target.value));
          setSaved(false);
        }}
        className="w-24 rounded-lg border border-border bg-surface px-3 py-2"
      />
      <Button
        variant="secondary"
        onClick={async () => {
          await send("/api/me", "PATCH", { aiMonthlyCapUsd: cap });
          setSaved(true);
          router.refresh();
        }}
      >
        {saved ? "Guardado" : "Guardar"}
      </Button>
    </label>
  );
}

export function ExamResultForm({
  initial,
}: {
  initial: { date: string; passed: boolean; score: number | null } | null;
}) {
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [passed, setPassed] = useState<boolean | null>(initial?.passed ?? null);
  const [score, setScore] = useState(initial?.score?.toString() ?? "");
  const [saved, setSaved] = useState(!!initial);
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2" />
        <Button variant={passed === true ? "primary" : "secondary"} onClick={() => setPassed(true)}>
          Aprobé
        </Button>
        <Button variant={passed === false ? "primary" : "secondary"} onClick={() => setPassed(false)}>
          No aprobé
        </Button>
        <input
          type="number"
          min={100}
          max={1000}
          placeholder="Puntaje (100–1000)"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="w-40 rounded-lg border border-border bg-surface px-3 py-2"
        />
      </div>
      <Button
        disabled={passed === null}
        onClick={async () => {
          await send("/api/me", "PATCH", { examResult: { date, passed, score: score ? Number(score) : null } });
          setSaved(true);
        }}
      >
        {saved ? "Guardado" : "Guardar resultado"}
      </Button>
    </div>
  );
}

export function DeleteAccount() {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder='Escribe "borrar" para confirmar'
        className="rounded-lg border border-border bg-surface px-3 py-2"
      />
      <Button
        variant="secondary"
        className="text-bad"
        disabled={confirm !== "borrar" || busy}
        onClick={async () => {
          setBusy(true);
          await send("/api/me", "DELETE");
          window.location.href = "/";
        }}
      >
        Borrar mi cuenta y datos
      </Button>
    </div>
  );
}
