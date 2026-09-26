import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { assertBudget, MODELS, openai, recordUsage } from "./client";
import type { ConceptContent, Question, RecallPrompt } from "../content/types";

/**
 * Guardrails (Kestin et al. 2025; Bastani et al. 2025):
 * - the tutor is only reachable after the learner answered,
 * - it is grounded on the verified question/card, never on its own memory,
 * - hints are graded and never hand over the answer before level 3,
 * - the full explanation comes from verified content, not from the model.
 */
const SYSTEM_BASE = `Eres un tutor socrático para el examen AWS Certified Solutions Architect – Associate (SAA-C03).
Responde en español neutro (tú), breve (máx. 90 palabras), manteniendo en inglés los nombres de servicios y las frases clave del enunciado.
Usa SOLO el material de referencia verificado que te doy. Si algo no está en el material, dilo en vez de inventar límites, precios o números.`;

function questionContext(q: Question, content?: ConceptContent): string {
  const opts = q.options
    .map((o) => `${o.id}) ${o.text}\n   [${o.correct ? "CORRECTA" : "incorrecta"}] ${o.why}`)
    .join("\n");
  const facts = content ? `\nFicha del concepto (hechos clave):\n- ${content.card.en.keyFacts.join("\n- ")}` : "";
  return `PREGUNTA (${q.type === "multi" ? "respuesta múltiple" : "opción única"}):\n${q.stem}\n\nOPCIONES:\n${opts}\n\nEXPLICACIÓN VERIFICADA:\n${q.explanation}\nPistas del enunciado: ${q.keywordCues.join(", ")}${facts}`;
}

const HINT_RULES: Record<number, string> = {
  1: "Nivel 1: haz UNA pregunta socrática que dirija la atención al requisito clave del enunciado (p. ej. la frase que define el criterio). No menciones ninguna opción ni servicio de la respuesta.",
  2: "Nivel 2: da una pista conceptual sobre la propiedad del servicio que decide la pregunta, sin decir qué opción es correcta ni nombrar la letra.",
  3: "Nivel 3: descarta UNA opción incorrecta que el alumno eligió o que sea tentadora, explicando por qué no cumple el requisito. No reveles la correcta.",
};

export async function hint(opts: {
  question: Question;
  content?: ConceptContent;
  selected: string[];
  level: 1 | 2 | 3;
  learnerMessage?: string;
}) {
  await assertBudget();
  const res = await openai().responses.create({
    model: MODELS.fast,
    instructions: `${SYSTEM_BASE}\nNUNCA reveles cuál es la opción correcta ni su letra.\n${HINT_RULES[opts.level]}`,
    input: `${questionContext(opts.question, opts.content)}\n\nEl alumno respondió: ${opts.selected.join(", ") || "(nada)"} (incorrecto).${
      opts.learnerMessage ? `\nEl alumno pregunta: "${opts.learnerMessage}"` : ""
    }`,
  });
  await recordUsage({
    purpose: "hint",
    model: MODELS.fast,
    inputTokens: res.usage?.input_tokens,
    outputTokens: res.usage?.output_tokens,
  });
  return res.output_text.trim();
}

const Grade = z.object({
  score: z.number().int().min(0).max(2),
  feedback: z.string(),
});

/** Self-explanation check: "why is this right and the others wrong?" (Bisra et al. 2018). */
export async function gradeExplanation(opts: {
  question: Question;
  content?: ConceptContent;
  explanation: string;
}) {
  await assertBudget();
  const res = await openai().responses.parse({
    model: MODELS.fast,
    instructions: `${SYSTEM_BASE}
Evalúa la autoexplicación del alumno sobre por qué la respuesta correcta lo es y por qué descartó las otras.
score: 0 = razonamiento incorrecto o vacío, 1 = parcialmente correcto o superficial, 2 = identifica el requisito clave y la propiedad del servicio que decide.
feedback: 1–2 frases; si falta algo, di exactamente qué dato o requisito faltó. No repitas la explicación completa.`,
    input: `${questionContext(opts.question, opts.content)}\n\nAUTOEXPLICACIÓN DEL ALUMNO:\n${opts.explanation}`,
    text: { format: zodTextFormat(Grade, "grade") },
  });
  await recordUsage({
    purpose: "self-explanation",
    model: MODELS.fast,
    inputTokens: res.usage?.input_tokens,
    outputTokens: res.usage?.output_tokens,
  });
  return res.output_parsed ?? { score: 0, feedback: "No se pudo evaluar." };
}

