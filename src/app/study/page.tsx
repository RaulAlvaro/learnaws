"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ConceptCard, type CardBody } from "@/components/concept-card";
import { QuestionView, type PublicQuestion } from "@/components/question-view";
import { Bar, Button, Card } from "@/components/ui";

interface Progress {
  index: number;
  total: number;
  kind: "diagnostic" | "normal" | "reviews-only";
}
interface ConceptMeta {
  id: string;
  title: string;
  titleEs: string;
}
type Item =
  | { kind: "card"; reason: "new" | "relearn"; concept: ConceptMeta; card: { en: CardBody; es: CardBody; docs: string[] } | null; progress: Progress }
  | { kind: "question"; mode: string; question: PublicQuestion; concept: ConceptMeta | undefined; progress: Progress }
  | { kind: "done"; progress: Progress };

async function fetchSession() {
  const res = await fetch("/api/session", { cache: "no-store" });
  return { ok: res.ok, data: await res.json() };
}

export default function StudyPage() {
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((r: { ok: boolean; data: Item & { error?: string } }) => {
    if (!r.ok) setError(r.data.error ?? "Error");
    else {
      setError(null);
      setItem(r.data);
    }
    window.scrollTo({ top: 0 });
  }, []);
  const load = useCallback(() => fetchSession().then(apply), [apply]);

  useEffect(() => {
    fetchSession().then(apply);
  }, [apply]);

  async function next() {
    setBusy(true);
    await fetch("/api/session/advance", { method: "POST" });
    await load();
    setBusy(false);
  }

  async function extend(minutes: number) {
    setBusy(true);
    await fetch("/api/session/extend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes }),
    });
    await load();
    setBusy(false);
  }

  if (error) return <Card className="text-bad">{error}</Card>;
  if (!item) return <p className="text-muted">Preparando tu sesión…</p>;

  const p = item.progress;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {p.kind === "diagnostic" ? "Diagnóstico inicial" : p.kind === "reviews-only" ? "Solo repasos (hay muchos pendientes)" : "Sesión de hoy"}
          </span>
          <span className="tabular-nums">
            {Math.min(p.index + 1, p.total)} / {p.total}
          </span>
        </div>
        <Bar value={p.total ? (p.index / p.total) * 100 : 100} />
      </div>

      {item.kind === "card" &&
        (item.card ? (
          <>
            <ConceptCard
              conceptId={item.concept.id}
              title={item.concept.title}
              titleEs={item.concept.titleEs}
              card={item.card}
              reason={item.reason}
            />
            <Button className="w-full" onClick={next} disabled={busy}>
              Entendido, a practicar
            </Button>
          </>
        ) : (
          <Card>
            Falta la ficha de este concepto. <Button onClick={next}>Continuar</Button>
          </Card>
        ))}

      {item.kind === "question" && (
        <QuestionView
          key={item.question.id + p.index}
          question={item.question}
          mode={item.mode}
          conceptTitle={item.concept?.titleEs}
          onDone={next}
        />
      )}

      {item.kind === "done" && (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">{p.kind === "diagnostic" ? "Diagnóstico terminado" : "Sesión de hoy completa"}</h2>
          <p className="text-sm text-muted">
            {p.kind === "diagnostic"
              ? "Ya sé por dónde empezar. Desde mañana la sesión combina repasos, conceptos nuevos y práctica mezclada."
              : "Lo que viste hoy vuelve cuando estés a punto de olvidarlo. Parar ahora es parte del método: el espaciado rinde más que estudiar de corrido."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/">
              <Button variant="secondary">Ver progreso</Button>
            </Link>
            <Link href="/voice">
              <Button variant="secondary">Repaso por voz</Button>
            </Link>
            <Button variant="ghost" onClick={() => extend(15)} disabled={busy}>
              Tengo 15 min más
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
