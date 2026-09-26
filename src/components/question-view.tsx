"use client";

import { useEffect, useRef, useState } from "react";
import { AudioButton } from "./audio-button";
import { Badge, Button, Card } from "./ui";

export interface PublicQuestion {
  id: string;
  conceptId: string;
  domain: string;
  type: "single" | "multi";
  answerCount: number;
  stem: string;
  options: { id: string; text: string }[];
  es: { stem: string; options: { id: string; text: string }[] };
}

export interface Reveal {
  correctIds: string[];
  options: { id: string; correct: boolean; why: string }[];
  optionsEs: { id: string; why: string }[];
  explanation: string;
  explanationEs: string;
  keywordCues: string[];
  docs: string[];
}

type Confidence = 1 | 2 | 3;

const CONFIDENCE: { value: Confidence; label: string; hint: string }[] = [
  { value: 1, label: "Adivinando", hint: "< 50%" },
  { value: 2, label: "Bastante seguro", hint: "~70%" },
  { value: 3, label: "Seguro", hint: "> 90%" },
];

const MODE_LABEL: Record<string, { text: string; tone: "neutral" | "accent" | "warn" | "good" }> = {
  diagnostic: { text: "Diagnóstico · responde sin estudiar, está bien fallar", tone: "warn" },
  pretest: { text: "Pregunta previa · aún no viste este tema, adivina", tone: "warn" },
  learn: { text: "Práctica del concepto nuevo", tone: "accent" },
  relearn: { text: "Reaprendizaje", tone: "accent" },
  review: { text: "Repaso espaciado", tone: "good" },
  interleave: { text: "Práctica mezclada", tone: "neutral" },
};

/**
 * One question, answered in this order (the order is the method):
 * choose → declare confidence → submit → (if wrong) graded hints or explanation → (sometimes) explain why.
 */
