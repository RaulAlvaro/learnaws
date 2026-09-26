"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicQuestion, Reveal } from "@/components/question-view";
import { Badge, Button, Card, DOMAIN_ES } from "@/components/ui";

interface MockRow {
  id: number;
  kind: "mini" | "full";
  durationMin: number;
  startedAt: string;
  finishedAt: string | null;
  scorePct: number | null;
  perDomain: Record<string, { correct: number; total: number }> | null;
}
interface ReviewRow {
  questionId: string;
  reveal: Reveal;
  attempt: { selected: string[]; correct: boolean; confidence: number } | null;
}
interface Answer {
  selected: string[];
  confidence: 1 | 2 | 3;
  usedSpanish: boolean;
  flagged?: boolean;
}

export default function MockRunner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<{ mock: MockRow; questions: PublicQuestion[]; review?: ReviewRow[] } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/mock/${id}`, { cache: "no-store" })
      .then((res) => res.json())
      .then(setData);
  }, [id]);
  useEffect(load, [load]);

  if (!data) return <p className="text-muted">Cargando…</p>;
  if (data.mock.finishedAt && data.review) return <MockReview mock={data.mock} questions={data.questions} review={data.review} />;
  return <MockTaking mock={data.mock} questions={data.questions} onFinished={load} />;
}

function MockTaking({ mock, questions, onFinished }: { mock: MockRow; questions: PublicQuestion[]; onFinished: () => void }) {
  const storageKey = `mock-${mock.id}`;
  // Survives a reload mid-mock. This component only mounts on the client (after the fetch).
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    } catch {
      return {};
    }
  });
  const [i, setI] = useState(0);
  const [spanish, setSpanish] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(answers));
    } catch {}
  }, [answers, storageKey]);

  const endsAt = new Date(mock.startedAt).getTime() + mock.durationMin * 60_000;
  const left = Math.max(0, endsAt - now);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    const clean = Object.fromEntries(
      Object.entries(answers).map(([k, a]) => [k, { selected: a.selected, confidence: a.confidence, usedSpanish: a.usedSpanish }]),
    );
    await fetch(`/api/mock/${mock.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: clean, elapsedMs: Math.min(Date.now() - new Date(mock.startedAt).getTime(), mock.durationMin * 60_000) }),
    });
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    onFinished();
  }, [answers, mock, onFinished, storageKey]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left === 0) submit();
  }, [left, submit]);

  const q = questions[i];
  const a = answers[q.id] ?? { selected: [], confidence: 2 as const, usedSpanish: false };
  const set = (patch: Partial<Answer>) => setAnswers((s) => ({ ...s, [q.id]: { ...a, ...patch } }));
  const answered = useMemo(() => questions.filter((x) => answers[x.id]?.selected.length).length, [answers, questions]);
  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);
  const opts = spanish ? q.es.options : q.options;

  function pick(id: string) {
    const selected = q.type === "multi" ? (a.selected.includes(id) ? a.selected.filter((x) => x !== id) : [...a.selected, id]) : [id];
    set({ selected });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">
          Pregunta {i + 1}/{questions.length} · {answered} respondidas
        </span>
        <span className={`font-mono tabular-nums ${left < 10 * 60_000 ? "text-bad" : ""}`}>
          {mm}:{ss.toString().padStart(2, "0")}
        </span>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">{q.type === "multi" ? `Elige ${q.answerCount}` : "Opción única"}</span>
          <div className="flex gap-2">
            <button
              onClick={() => set({ flagged: !a.flagged })}
              className={`rounded-md border px-2.5 py-1 text-xs ${a.flagged ? "border-warn text-warn" : "border-border text-muted"}`}
            >
              {a.flagged ? "Marcada" : "Marcar para revisar"}
            </button>
            <button
              onClick={() => {
                setSpanish((s) => !s);
                set({ usedSpanish: true });
              }}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted"
            >
              {spanish ? "EN" : "ES"}
            </button>
          </div>
        </div>
        <p className="whitespace-pre-line leading-relaxed">{spanish ? q.es.stem : q.stem}</p>
        <div className="space-y-2">
          {opts.map((o) => (
            <button
              key={o.id}
              onClick={() => pick(o.id)}
              className={`flex w-full gap-3 rounded-lg border p-3 text-left text-sm ${a.selected.includes(o.id) ? "border-accent bg-accent/10" : "border-border hover:bg-surface-2"}`}
            >
              <span className="font-semibold">{o.id}</span>
              <span>{o.text}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          Confianza:
          {([1, 2, 3] as const).map((c) => (
            <button
              key={c}
              onClick={() => set({ confidence: c })}
              className={`rounded-md border px-2 py-1 ${a.confidence === c ? "border-accent text-fg" : "border-border"}`}
            >
              {["Adivino", "Bastante", "Seguro"][c - 1]}
            </button>
          ))}
        </div>
      </Card>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>
          Anterior
        </Button>
        {i < questions.length - 1 ? (
          <Button className="flex-1" onClick={() => setI((x) => x + 1)}>
            Siguiente
          </Button>
        ) : (
          <Button className="flex-1" onClick={submit} disabled={busy}>
            Terminar y corregir
          </Button>
        )}
      </div>

      <Card>
        <div className="grid grid-cols-10 gap-1.5">
          {questions.map((x, k) => {
            const ans = answers[x.id];
            return (
              <button
                key={x.id}
                onClick={() => setI(k)}
                className={`h-7 rounded text-xs tabular-nums ${k === i ? "ring-2 ring-accent" : ""} ${
                  ans?.flagged ? "bg-warn-bg text-warn" : ans?.selected.length ? "bg-surface-2" : "border border-border text-muted"
                }`}
              >
                {k + 1}
              </button>
            );
          })}
        </div>
        <Button variant="ghost" className="mt-3 w-full" onClick={submit} disabled={busy}>
          Entregar ahora ({questions.length - answered} sin responder)
        </Button>
      </Card>
    </div>
  );
}

function MockReview({ mock, questions, review }: { mock: MockRow; questions: PublicQuestion[]; review: ReviewRow[] }) {
  const [onlyWrong, setOnlyWrong] = useState(true);
  const rows = questions
    .map((q) => ({ q, r: review.find((x) => x.questionId === q.id)! }))
    .filter(({ r }) => !onlyWrong || !r.attempt?.correct);
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold">Resultado</h1>
          <span className="text-3xl font-semibold tabular-nums">{(mock.scorePct ?? 0).toFixed(0)}%</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {Object.entries(mock.perDomain ?? {}).map(([d, v]) => {
            const p = v.total ? (v.correct / v.total) * 100 : 0;
            return (
              <div key={d} className="rounded-lg bg-surface-2 p-2">
                <div className="text-xs text-muted">{DOMAIN_ES[d]}</div>
                <div className={`font-semibold tabular-nums ${p < 70 ? "text-bad" : ""}`}>
                  {v.correct}/{v.total} · {p.toFixed(0)}%
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          Los errores ya están en tu registro de errores y sus conceptos se priorizan en los próximos repasos.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyWrong} onChange={(e) => setOnlyWrong(e.target.checked)} /> Solo errores
        </label>
      </Card>
      {rows.map(({ q, r }) => (
        <Card key={q.id} className="space-y-3">
          <div className="flex gap-2">
            <Badge tone={r.attempt?.correct ? "good" : "bad"}>{r.attempt?.correct ? "Correcta" : "Incorrecta"}</Badge>
            {r.attempt?.confidence === 3 && !r.attempt.correct && <Badge tone="warn">Certeza alta</Badge>}
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed">{q.stem}</p>
          <div className="space-y-1.5">
            {q.options.map((o) => {
              const correct = r.reveal.correctIds.includes(o.id);
              const chosen = r.attempt?.selected.includes(o.id);
              return (
                <div
                  key={o.id}
                  className={`rounded-lg border p-2.5 text-sm ${correct ? "border-good bg-good-bg" : chosen ? "border-bad bg-bad-bg" : "border-border"}`}
                >
                  <b>{o.id}.</b> {o.text}
                  <div className="mt-1 text-xs text-muted">{r.reveal.options.find((x) => x.id === o.id)?.why}</div>
                </div>
              );
            })}
          </div>
          <p className="text-sm">{r.reveal.explanation}</p>
        </Card>
      ))}
      <Link href="/mock">
        <Button variant="secondary">Volver</Button>
      </Link>
    </div>
  );
}
