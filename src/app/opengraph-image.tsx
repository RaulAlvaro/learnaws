import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { GameIcon, type GameIconName } from "@/components/game/icons";

/** Share card in the Arcade style: pitch on the left, a Kahoot-style question on the right. Prerendered at build. */
export const alt = "Learn AWS: aprueba AWS Solutions Architect Associate (SAA-C03) jugando rondas cortas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1c1840";
const FIELD = "#3346d6";
const YELLOW = "#ffc933";

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));

// Same colour + shape pairs as the game's answer tiles (satori has no clip-path, so shapes are SVG).
const OPTIONS: { label: string; fill: string; shape: string; correct?: boolean }[] = [
  { label: "SQS", fill: "#1f9d60", shape: "M8 8h32v32H8z", correct: true },
  { label: "SNS", fill: "#3d8bff", shape: "M24 2l22 22-22 22L2 24z" },
  { label: "Kinesis", fill: "#f2545b", shape: "M24 4l22 38H2z" },
  { label: "EventBridge", fill: "#e69a00", shape: "M24 2a22 22 0 1 0 0.01 0z" },
];

function Chip({ icon, color, text }: { icon: GameIconName; color: string; text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#fff",
        border: `4px solid ${INK}`,
        borderRadius: 20,
        boxShadow: `0 6px 0 ${INK}`,
        padding: "10px 20px 10px 14px",
        fontSize: 28,
        color: INK,
      }}
    >
      <GameIcon name={icon} size={36} fill={color} />
      {text}
    </div>
  );
}

export default async function OpengraphImage() {
  const [lilita, nunito] = await Promise.all([font("LilitaOne-Regular.ttf"), font("Nunito-Black.ttf")]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 80px 0 64px",
          gap: 40,
          background: FIELD,
          backgroundImage: "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.16) 2px, transparent 0)",
          backgroundSize: "28px 28px",
          fontFamily: "Nunito",
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 600 }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              background: YELLOW,
              color: INK,
              border: `4px solid ${INK}`,
              borderRadius: 999,
              padding: "6px 22px",
              fontSize: 26,
              letterSpacing: 1,
            }}
          >
            AWS SAA-C03
          </div>
          <div style={{ fontFamily: "Lilita One", fontSize: 112, lineHeight: 1, marginTop: 26, whiteSpace: "nowrap", textShadow: `0 8px 0 ${INK}` }}>
            Learn AWS
          </div>
          <div style={{ fontSize: 36, lineHeight: 1.2, marginTop: 28, display: "flex", flexDirection: "column" }}>
            <span>Aprueba Solutions Architect</span>
            <span>jugando rondas de 4 minutos</span>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 36 }}>
            <Chip icon="flame" color="#f2545b" text="Racha" />
            <Chip icon="star-medal" color="#e69a00" text="Niveles" />
            <Chip icon="microphone" color={FIELD} text="Voz" />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 456,
            background: "#fff",
            color: INK,
            border: `6px solid ${INK}`,
            borderRadius: 32,
            boxShadow: `0 14px 0 ${INK}`,
            padding: 28,
            transform: "rotate(2.5deg)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 24, color: "#5e5a86" }}>
            <span>Pregunta 3 de 8</span>
            <span
              style={{ background: YELLOW, color: INK, border: `3px solid ${INK}`, borderRadius: 999, padding: "2px 14px", fontSize: 24 }}
            >
              +15 XP
            </span>
          </div>
          <div style={{ fontFamily: "Lilita One", fontSize: 42, lineHeight: 1.1, margin: "16px 0 22px" }}>
            ¿Qué servicio desacopla con una cola?
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {OPTIONS.map((o) => (
              <div
                key={o.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: 186,
                  height: 86,
                  padding: "0 12px",
                  background: o.fill,
                  color: "#fff",
                  border: `4px solid ${INK}`,
                  borderRadius: 18,
                  boxShadow: `0 6px 0 ${INK}`,
                  fontSize: o.label.length > 8 ? 21 : 32,
                  opacity: o.correct ? 1 : 0.7,
                }}
              >
                <svg width={30} height={30} viewBox="0 0 48 48">
                  <path d={o.shape} fill="#fff" />
                </svg>
                <span style={{ flex: 1 }}>{o.label}</span>
                {o.correct && <GameIcon name="check-mark" size={34} fill="#fff" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Lilita One", data: lilita, weight: 400, style: "normal" },
        { name: "Nunito", data: nunito, weight: 900, style: "normal" },
      ],
    },
  );
}