export function QuestionView({
  question,
  mode,
  conceptTitle,
  onDone,
}: {
  question: PublicQuestion;
  mode: string;
  conceptTitle?: string;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [spanish, setSpanish] = useState(false);
  const [usedSpanish, setUsedSpanish] = useState(false);
  const [phase, setPhase] = useState<"answering" | "wrong" | "revealed">("answering");
  const [result, setResult] = useState<{ attemptId: number; correct: boolean; needsSelfExplanation: boolean } | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [firstSelected, setFirstSelected] = useState<string[]>([]);
  const [hints, setHints] = useState<{ level: number; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCorrect, setRetryCorrect] = useState<boolean | null>(null);
  const started = useRef(Date.now());

  useEffect(() => {
    started.current = Date.now();
  }, [question.id]);

  const stem = spanish ? question.es.stem : question.stem;
  const options = spanish ? question.es.options : question.options;
  const multi = question.type === "multi";

  function toggle(id: string) {
    if (phase === "revealed") return;
    if (multi) {
      setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    } else {
      setSelected([id]);
    }
  }

  function toggleSpanish() {
    setSpanish((s) => !s);
    setUsedSpanish(true);
  }

  async function post<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Error");
    return data as T;
  }

  async function submit() {
    if (!confidence || !selected.length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ attemptId: number; correct: boolean; needsSelfExplanation: boolean; reveal: Reveal | null }>(
        "/api/answer",
        { questionId: question.id, selected, confidence, timeMs: Date.now() - started.current, usedSpanish },
      );
      setResult(r);
      setFirstSelected(selected);
      if (r.correct) {
        setReveal(r.reveal);
        setPhase("revealed");
      } else {
        setPhase("wrong");
        setSelected([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function askHint() {
    if (!result) return;
    const level = (hints.length + 1) as 1 | 2 | 3;
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ hint: string }>("/api/tutor", { attemptId: result.attemptId, level });
      setHints((h) => [...h, { level, text: r.hint }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!result || !selected.length) return;
    setBusy(true);
    try {
      const r = await post<{ correct: boolean; reveal: Reveal | null }>("/api/answer", {
        questionId: question.id,
        selected,
        confidence: confidence ?? 1,
        timeMs: Date.now() - started.current,
        usedSpanish,
        retryOf: result.attemptId,
        hintLevel: Math.max(1, hints.length),
      });
      setRetryCorrect(r.correct);
      setReveal(r.reveal);
      setPhase("revealed");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function showExplanation() {
    if (!result) return;
    setBusy(true);
    try {
      const r = await post<{ reveal: Reveal }>("/api/reveal", { attemptId: result.attemptId });
      setReveal(r.reveal);
      setPhase("revealed");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = MODE_LABEL[mode];
  const correctIds = reveal?.correctIds ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {label && <Badge tone={label.tone}>{label.text}</Badge>}
        {conceptTitle && phase === "revealed" && <Badge>{conceptTitle}</Badge>}
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {multi ? `Respuesta múltiple · elige ${question.answerCount}` : "Opción única"}
          </span>
          <div className="flex gap-2">
            <AudioButton src={`question:${question.id}`} lang={spanish ? "es" : "en"} />
            <button
              type="button"
              onClick={toggleSpanish}
              className={`rounded-md border px-2.5 py-1 text-xs ${spanish ? "border-accent text-accent" : "border-border text-muted hover:text-fg"}`}
            >
              {spanish ? "Ver en inglés" : "Ver en español"}
            </button>
          </div>
        </div>
        <p className="whitespace-pre-line leading-relaxed">{stem}</p>

        <div className="mt-4 space-y-2">
          {options.map((o) => {
            const isSel = selected.includes(o.id);
            const wasFirst = firstSelected.includes(o.id);
            const isCorrect = correctIds.includes(o.id);
            let style = "border-border hover:bg-surface-2";
            if (phase === "revealed") {
              style = isCorrect ? "border-good bg-good-bg" : wasFirst || isSel ? "border-bad bg-bad-bg" : "border-border opacity-80";
            } else if (isSel) {
              style = "border-accent bg-accent/10";
            } else if (phase === "wrong" && wasFirst) {
              style = "border-border opacity-60 line-through decoration-bad/60";
            }
            const why =
              phase === "revealed"
                ? spanish
                  ? reveal?.optionsEs.find((x) => x.id === o.id)?.why
                  : reveal?.options.find((x) => x.id === o.id)?.why
                : null;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className={`flex w-full gap-3 rounded-lg border p-3 text-left text-sm transition ${style}`}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-semibold">
                  {o.id}
                </span>
                <span className="space-y-1">
                  <span className="block leading-relaxed">{o.text}</span>
                  {why && <span className="block text-xs leading-relaxed text-muted">{why}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {phase === "answering" && (
        <Card className="space-y-3">
          <div className="text-sm font-medium">¿Qué tan seguro estás?</div>
          <div className="grid grid-cols-3 gap-2">
            {CONFIDENCE.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setConfidence(c.value)}
                className={`rounded-lg border px-2 py-2 text-sm ${confidence === c.value ? "border-accent bg-accent/10" : "border-border hover:bg-surface-2"}`}
              >
                <div className="font-medium">{c.label}</div>
                <div className="text-xs text-muted">{c.hint}</div>
              </button>
            ))}
          </div>
          <Button
            className="w-full"
            disabled={busy || !confidence || selected.length !== question.answerCount}
            onClick={submit}
          >
            {busy ? "Enviando…" : "Responder"}
          </Button>
        </Card>
      )}

      {phase === "wrong" && (
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge tone="bad">Incorrecto</Badge>
            {confidence === 3 && <span className="text-xs text-bad">Error con certeza alta: estos son los que más se aprenden.</span>}
          </div>
          <p className="text-sm text-muted">
            Antes de ver la respuesta: pide una pista y vuelve a intentar, o mira la explicación directamente. El
            reintento con pista no cuenta como acierto.
          </p>
          {hints.map((h) => (
            <div key={h.level} className="rounded-lg bg-surface-2 p-3 text-sm leading-relaxed">
              <div className="mb-1 text-xs text-muted">Pista {h.level}/3</div>
              {h.text}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {hints.length < 3 && (
              <Button variant="secondary" onClick={askHint} disabled={busy}>
                {busy ? "Pensando…" : hints.length ? "Otra pista" : "Pedir pista"}
              </Button>
            )}
            {hints.length > 0 && (
              <Button onClick={retry} disabled={busy || selected.length !== question.answerCount}>
                Reintentar con la pista
              </Button>
            )}
            <Button variant="ghost" onClick={showExplanation} disabled={busy}>
              Ver explicación
            </Button>
          </div>
        </Card>
      )}

      {phase === "revealed" && reveal && (
        <Explanation
          reveal={reveal}
          spanish={spanish}
          correct={!!result?.correct}
          retryCorrect={retryCorrect}
          attemptId={result?.attemptId ?? null}
          askWhy={!!result?.needsSelfExplanation}
          questionId={question.id}
          onNext={onDone}
        />
      )}

      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}

function Explanation({
  reveal,
  spanish,
  correct,
  retryCorrect,
  attemptId,
  askWhy,
  questionId,
  onNext,
}: {
  reveal: Reveal;
  spanish: boolean;
  correct: boolean;
  retryCorrect: boolean | null;
  attemptId: number | null;
  askWhy: boolean;
  questionId: string;
  onNext: () => void;
}) {
  const [why, setWhy] = useState("");
  const [grade, setGrade] = useState<{ score: number; feedback: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showWhy, setShowWhy] = useState(askWhy);
  const [reporting, setReporting] = useState(false);
  const [report, setReport] = useState("");
  const [reported, setReported] = useState(false);

  async function sendWhy() {
    if (!attemptId) return;
    setBusy(true);
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId, text: why }),
    });
    const data = await res.json();
    setGrade(res.ok ? data : { score: 0, feedback: data.error ?? "No se pudo evaluar" });
    setBusy(false);
  }

  async function sendReport() {
    await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, note: report }),
    });
    setReported(true);
    setReporting(false);
  }

  const mustExplain = askWhy && !grade;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {correct ? (
          <Badge tone="good">Correcto</Badge>
        ) : retryCorrect != null ? (
          <Badge tone={retryCorrect ? "warn" : "bad"}>{retryCorrect ? "Correcto con pista (no cuenta)" : "Incorrecto"}</Badge>
        ) : (
          <Badge tone="bad">Incorrecto</Badge>
        )}
        {reveal.keywordCues.map((k) => (
          <Badge key={k} tone="accent">
            {k}
          </Badge>
        ))}
      </div>
      <p className="text-sm leading-relaxed">{spanish ? reveal.explanationEs : reveal.explanation}</p>
      {reveal.docs.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          {reveal.docs.map((d) => (
            <a key={d} href={d} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
              {new URL(d).pathname.split("/").filter(Boolean).slice(-2).join("/") || d}
            </a>
          ))}
        </div>
      )}

      {showWhy && attemptId && (
        <div className="space-y-2 rounded-lg bg-surface-2 p-3">
          <div className="text-sm font-medium">
            {askWhy ? "Explica con tus palabras" : "Explica tu razonamiento"}: ¿por qué es la correcta y por qué descartas las otras?
          </div>
          {!grade ? (
            <>
              <textarea
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                rows={3}
                placeholder="Ej: pide 'least operational overhead' → servicio gestionado; B requiere administrar instancias…"
                className="w-full rounded-lg border border-border bg-surface p-2 text-sm"
              />
              <Button variant="secondary" onClick={sendWhy} disabled={busy || why.trim().length < 10}>
                {busy ? "Evaluando…" : "Enviar"}
              </Button>
            </>
          ) : (
            <div className="text-sm">
              <Badge tone={grade.score === 2 ? "good" : grade.score === 1 ? "warn" : "bad"}>{grade.score}/2</Badge>{" "}
              {grade.feedback}
            </div>
          )}
        </div>
      )}

      {reporting && (
        <div className="space-y-2">
          <textarea
            value={report}
            onChange={(e) => setReport(e.target.value)}
            rows={2}
            placeholder="¿Qué está mal? (dato incorrecto, dos respuestas válidas, ambigua…)"
            className="w-full rounded-lg border border-border bg-surface p-2 text-sm"
          />
          <Button variant="secondary" onClick={sendReport} disabled={report.trim().length < 3}>
            Enviar reporte
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onNext} disabled={mustExplain}>
          Siguiente
        </Button>
        {!showWhy && (
          <Button variant="ghost" onClick={() => setShowWhy(true)}>
            Explicar con mis palabras
          </Button>
        )}
        {mustExplain && (
          <Button variant="ghost" onClick={onNext}>
            Saltar
          </Button>
        )}
        {!reported ? (
          <button onClick={() => setReporting((r) => !r)} className="ml-auto text-xs text-muted hover:text-bad">
            Esto está mal
          </button>
        ) : (
          <span className="ml-auto text-xs text-muted">Reportada · no volverá a salir</span>
        )}
      </div>
    </Card>
  );
}
