"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { GameIcon, type GameIconName } from "./game/icons";

const TABS: { href: string; label: string; icon: GameIconName }[] = [
  { href: "/", label: "Jugar", icon: "play-button" },
  { href: "/progress", label: "Progreso", icon: "histogram" },
  { href: "/voice", label: "Voz", icon: "microphone" },
  { href: "/mock", label: "Simulacros", icon: "stopwatch" },
  { href: "/more", label: "Más", icon: "hamburger-menu" },
];

const MORE = ["/more", "/errors", "/labs", "/guide", "/settings", "/concepts", "/study", "/admin"];

export function Nav() {
  const path = usePathname();
  const active = (href: string) =>
    href === "/" ? path === "/" : href === "/more" ? MORE.some((p) => path.startsWith(p)) : path.startsWith(href);

  return (
    <>
      <header className="relative z-20 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="chunk-sm flex h-9 w-9 items-center justify-center !rounded-xl !bg-yellow text-ink">
              <GameIcon name="trophy-cup" size={22} />
            </span>
            <span className="display text-2xl text-white [text-shadow:0_3px_0_var(--ink)]">Learn AWS</span>
          </Link>
          <nav className="hidden items-center gap-2 sm:flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`press chunk-sm flex items-center gap-1.5 px-3 py-1.5 text-sm font-extrabold ${active(t.href) ? "!bg-yellow" : ""}`}
              >
                <GameIcon name={t.icon} size={16} />
                {t.label}
              </Link>
            ))}
            <span className="ml-1">
              <UserButton />
            </span>
          </nav>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(10px,env(safe-area-inset-bottom))] sm:hidden">
        <div className="chunk mx-auto grid max-w-md grid-cols-5 gap-1 p-1.5">
          {TABS.map((t) => {
            const on = active(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-extrabold ${on ? "bg-yellow text-ink" : "text-muted"}`}
              >
                <GameIcon name={t.icon} size={22} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
