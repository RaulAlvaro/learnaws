import type { Concept, ConfusableGroup, Syllabus } from "../../src/lib/content/types";
import type { Generated } from "./schemas";

/** Questions to generate per concept (one extra: verification drops the weakest). */
export function questionTarget(c: Concept): { keep: number; generate: number; multi: number } {
  const keep = c.examFrequency === 3 ? 4 : c.examFrequency === 2 ? 3 : 2;
  return { keep, generate: keep + 1, multi: c.examFrequency === 1 ? 0 : 1 };
}

export const GEN_INSTRUCTIONS = `You write ORIGINAL practice material for the AWS Certified Solutions Architect – Associate exam (SAA-C03).
Hard rules:
- Never reproduce or paraphrase real exam questions, braindumps (ExamTopics etc.) or commercial practice tests. Write fresh scenarios.
- Ground every fact in the provided AWS documentation excerpts. If a number/limit is not in the excerpts and you are not certain it is current, do not state it.
- SAA-C03 style: a 2–5 sentence business scenario with concrete constraints, ending with a requirement qualifier such as
  "Which solution meets these requirements with the LEAST operational overhead?", "MOST cost-effectively", "MOST secure", "highly available".
- Single-response: exactly 4 options (A–D), exactly 1 correct. Multi-response: exactly 5 options (A–E), exactly 2 correct, stem says "(Choose two.)".
- Distractors must be plausible AWS solutions a real candidate might choose — prefer look-alike services from the confusable group — and each must fail a specific stated requirement. No "all/none of the above", no joke options, no options that are obviously wrong by length or wording.
- Vary industries, scale and constraints across questions; vary which letter is correct.
- The questions test decisions in scenarios, not definitions or trivia.
- Spanish (es) fields: neutral Latin-American Spanish using "tú". Keep AWS service names, feature names and the requirement phrases (e.g. "least operational overhead", "cost-effective") in English inside the Spanish text.
- Card: concise micro-lesson (1–2 phone screens) optimized for the exam decisions, not a documentation summary.
- Recall prompts: short spoken free-recall questions without options. One "recall" (which service/feature for a situation and why). If sibling concepts are given, one "why-not" that asks why a look-alike does NOT fit a situation.`;

export function genInput(opts: {
  concept: Concept;
  syllabus: Syllabus;
  group: ConfusableGroup | null;
  docs: string;
}): string {
  const { concept: c, syllabus, group } = opts;
  const t = questionTarget(c);
  const tasks = syllabus.domains
    .flatMap((d) => d.tasks)
    .filter((task) => c.tasks.includes(task.id))
    .map((task) => `- ${task.id} ${task.title}\n  knowledge: ${task.knowledge.slice(0, 8).join("; ")}\n  skills: ${task.skills.slice(0, 8).join("; ")}`)
    .join("\n");
  const siblings = group
    ? group.concepts
        .filter((id) => id !== c.id)
        .map((id) => syllabus.concepts.find((x) => x.id === id))
        .filter(Boolean)
        .map((s) => `- ${s!.id}: ${s!.title} — ${s!.summary}`)
        .join("\n")
    : "(none)";
  return `CONCEPT: ${c.id} — ${c.title}
Summary (what the learner must be able to decide): ${c.summary}
Domain: ${c.domain}; services: ${c.services.join(", ")}; exam frequency ${c.examFrequency}/3

OFFICIAL TASK STATEMENTS:
${tasks}

CONFUSABLE GROUP: ${group ? `${group.title}\nDiscriminators: ${group.discriminators.join(" | ")}` : "(none)"}
SIBLING CONCEPTS (valid ids for secondaryConcepts):
${siblings}

PRODUCE:
- card (en + es)
- ${t.generate} questions: ${t.generate - t.multi} single-response and ${t.multi} multi-response, difficulty mix (mostly 2, some 1 and 3)
- ${group ? 2 : 1} recall prompts

AWS DOCUMENTATION EXCERPTS:
${opts.docs || "(no excerpts available — rely only on well-established, stable AWS behaviour and avoid specific numbers)"}`;
}

export const SOLVE_INSTRUCTIONS = `You are an expert AWS Solutions Architect taking SAA-C03 practice questions.
For each question choose the best answer(s) for the stated requirement (exactly as many as the question requires). Think carefully about qualifiers like LEAST operational overhead or MOST cost-effective.`;

export function solveInput(g: Generated): string {
  return g.questions
    .map(
      (q, i) =>
        `QUESTION ${i} (${q.type === "multi" ? "choose two" : "choose one"}):\n${q.stem}\n${q.options.map((o) => `${o.id}) ${o.text}`).join("\n")}`,
    )
    .join("\n\n");
}

export const AUDIT_INSTRUCTIONS = `You are a strict technical reviewer of AWS SAA-C03 practice material. Check it against the documentation excerpts and your knowledge of current AWS behaviour.
Fail a question if: the answer key is wrong, another option is also defensible, any statement is factually wrong or outdated, the scenario is ambiguous, or the Spanish translation changes the meaning.
Fail the card if any fact is wrong or outdated. Fail a recall prompt if its ideal answer is wrong or the prompt is ambiguous.
Be specific in issues. Do not fail for style.`;

export function auditInput(g: Generated, docs: string): string {
  const qs = g.questions
    .map(
      (q, i) =>
        `QUESTION ${i} [${q.type}]\n${q.stem}\n${q.options.map((o) => `${o.id}) ${o.text} [${o.correct ? "KEY" : "distractor"}] — ${o.why}`).join("\n")}\nExplanation: ${q.explanation}\nES stem: ${q.es.stem}\nES explanation: ${q.es.explanation}`,
    )
    .join("\n\n");
  const card = `CARD (en): ${JSON.stringify(g.card.en)}`;
  const recall = g.recall.map((r, i) => `RECALL ${i}: ${r.prompt}\nIdeal: ${r.idealAnswer}`).join("\n");
  return `${qs}\n\n${card}\n\n${recall}\n\nAWS DOCUMENTATION EXCERPTS:\n${docs || "(none)"}`;
}
