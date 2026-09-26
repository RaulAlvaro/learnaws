import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Card } from "@/components/ui";

const LINKS = [
  { href: "/errors", title: "Registro de errores", desc: "Tus fallos clasificados por tipo, con la explicación." },
  { href: "/concepts", title: "Conceptos", desc: "Los 259 conceptos del examen y en qué fase está cada uno." },
  { href: "/labs", title: "Labs", desc: "Prácticas guiadas en tu cuenta de AWS, con limpieza y costos." },
  { href: "/guide", title: "Método y estrategia", desc: "Cómo funciona el método, el plan y la estrategia de examen." },
  { href: "/settings", title: "Ajustes", desc: "Fecha meta, recordatorio diario, notificaciones y gasto de IA." },
];

export default function MorePage() {
  return (
    <div className="space-y-3">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="block">
          <Card className="hover:bg-surface-2">
            <div className="font-medium">{l.title}</div>
            <div className="text-sm text-muted">{l.desc}</div>
          </Card>
        </Link>
      ))}
      <div className="flex justify-center pt-2 sm:hidden">
        <UserButton />
      </div>
    </div>
  );
}
