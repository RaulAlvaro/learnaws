"use client";

import { useState } from "react";
import { AudioButton } from "./audio-button";
import { Badge, Card } from "./ui";

export interface CardBody {
  tldr: string;
  whenToUse: string[];
  keyFacts: string[];
  gotchas: string[];
  confusedWith: { concept: string; difference: string }[];
  examCues: string[];
}

export function ConceptCard({
  conceptId,
  title,
  titleEs,
  card,
  reason,
}: {
  conceptId: string;
  title: string;
  titleEs: string;
  card: { en: CardBody; es: CardBody; docs: string[] };
  reason?: "new" | "relearn";
}) {
  const [lang, setLang] = useState<"en" | "es">("es");
  const body = card[lang];
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {reason && (
            <div className="mb-1">
              <Badge tone={reason === "new" ? "accent" : "warn"}>{reason === "new" ? "Ficha nueva" : "Repasa la ficha"}</Badge>
            </div>
          )}
          <h2 className="text-lg font-semibold">{lang === "es" ? titleEs : title}</h2>
        </div>
        <div className="flex gap-2">
          <AudioButton key={`${conceptId}-${lang}`} src={`card:${conceptId}`} lang={lang} />
          <button
            onClick={() => setLang((l) => (l === "en" ? "es" : "en"))}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:text-fg"
          >
            {lang === "es" ? "English" : "Español"}
          </button>
        </div>
      </div>
      <p className="leading-relaxed">{body.tldr}</p>
      <Section title={lang === "es" ? "Cuándo usarlo" : "When to use"} items={body.whenToUse} />
      <Section title={lang === "es" ? "Datos clave" : "Key facts"} items={body.keyFacts} />
      <Section title={lang === "es" ? "Trampas" : "Gotchas"} items={body.gotchas} tone="warn" />
      {body.confusedWith.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">{lang === "es" ? "Se confunde con" : "Confused with"}</h3>
          <ul className="space-y-1.5 text-sm">
            {body.confusedWith.map((c) => (
              <li key={c.concept} className="rounded-lg bg-surface-2 p-2.5">
                <span className="font-medium">{c.concept}:</span> {c.difference}
              </li>
            ))}
          </ul>
        </div>
      )}
      {body.examCues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {body.examCues.map((c) => (
            <Badge key={c} tone="accent">
              {c}
            </Badge>
          ))}
        </div>
      )}
      {card.docs.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          {card.docs.map((d) => (
            <a key={d} href={d} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
              Docs AWS ↗
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

function Section({ title, items, tone }: { title: string; items: string[]; tone?: "warn" }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className={`mb-1.5 text-sm font-semibold ${tone === "warn" ? "text-warn" : ""}`}>{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
