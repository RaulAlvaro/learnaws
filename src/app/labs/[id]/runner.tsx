"use client";

import { useState } from "react";
import type { Lab } from "@/lib/content/types";
import { Badge, Button, Card } from "@/components/ui";

interface Progress {
  doneSteps: string[];
  answers: Record<string, string>;
  completed: boolean;
  cleanedUp: boolean;
}

/** Guided lab: predict → do → check the prediction → clean up. */
export function LabRunner({ lab, initial }: { lab: Lab; initial: Progress }) {
  const [p, setP] = useState<Progress>(initial);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  async function save(next: Progress) {
    setP(next);
    await fetch(`/api/labs/${lab.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  }

  const toggleStep = (id: string) =>
    save({ ...p, doneSteps: p.doneSteps.includes(id) ? p.doneSteps.filter((s) => s !== id) : [...p.doneSteps, id] });
  const cleanupIds = lab.cleanup.map((c) => `cleanup:${c.id}`);
  const allCleaned = cleanupIds.every((id) => p.doneSteps.includes(id));

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <div className="text-xs text-muted">Lab {lab.order}</div>
        <h1 className="display text-2xl">{lab.titleEs}</h1>
        <p className="text-sm">{lab.objectiveEs}</p>
        <div className="flex flex-wrap gap-2">
          <Badge>{lab.minutes} min</Badge>
          <Badge tone={lab.costWarning ? "warn" : "good"}>{lab.estimatedCostUsd}</Badge>
        </div>
        {lab.costWarning && <p className="rounded-lg bg-warn-bg p-2.5 text-sm text-warn">{lab.costWarning}</p>}
      </Card>

      <Card className="space-y-3">
        <h2 className="display text-xl">Predicciones</h2>
        <p className="text-xs text-muted">Escribe tu predicción antes del paso correspondiente; después compárala.</p>
        {lab.checkQuestions.map((q) => (
          <div key={q.id} className="space-y-2 rounded-lg bg-surface-2 p-3">
            <p className="text-sm font-medium">{q.questionEs}</p>
            <textarea
              defaultValue={p.answers[q.id] ?? ""}
              onBlur={(e) => save({ ...p, answers: { ...p.answers, [q.id]: e.target.value } })}
              rows={2}
              className="w-full rounded-lg border border-border bg-surface p-2 text-sm"
              placeholder="Mi predicción…"
            />
            {revealed.has(q.id) ? (
              <p className="text-sm text-good">{q.answerEs}</p>
            ) : (
              <button
                className="text-xs text-accent"
                onClick={() => setRevealed((s) => new Set(s).add(q.id))}
                disabled={!p.answers[q.id]}
              >
                {p.answers[q.id] ? "Comparar con la respuesta" : "Escribe tu predicción para compararla"}
              </button>
            )}
          </div>
        ))}
      </Card>

      <Card className="space-y-2">
        <h2 className="display text-xl">Pasos</h2>
        {lab.steps.map((s, i) => (
          <label key={s.id} className="flex cursor-pointer gap-3 rounded-lg p-2 hover:bg-surface-2">
            <input type="checkbox" checked={p.doneSteps.includes(s.id)} onChange={() => toggleStep(s.id)} className="mt-1" />
            <span className="text-sm">
              <b>{i + 1}.</b> {s.textEs}
              {s.detailEs && <span className="mt-0.5 block text-xs text-muted">{s.detailEs}</span>}
            </span>
          </label>
        ))}
        <Button variant="secondary" onClick={() => save({ ...p, completed: true })} disabled={p.completed}>
          {p.completed ? "Lab completado" : "Marcar lab como completado"}
        </Button>
      </Card>

      <Card className="space-y-2 border-bad/40">
        <h2 className="display text-xl text-bad">Limpieza (obligatoria)</h2>
        {lab.cleanup.map((c) => (
          <label key={c.id} className="flex cursor-pointer gap-3 rounded-lg p-2 hover:bg-surface-2">
            <input
              type="checkbox"
              checked={p.doneSteps.includes(`cleanup:${c.id}`)}
              onChange={() => toggleStep(`cleanup:${c.id}`)}
              className="mt-1"
            />
            <span className="text-sm">{c.textEs}</span>
          </label>
        ))}
        <Button onClick={() => save({ ...p, cleanedUp: true })} disabled={!allCleaned || p.cleanedUp}>
          {p.cleanedUp ? "Todo limpio" : "Confirmar limpieza"}
        </Button>
      </Card>

      <Card className="space-y-2">
        <h2 className="display text-xl">Para el examen</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {lab.examTakeawaysEs.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3 pt-1 text-xs">
          {lab.docs.map((d) => (
            <a key={d} href={d} target="_blank" rel="noreferrer" className="text-accent underline">
              Docs
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
