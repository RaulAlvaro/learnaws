import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Arcade primitives: white cards and buttons with a thick ink outline and a solid "volume" shadow. */

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "chunk-sm !bg-yellow text-ink",
    secondary: "chunk-sm text-ink",
    ghost: "text-ink underline underline-offset-4 decoration-2",
  }[variant];
  return (
    <button
      className={`press inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`chunk p-4 text-ink sm:p-5 ${className}`}>{children}</section>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "bad" | "warn" | "accent" }) {
  const styles = {
    neutral: "bg-card-2",
    good: "bg-good-bg",
    bad: "bg-bad-bg",
    warn: "bg-warn-bg",
    accent: "bg-yellow",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-extrabold text-ink ${styles}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="chunk-sm p-3">
      <div className="text-xs font-extrabold uppercase tracking-wide text-muted">{label}</div>
      <div className="display mt-1 text-2xl tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Bar({ value, className = "bg-yellow" }: { value: number; className?: string }) {
  return (
    <div className="h-3.5 w-full overflow-hidden rounded-full border-2 border-ink bg-card-2">
      <div className={`h-full ${className}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export const DOMAIN_ES: Record<string, string> = {
  d1: "Arquitecturas seguras",
  d2: "Arquitecturas resilientes",
  d3: "Alto rendimiento",
  d4: "Optimización de costos",
};
