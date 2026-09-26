import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { isAdmin, requireUser } from "@/lib/auth";
import { GameIcon, type GameIconName } from "@/components/game/icons";

const LINKS: { href: string; title: string; desc: string; icon: GameIconName; tint: string }[] = [
  { href: "/study", title: "Modo clásico", desc: "La sesión en formato texto, con fichas y preguntas largas.", icon: "open-book", tint: "bg-blue text-white" },
  { href: "/errors", title: "Registro de errores", desc: "Tus fallos por tipo, con la explicación.", icon: "cross-mark", tint: "bg-red text-white" },
  { href: "/concepts", title: "Conceptos", desc: "Los 259 conceptos del examen y su fase.", icon: "files", tint: "bg-green text-white" },
  { href: "/labs", title: "Labs", desc: "Prácticas guiadas en tu cuenta de AWS.", icon: "cog", tint: "bg-amber text-white" },
  { href: "/guide", title: "Método y estrategia", desc: "Cómo funciona el método y cómo rendir el examen.", icon: "treasure-map", tint: "bg-yellow text-ink" },
  { href: "/settings", title: "Ajustes", desc: "Fecha meta, recordatorio, notificaciones e IA.", icon: "settings-knobs", tint: "bg-card-2 text-ink" },
];

export default async function MorePage() {
  const admin = isAdmin(await requireUser());
  const links = admin
    ? [...LINKS, { href: "/admin", title: "Administración", desc: "Usuarios, progreso, feedback y reportes.", icon: "podium-winner" as const, tint: "bg-ink text-yellow" }]
    : LINKS;
  return (
    <div className="grid gap-3">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="press chunk flex items-center gap-4 p-4">
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-[3px] border-ink ${l.tint}`}>
            <GameIcon name={l.icon} size={30} />
          </span>
          <span>
            <span className="display block text-xl leading-tight">{l.title}</span>
            <span className="block text-sm font-bold text-muted">{l.desc}</span>
          </span>
        </Link>
      ))}
      <p className="pt-1 text-center text-xs font-bold text-white/80">
        Iconos de game-icons.net (CC BY 3.0). Créditos completos en el repositorio.
      </p>
      <div className="flex justify-center pt-1 sm:hidden">
        <UserButton />
      </div>
    </div>
  );
}
