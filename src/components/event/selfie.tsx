"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { GameIcon } from "@/components/game/icons";
import { MASCOT_POSES, mascotDataUrl, type MascotPose } from "@/lib/game/mascot";
import { play } from "@/lib/game/sfx";

const W = 720;
const H = 960;
// Where Nubi sits on the card (also used for the live preview, as percentages).
const MASCOT = { w: 400, h: 343, x: W - 400 + 18, y: H - 343 - 6 };

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draws the selfie card: mirrored photo, Nubi, event pill, name and score. */
async function compose(source: CanvasImageSource, sw: number, sh: number, pose: MascotPose, label: { event: string; name: string; score: string }) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const display = getComputedStyle(document.querySelector(".display") ?? document.body).fontFamily;
  await document.fonts.ready;

  // photo, cover-cropped and mirrored like the preview
  const scale = Math.max(W / sw, H / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh);
  ctx.restore();

  const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
  g.addColorStop(0, "rgba(28,24,64,0)");
  g.addColorStop(1, "rgba(28,24,64,0.75)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.drawImage(await loadImage(mascotDataUrl(pose)), MASCOT.x, MASCOT.y, MASCOT.w, MASCOT.h);

  // event pill
  ctx.font = `36px ${display}`;
  const pw = ctx.measureText(label.event).width + 48;
  roundRect(ctx, 30, 30, pw, 64, 32);
  ctx.fillStyle = "#1c1840";
  ctx.save();
  ctx.translate(0, 6);
  ctx.fill();
  ctx.restore();
  roundRect(ctx, 30, 30, pw, 64, 32);
  ctx.fillStyle = "#ffc933";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#1c1840";
  ctx.stroke();
  ctx.fillStyle = "#1c1840";
  ctx.textBaseline = "middle";
  ctx.fillText(label.event, 54, 64);

  // name + score
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  for (const [text, size, y] of [
    [label.name, 64, H - 92],
    [label.score, 36, H - 40],
  ] as const) {
    ctx.font = `${size}px ${display}`;
    ctx.lineWidth = size / 5;
    ctx.strokeStyle = "#1c1840";
    ctx.strokeText(text, 36, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, 36, y);
  }

  // frame
  roundRect(ctx, 5, 5, W - 10, H - 10, 36);
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#1c1840";
  ctx.stroke();
  return c.toDataURL("image/jpeg", 0.85);
}

export function Selfie({
  slug,
  label,
  onSaved,
  onCancel,
}: {
  slug: string;
  label: { event: string; name: string; score: string };
  onSaved: () => void;
  onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [pose, setPose] = useState<MascotPose>("wave");
  const [camError, setCamError] = useState<string | null>(() =>
    typeof navigator !== "undefined" && !navigator.mediaDevices ? "Tu navegador no permite usar la cámara aquí. Puedes subir una foto." : null,
  );
  const [count, setCount] = useState<number | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setCamError("No pudimos abrir la cámara. Puedes subir una foto."));
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    for (const n of [3, 2, 1]) {
      setCount(n);
      play("tap");
      await new Promise((r) => setTimeout(r, 800));
    }
    setCount(null);
    play("start");
    setShot(await compose(v, v.videoWidth, v.videoHeight, pose, label));
  }

  async function fromFile(file: File) {
    const img = await loadImage(URL.createObjectURL(file));
    setShot(await compose(img, img.naturalWidth, img.naturalHeight, pose, label));
  }

  async function save() {
    if (!shot) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${slug}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: shot, consent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      stream.current?.getTracks().forEach((t) => t.stop());
      play("round");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center text-white">
        <h2 className="display text-3xl [text-shadow:0_3px_0_var(--ink)]">Selfie con Nubi</h2>
        <p className="font-extrabold text-white/90">Elige la pose de Nubi, imítala y sonríe.</p>
      </div>

      {!shot && (
        <div className="grid grid-cols-3 gap-2.5">
          {MASCOT_POSES.map((p) => (
            <button
              key={p.pose}
              onClick={() => setPose(p.pose)}
              aria-pressed={pose === p.pose}
              className={`press chunk-sm flex flex-col items-center p-1.5 font-extrabold ${pose === p.pose ? "!bg-yellow" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mascotDataUrl(p.pose)} alt="" className="h-16 w-auto" />
              <span className="text-xs">{p.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="chunk relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden !p-0">
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot} alt="Tu selfie con Nubi" className="h-full w-full object-cover" />
        ) : camError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-card-2 p-6 text-center">
            <GameIcon name="sound-off" size={36} />
            <p className="text-sm font-bold">{camError}</p>
          </div>
        ) : (
          <>
            <video
              ref={(el) => {
                // re-attach the stream when the preview remounts (after "Repetir")
                video.current = el;
                if (el && stream.current && el.srcObject !== stream.current) el.srcObject = stream.current;
              }}
              autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mascotDataUrl(pose)}
              alt=""
              className="pointer-events-none absolute"
              style={{ left: `${(MASCOT.x / W) * 100}%`, top: `${(MASCOT.y / H) * 100}%`, width: `${(MASCOT.w / W) * 100}%` }}
            />
            <span className="display absolute left-3 top-3 rounded-full border-[3px] border-ink bg-yellow px-3 py-0.5 text-sm">
              {label.event}
            </span>
            <AnimatePresence>
              {count !== null && (
                <motion.span
                  key={count}
                  initial={{ scale: 2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="display absolute inset-0 flex items-center justify-center text-[9rem] text-white [text-shadow:0_8px_0_var(--ink)]"
                >
                  {count}
                </motion.span>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {!shot ? (
        <div className="grid gap-2.5">
          {!camError && (
            <button onClick={capture} disabled={count !== null} className="press chunk display flex items-center justify-center gap-2 !bg-yellow py-3.5 text-2xl">
              <GameIcon name="focused-lightning" size={26} /> Tomar foto
            </button>
          )}
          <label className="press chunk-sm flex cursor-pointer items-center justify-center gap-2 py-2.5 font-extrabold">
            <GameIcon name="files" size={18} /> Subir una foto
            <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => e.target.files?.[0] && fromFile(e.target.files[0])} />
          </label>
          <button onClick={onCancel} className="text-sm font-extrabold text-white/85 underline">
            Ahora no
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="chunk-sm flex items-start gap-3 p-3 text-sm font-bold">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#2536b8]" />
            Acepto que esta foto se muestre en el ranking del evento, visible para quienes usan la app. Puedo quitarla cuando quiera.
          </label>
          {error && <p className="chunk-sm bg-bad-bg p-3 text-sm font-bold">{error}</p>}
          <button onClick={save} disabled={!consent || busy} className="press chunk display w-full !bg-yellow py-3.5 text-2xl disabled:opacity-50">
            {busy ? "Guardando..." : "Usar en el ranking"}
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={() => setShot(null)} className="press chunk-sm py-2.5 font-extrabold">
              Repetir
            </button>
            <a href={shot} download="selfie-nubi-aws-community-day.jpg" className="press chunk-sm py-2.5 text-center font-extrabold">
              Descargar
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
