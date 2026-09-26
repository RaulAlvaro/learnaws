"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";
import { GameIcon } from "./game/icons";

export function PrivacyNotice() {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="chunk w-full max-w-md space-y-3 p-5">
        <h2 className="display text-2xl">Bienvenido a Learn AWS</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          <li>Tu progreso (respuestas, repasos, simulacros) se guarda en tu cuenta.</li>
          <li>
            El administrador de la app puede ver tu progreso para mejorar el método. <b>Nunca</b> ve tu API key.
          </li>
          <li>La IA (tutor, voz) usa tu propia API key de OpenAI, que agregas en Ajustes. Sin key, todo lo demás funciona.</li>
          <li>Puedes borrar tu cuenta y todos tus datos desde Ajustes cuando quieras.</li>
        </ul>
        <Button
          className="w-full"
          onClick={async () => {
            setHidden(true);
            await fetch("/api/me", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ privacyAck: true }),
            });
            router.refresh();
          }}
        >
          Entendido
        </Button>
      </div>
    </div>
  );
}

export function FeedbackButton() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"idea" | "bug" | "content" | "other">("idea");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  async function send() {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, message, page: path }),
    });
    setSent(true);
    setMessage("");
    setTimeout(() => {
      setOpen(false);
      setSent(false);
    }, 1500);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Enviar comentario"
        className="press chunk-sm fixed right-4 top-[calc(env(safe-area-inset-top)+12px)] z-30 flex h-10 w-10 items-center justify-center !rounded-full sm:bottom-6 sm:top-auto"
      >
        <GameIcon name="chat-bubble" size={22} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="chunk w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="display text-2xl">¿Qué nos quieres contar?</h2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["idea", "Idea"],
                  ["bug", "Algo falla"],
                  ["content", "Contenido"],
                  ["other", "Otro"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-full border-2 border-ink px-3 py-1 text-sm font-extrabold ${kind === k ? "bg-yellow" : "bg-card"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Cuéntanos qué te funcionó, qué no, o qué cambiarías."
              className="w-full rounded-xl border-2 border-ink bg-card p-2.5 text-sm font-bold"
            />
            <Button className="w-full" onClick={send} disabled={message.trim().length < 3 || sent}>
              {sent ? "¡Gracias!" : "Enviar"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
