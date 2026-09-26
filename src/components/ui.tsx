import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "bg-accent text-accent-fg hover:opacity-90",
    secondary: "border border-border bg-surface hover:bg-surface-2",
    ghost: "text-muted hover:text-fg hover:bg-surface-2",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-border bg-surface p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "bad" | "warn" | "accent" }) {
  const styles = {
    neutral: "bg-surface-2 text-muted",
    good: "bg-good-bg text-good",
    bad: "bg-bad-bg text-bad",
    warn: "bg-warn-bg text-warn",
    accent: "bg-accent/15 text-accent",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Bar({ value, className = "bg-accent" }: { value: number; className?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export const DOMAIN_ES: Record<string, string> = {
  d1: "Arquitecturas seguras",
  d2: "Arquitecturas resilientes",
  d3: "Alto rendimiento",
  d4: "Optimización de costos",
};