const RecallGrade = z.object({
  score: z.number().int().min(0).max(2),
  correct: z.boolean(),
  feedback: z.string(),
  missing: z.array(z.string()),
});

/** Grades a spoken free-recall answer against the stored ideal answer + rubric. */
export async function gradeRecall(opts: { prompt: RecallPrompt; content?: ConceptContent; transcript: string }) {
  await assertBudget();
  const facts = opts.content ? `\nHechos clave del concepto:\n- ${opts.content.card.en.keyFacts.join("\n- ")}` : "";
  const res = await openai().responses.parse({
    model: MODELS.fast,
    instructions: `${SYSTEM_BASE}
El alumno respondió en voz alta (transcripción automática: ignora muletillas y errores de transcripción; puede mezclar español e inglés).
Evalúa el CONCEPTO, no el idioma ni la gramática.
score: 0 = incorrecto, 1 = idea correcta pero incompleta (falta un elemento de la rúbrica importante), 2 = cubre lo esencial de la rúbrica.
correct = score === 2.
feedback: 1–2 frases pensadas para ser LEÍDAS EN VOZ ALTA (sin listas, sin markdown).
missing: elementos de la rúbrica que faltaron (vacío si ninguno).`,
    input: `PREGUNTA: ${opts.prompt.prompt}\nRESPUESTA IDEAL: ${opts.prompt.idealAnswer}\nRÚBRICA:\n- ${opts.prompt.rubric.join("\n- ")}${facts}\n\nRESPUESTA DEL ALUMNO (transcripción):\n${opts.transcript}`,
    text: { format: zodTextFormat(RecallGrade, "recall_grade") },
  });
  await recordUsage({
    purpose: "voice-grade",
    model: MODELS.fast,
    inputTokens: res.usage?.input_tokens,
    outputTokens: res.usage?.output_tokens,
  });
  return res.output_parsed ?? { score: 0, correct: false, feedback: "No se pudo evaluar.", missing: [] };
}

const ErrorDiagnosis = z.object({
  category: z.enum(["knowledge-gap", "misread-keyword", "service-confusion", "overconfidence"]),
  note: z.string(),
});

/** Classifies a wrong answer for the error log. */
export async function diagnoseError(opts: {
  question: Question;
  selected: string[];
  confidence: number;
}) {
  if (opts.confidence === 3) {
    return { category: "overconfidence" as const, note: "Error con certeza alta: priorízalo en el repaso." };
  }
  await assertBudget();
  const res = await openai().responses.parse({
    model: MODELS.fast,
    instructions: `${SYSTEM_BASE}
Clasifica el error del alumno:
- misread-keyword: la opción elegida sería razonable si no fuera por una frase clave del enunciado (cost-effective, least operational overhead, etc.) que pasó por alto.
- service-confusion: eligió un servicio/feature parecido al correcto (típico par confundible).
- knowledge-gap: le falta el dato o concepto.
note: una frase en español que diga qué mirar la próxima vez.`,
    input: `${questionContext(opts.question)}\n\nEl alumno eligió: ${opts.selected.join(", ")}`,
    text: { format: zodTextFormat(ErrorDiagnosis, "error_diagnosis") },
  });
  await recordUsage({
    purpose: "error-diagnosis",
    model: MODELS.fast,
    inputTokens: res.usage?.input_tokens,
    outputTokens: res.usage?.output_tokens,
  });
  return res.output_parsed ?? { category: "knowledge-gap" as const, note: "" };
}
