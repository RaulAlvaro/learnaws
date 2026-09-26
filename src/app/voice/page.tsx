"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";

interface Prompt {
  id: string;
  conceptId: string;
  kind: "recall" | "why-not";
  prompt: string;
  promptEs: string;
}
interface Grade {
  transcript: string;
  score: number;
  correct: boolean;
  feedback: string;
  missing: string[];
  idealAnswer: string;
}

type Status = "idle" | "loading" | "speaking" | "listening" | "grading" | "feedback" | "empty";

const SILENCE_MS = 2200;
const MAX_MS = 75_000;

/**
 * Hands-free retrieval: the app reads a short recall question, listens, grades
 * against the stored ideal answer, reads the feedback, and moves on.
 */
export default function VoicePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [concept, setConcept] = useState<{ title: string; titleEs: string } | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoNext, setAutoNext] = useState(true);
  const [count, setCount] = useState({ done: 0, right: 0 });
  const seen = useRef<string[]>([]);
  const spanishRef = useRef(false);
  const running = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => () => stopAll(), []);

  function stopAll() {
    running.current = false;
    audioRef.current?.pause();
    recRef.current?.stop();
  }

  function play(url: string) {
    return new Promise<void>((resolve) => {
      audioRef.current?.pause();
      const a = new Audio(url);
      audioRef.current = a;
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });
  }

  async function nextPrompt() {
    setStatus("loading");
    setGrade(null);
    setError(null);
    spanishRef.current = false;
    const res = await fetch(`/api/voice/next?exclude=${seen.current.join(",")}`, { cache: "no-store" });
    const data = await res.json();
    if (!data.prompt) {
      setStatus("empty");
      running.current = false;
      return;
    }
    seen.current.push(data.prompt.id);
    setPrompt(data.prompt);
    setConcept(data.concept);
    await ask(data.prompt, "en");
  }

  async function ask(p: Prompt, lang: "en" | "es") {
    if (!running.current) return;
    setStatus("speaking");
    await play(`/api/tts?ref=recall:${encodeURIComponent(p.id)}&lang=${lang}`);
    if (!running.current) return;
    await listen(p);
  }

  async function listen(p: Prompt) {
    setStatus("listening");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Necesito permiso de micrófono.");
      setStatus("idle");
      running.current = false;
      return;
    }
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const started = Date.now();

    // Simple voice-activity detection: stop after a pause once speech was heard.
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let heard = false;
    let lastLoud = Date.now();
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      if (rms > 0.04) {
        heard = true;
        lastLoud = Date.now();
      }
      const now = Date.now();
      if ((heard && now - lastLoud > SILENCE_MS) || now - started > MAX_MS) stop();
    }, 120);

    let stopped = false;
    function stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      if (recorder.state !== "inactive") recorder.stop();
    }
    recRef.current = { stop };

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      recorder.start(250);
    });
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
    if (!running.current) return;
    if (!heard) {
      setError("No te escuché. Toca «Responder de nuevo» cuando estés listo.");
      setStatus("feedback");
      return;
    }
    await send(p, blob, (Date.now() - started) / 1000, Date.now() - started);
  }

  async function send(p: Prompt, blob: Blob, durationSec: number, timeMs: number) {
    setStatus("grading");
    const form = new FormData();
    form.append("audio", blob, "answer.webm");
    form.append("promptId", p.id);
    form.append("durationSec", String(durationSec));
    form.append("timeMs", String(timeMs));
    form.append("usedSpanish", String(spanishRef.current));
    const res = await fetch("/api/voice/answer", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Error");
      setStatus("feedback");
      return;
    }
    if (data.command === "spanish") {
      spanishRef.current = true;
      return ask(p, "es");
    }
    if (data.command === "repeat") return ask(p, spanishRef.current ? "es" : "en");

    setGrade(data);
    setCount((c) => ({ done: c.done + 1, right: c.right + (data.correct ? 1 : 0) }));
    setStatus("feedback");
    const spoken = `${data.score === 2 ? "Bien." : data.score === 1 ? "Casi." : "No."} ${data.feedback}`;
    await play(`/api/tts?ref=feedback&lang=es&text=${encodeURIComponent(spoken)}`);
    if (running.current && autoNextRef.current) await nextPrompt();
  }

  const autoNextRef = useRef(autoNext);
  useEffect(() => {
    autoNextRef.current = autoNext;
  }, [autoNext]);

  function start() {
    running.current = true;
    nextPrompt();
  }

  const STATUS_TEXT: Record<Status, string> = {
    idle: "Listo para empezar",
    loading: "Buscando la siguiente pregunta…",
    speaking: "Leyendo la pregunta…",
    listening: "Te escucho… (pausa de 2 s para terminar)",
    grading: "Evaluando tu respuesta…",
    feedback: "Resultado",
    empty: "No hay conceptos para repasar por voz todavía",
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h1 className="display text-2xl">Modo manos libres</h1>
        <p className="text-sm text-muted">
          Te leo una pregunta corta sin opciones y respondes en voz alta, en español o inglés. Recordar sin opciones fortalece más que
          reconocer. Di <b>“en español”</b> para oírla traducida o <b>“repite”</b>. Cuenta para tus repasos, no para la probabilidad de
          aprobar.
        </p>
      </Card>

      <Card className="space-y-4 text-center">
        <div className="flex items-center justify-center gap-2 text-sm text-muted">
          {status === "listening" && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-bad" />}
          {STATUS_TEXT[status]}
        </div>
        {prompt && status !== "empty" && (
          <div className="space-y-2">
            {concept && <Badge>{concept.titleEs}</Badge>}
            <p className="text-lg leading-relaxed">{prompt.prompt}</p>
            {spanishRef.current && <p className="text-sm text-muted">{prompt.promptEs}</p>}
          </div>
        )}
        {status === "empty" && (
          <p className="text-sm text-muted">Primero aprende algunos conceptos en la sesión diaria; el modo voz repasa lo ya visto.</p>
        )}

        {grade && (
          <div className="space-y-2 rounded-lg bg-surface-2 p-3 text-left text-sm">
            <div className="flex items-center gap-2">
              <Badge tone={grade.score === 2 ? "good" : grade.score === 1 ? "warn" : "bad"}>{grade.score}/2</Badge>
              <span className="text-muted">Dijiste:</span>
            </div>
            <p className="italic">“{grade.transcript}”</p>
            <p>{grade.feedback}</p>
            {grade.missing.length > 0 && <p className="text-xs text-muted">Faltó: {grade.missing.join(" · ")}</p>}
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Respuesta modelo</summary>
              <p className="mt-1">{grade.idealAnswer}</p>
            </details>
          </div>
        )}
        {error && <p className="break-words text-sm text-bad">{error}</p>}

        <div className="flex flex-wrap justify-center gap-2">
          {!running.current || status === "idle" || status === "empty" ? (
            <Button onClick={start}>{status === "empty" ? "Reintentar" : "Empezar"}</Button>
          ) : (
            <>
              {status === "listening" && (
                <Button onClick={() => recRef.current?.stop()}>Listo</Button>
              )}
              {status === "feedback" && prompt && (
                <>
                  <Button onClick={nextPrompt}>Siguiente</Button>
                  <Button variant="secondary" onClick={() => listen(prompt)}>
                    Responder de nuevo
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  stopAll();
                  setStatus("idle");
                }}
              >
                Parar
              </Button>
            </>
          )}
        </div>
        <label className="flex items-center justify-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />
          Pasar a la siguiente automáticamente
        </label>
        <div className="text-xs text-muted tabular-nums">
          {count.done} respondidas · {count.right} completas
        </div>
      </Card>
    </div>
  );
}
