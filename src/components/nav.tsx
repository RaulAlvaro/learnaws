"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

const TABS = [
  { href: "/", label: "Jugar", icon: "M7 5l12 7-12 7V5z" },
  { href: "/progress", label: "Progreso", icon: "M4 19V9M10 19V5M16 19v-7M22 19H2" },
  { href: "/voice", label: "Voz", icon: "M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3" },
  { href: "/mock", label: "Simulacros", icon: "M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z" },
  { href: "/more", label: "Más", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

const MORE = ["/more", "/errors", "/labs", "/guide", "/settings", "/concepts", "/study", "/admin"];

export function Nav() {
  const path = usePathname();
  const active = (href: string) =>
    href === "/" ? path === "/" : href === "/more" ? MORE.some((p) => path.startsWith(p)) : path.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
            Learn AWS <span className="font-normal text-muted">SAA-C03</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 text-sm ${active(t.href) ? "bg-surface-2 font-medium" : "text-muted hover:text-fg"}`}
              >
                {t.label}
              </Link>
            ))}
            <span className="ml-2">
              <UserButton />
            </span>
          </nav>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-1 py-2 text-[11px] ${active(t.href) ? "text-accent" : "text-muted"}`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={t.icon} />
              </svg>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
