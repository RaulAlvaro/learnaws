import type { ReactNode } from "react";
import { GameIcon, type GameIconName } from "./game/icons";

const PERKS: { icon: GameIconName; text: string }[] = [
  { icon: "play-button", text: "Rondas de 8 preguntas, unos 4 minutos" },
  { icon: "treasure-map", text: "Descubre cada servicio con voz y diagramas" },
  { icon: "trophy-cup", text: "Te dice cuándo estás listo para reservar" },
];

/** Game-style title screen around Clerk's sign-in / sign-up card. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-4xl items-center gap-8 py-4 md:grid-cols-[1fr_auto]">
      <div className="space-y-5 text-center md:text-left">
        <span className="chunk-sm mx-auto flex h-16 w-16 items-center justify-center !rounded-2xl !bg-yellow md:mx-0">
          <GameIcon name="trophy-cup" size={38} />
        </span>
        <h1 className="display text-5xl leading-[1.05] text-white [text-shadow:0_4px_0_var(--ink)]">
          Aprueba AWS
          <br />
          jugando
        </h1>
        <p className="mx-auto max-w-[32ch] text-lg font-extrabold text-white/90 md:mx-0">
          Preparación para Solutions Architect Associate, una ronda a la vez.
        </p>
        <ul className="mx-auto grid max-w-sm gap-2.5 md:mx-0">
          {PERKS.map((p) => (
            <li key={p.text} className="chunk-sm flex items-center gap-3 p-3 text-left font-extrabold">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-yellow">
                <GameIcon name={p.icon} size={20} />
              </span>
              {p.text}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-center">{children}</div>
    </div>
  );
}
