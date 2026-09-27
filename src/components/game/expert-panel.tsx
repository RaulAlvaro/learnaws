"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { duck } from "@/lib/game/music";
import { GameIcon } from "./icons";

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  voice?: boolean;
}
interface Source {
  n: number;
  title: string;
  url: string | null;
  source: string;
}
type VoiceState = "off" | "connecting" | "listening" | "thinking" | "speaking";

const SUGGESTIONS = [
  "¿Por qué no sirve la opción que elegí?",
  "Explícamelo con un ejemplo",
  "¿Cómo lo reconozco en el examen?",
];

/** Minimal renderer for the expert's replies: **bold** and [n] citation chips. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+\])/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") ? (
          <strong key={i} className="font-black">
            {p.slice(2, -2)}
          </strong>
        ) : /^\[\d+\]$/.test(p) ? (
          <sup key={i} className="mx-0.5 rounded-md border border-ink bg-card px-1 text-[10px] font-black">
            {p.slice(1, -1)}
          </sup>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/**
 * "Pregúntale al experto": text chat (streamed, cited) and live voice-to-voice (WebRTC),
 * both grounded in retrieved verified content. Opens only after the question was answered.
 */
export function ExpertPanel({ attemptId, onClose }: { attemptId: number; onClose: () => void }) {
  const reduce = useReducedMotion();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceState>("off");
  const listRef = useRef<HTMLDivElement>(null);
  const rtc = useRef<{ pc: RTCPeerConnection; dc: RTCDataChannel; mic: MediaStream; audio: HTMLAudioElement; unduck: () => void; started: number; model: string; conceptId: string } | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages, reduce]);

  useEffect(() => () => void stopVoice(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- text chat (streamed NDJSON) ----------
  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    const history: Msg[] = [...messages, { id: crypto.randomUUID(), role: "user", text: q }];
    const answerId = crypto.randomUUID();
    setMessages([...history, { id: answerId, role: "assistant", text: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/expert/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, messages: history.map((m) => ({ role: m.role, content: m.text })) }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "El experto no pudo responder");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "sources") setSources(ev.sources);
          if (ev.type === "delta") setMessages((m) => m.map((x) => (x.id === answerId ? { ...x, text: x.text + ev.text } : x)));
          if (ev.type === "error") throw new Error(ev.message);
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setMessages((m) => m.filter((x) => x.id !== answerId || x.text));
    } finally {
      setBusy(false);
    }
  }

  // ---------- voice-to-voice (Realtime API over WebRTC) ----------
  async function startVoice() {
    setError(null);
    setVoice("connecting");
    try {
      const res = await fetch("/api/expert/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
      const session = await res.json();
      if (!res.ok) throw new Error(session.error ?? "No se pudo iniciar la voz");

      const pc = new RTCPeerConnection();
      const audio = new Audio();
      audio.autoplay = true;
      pc.ontrack = (e) => (audio.srcObject = e.streams[0]);
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      pc.addTrack(mic.getTracks()[0], mic);
      const dc = pc.createDataChannel("oai-events");
      dc.onopen = () => dc.send(JSON.stringify({ type: "response.create" })); // the expert opens the conversation
      dc.onmessage = (e) => void onRealtimeEvent(JSON.parse(e.data));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${session.value}`, "Content-Type": "application/sdp" },
      });
      if (!sdp.ok) throw new Error("No se pudo conectar con la voz del experto");
      await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
      rtc.current = { pc, dc, mic, audio, unduck: duck(0), started: Date.now(), model: session.model, conceptId: session.conceptId };
      setVoice("thinking");
    } catch (e) {
      const msg = (e as Error).message;
      setError(/Permission|NotAllowed/i.test(msg) ? "Necesito permiso de micrófono para hablar." : msg);
      await stopVoice();
    }
  }

  async function stopVoice() {
    const r = rtc.current;
    rtc.current = null;
    setVoice("off");
    if (!r) return;
    r.mic.getTracks().forEach((t) => t.stop());
    r.dc.close();
    r.pc.close();
    r.audio.srcObject = null;
    r.unduck();
    const seconds = (Date.now() - r.started) / 1000;
    await fetch("/api/expert/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds, model: r.model }),
    }).catch(() => {});
  }

  async function onRealtimeEvent(ev: { type: string; [k: string]: unknown }) {
    const r = rtc.current;
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        setVoice("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        setVoice("thinking");
        break;
      case "output_audio_buffer.started":
        setVoice("speaking");
        break;
      case "output_audio_buffer.stopped":
        setVoice("listening");
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const text = String(ev.transcript ?? "").trim();
        if (text) setMessages((m) => [...m, { id: String(ev.item_id), role: "user", text, voice: true }]);
        break;
      }
      case "response.output_audio_transcript.delta": {
        const id = String(ev.item_id);
        const delta = String(ev.delta ?? "");
        setMessages((m) =>
          m.some((x) => x.id === id)
            ? m.map((x) => (x.id === id ? { ...x, text: x.text + delta } : x))
            : [...m, { id, role: "assistant", text: delta, voice: true }],
        );
        break;
      }
      case "response.function_call_arguments.done": {
        if (!r || ev.name !== "search_aws_notes") break;
        let query = "";
        try {
          query = JSON.parse(String(ev.arguments)).query ?? "";
        } catch {}
        const res = await fetch("/api/expert/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, conceptId: r.conceptId }),
        });
        const data = await res.json().catch(() => ({ results: [] }));
        r.dc.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: ev.call_id, output: JSON.stringify(data.results ?? []) },
          }),
        );
        r.dc.send(JSON.stringify({ type: "response.create" }));
        break;
      }
      case "error": {
        const err = ev.error as { message?: string } | undefined;
        setError(err?.message ?? "Error en la conversación de voz");
        break;
      }
    }
  }

  const voiceLabel: Record<VoiceState, string> = {
    off: "Hablar con el experto",
    connecting: "Conectando",
    listening: "Te escucho",
    thinking: "Pensando",
    speaking: "El experto habla",
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#1c1840]/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Pregúntale al experto"
    >
      <motion.div
        initial={{ y: reduce ? 0 : 40 }}
        animate={{ y: 0 }}
        className="chunk flex h-[92dvh] w-full max-w-lg flex-col !rounded-b-none !rounded-t-[28px] bg-card sm:h-[80dvh] sm:!rounded-[28px]"
      >
        <div className="flex items-center gap-3 border-b-[3px] border-ink p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border-[3px] border-ink bg-blue text-white">
            <GameIcon name="gift-of-knowledge" size={24} />
          </span>
          <div className="flex-1">
            <div className="display text-2xl leading-none">Experto AWS</div>
            <div className="text-xs font-extrabold text-muted">Responde con tus fichas y la documentación de AWS</div>
          </div>
          <button
            onClick={async () => {
              await stopVoice();
              onClose();
            }}
            aria-label="Cerrar"
            className="press chunk-sm flex h-10 w-10 items-center justify-center"
          >
            <GameIcon name="cross-mark" size={18} />
          </button>
        </div>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && voice === "off" && (
            <div className="space-y-3">
              <p className="font-bold text-muted">¿Qué te quedó en duda? Pregunta con tus palabras, o toca un botón.</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="press chunk-sm px-3 py-2 text-sm font-extrabold">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl border-[3px] border-ink px-3.5 py-2.5 text-[15px] font-bold leading-relaxed ${
                  m.role === "user" ? "bg-yellow" : "bg-card-2"
                }`}
              >
                {m.voice && <GameIcon name="microphone" size={12} className="mb-0.5 mr-1 inline text-muted" />}
                {m.text ? <RichText text={m.text} /> : <span className="text-muted">Pensando…</span>}
              </div>
            </div>
          ))}
          {sources.length > 0 && voice === "off" && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {sources.map((s) =>
                s.url ? (
                  <a key={s.n} href={s.url} target="_blank" rel="noreferrer" className="rounded-full border-2 border-ink bg-card px-2.5 py-0.5 text-xs font-extrabold">
                    [{s.n}] {s.title}
                  </a>
                ) : (
                  <span key={s.n} className="rounded-full border-2 border-ink bg-card-2 px-2.5 py-0.5 text-xs font-extrabold">
                    [{s.n}] {s.title}
                  </span>
                ),
              )}
            </div>
          )}
          {error && (
            <p className="rounded-xl border-2 border-ink bg-bad-bg p-3 text-sm font-bold">
              {error}{" "}
              {/API key|Ajustes/.test(error) && (
                <a href="/settings#ia" className="underline decoration-2">
                  Ir a Ajustes
                </a>
              )}
            </p>
          )}
        </div>

        <div className="space-y-3 border-t-[3px] border-ink p-4">
          <AnimatePresence>
            {voice !== "off" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center justify-center gap-4">
                <motion.span
                  animate={
                    reduce
                      ? {}
                      : voice === "speaking"
                        ? { scale: [1, 1.15, 1] }
                        : voice === "listening"
                          ? { scale: [1, 1.06, 1] }
                          : { rotate: 360 }
                  }
                  transition={voice === "connecting" || voice === "thinking" ? { duration: 1.2, repeat: Infinity, ease: "linear" } : { duration: 0.8, repeat: Infinity }}
                  className={`flex h-16 w-16 items-center justify-center rounded-full border-4 border-ink ${voice === "speaking" ? "bg-blue text-white" : "bg-yellow"}`}
                >
                  <GameIcon name={voice === "speaking" ? "speaker" : voice === "listening" ? "microphone" : "cycle"} size={30} />
                </motion.span>
                <span className="display text-xl">{voiceLabel[voice]}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {voice === "off" ? (
            <>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(input);
                }}
              >
                <label htmlFor="expert-input" className="sr-only">
                  Tu pregunta
                </label>
                <input
                  id="expert-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribe tu pregunta"
                  className="min-w-0 flex-1 rounded-xl border-[3px] border-ink bg-card px-3 py-2.5 font-bold outline-none focus:ring-4 focus:ring-yellow"
                />
                <button type="submit" disabled={busy || !input.trim()} className="press chunk-sm !bg-yellow px-4 font-extrabold disabled:opacity-50">
                  {busy ? "…" : "Enviar"}
                </button>
              </form>
              <button onClick={startVoice} className="press chunk flex w-full items-center justify-center gap-2 !bg-blue py-3.5 text-white">
                <GameIcon name="microphone" size={22} />
                <span className="display text-xl">Hablar con el experto</span>
              </button>
            </>
          ) : (
            <button onClick={() => void stopVoice()} className="press chunk flex w-full items-center justify-center gap-2 !bg-red py-3.5 text-white">
              <GameIcon name="exit-door" size={20} />
              <span className="display text-xl">Terminar conversación</span>
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
