import { z } from "zod";

export const CardBodySchema = z.object({
  tldr: z.string().describe("2–3 sentences: what it is and the decision it drives in an exam scenario"),
  whenToUse: z.array(z.string()).describe("2–4 bullets: requirements that point to this"),
  keyFacts: z.array(z.string()).describe("3–6 exam-relevant facts: limits, numbers, behaviours (only if supported by the docs)"),
  gotchas: z.array(z.string()).describe("2–4 traps that exam distractors exploit"),
  confusedWith: z.array(z.object({ concept: z.string(), difference: z.string() })).describe("0–3 look-alikes and the one-line discriminator"),
  examCues: z.array(z.string()).describe("2–5 short scenario phrases (always in English) that signal this concept"),
});

export const GeneratedSchema = z.object({
  card: z.object({ en: CardBodySchema, es: CardBodySchema }),
  questions: z.array(
    z.object({
      type: z.enum(["single", "multi"]),
      difficulty: z.number().int().min(1).max(3),
      stem: z.string(),
      options: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
          correct: z.boolean(),
          why: z.string().describe("one sentence: why this option is right or wrong for THIS scenario"),
        }),
      ),
      explanation: z.string().describe("3–5 sentences: the requirement that decides, why the answer satisfies it, the key distractor's flaw"),
      keywordCues: z.array(z.string()).describe("exact phrases from the stem that decide the answer (English)"),
      secondaryConcepts: z.array(z.string()).describe("ids of sibling concepts this question also exercises (from the provided list only)"),
      es: z.object({
        stem: z.string(),
        options: z.array(z.object({ id: z.string(), text: z.string(), why: z.string() })),
        explanation: z.string(),
      }),
    }),
  ),
  recall: z.array(
    z.object({
      kind: z.enum(["recall", "why-not"]),
      prompt: z.string().describe("English, ≤ 30 words, answerable out loud in 20–40 seconds, no options"),
      promptEs: z.string(),
      idealAnswer: z.string().describe("English, 2–3 sentences"),
      rubric: z.array(z.string()).describe("2–4 elements a complete answer must contain"),
    }),
  ),
});
export type Generated = z.infer<typeof GeneratedSchema>;

export const SolveSchema = z.object({
  answers: z.array(
    z.object({
      index: z.number().int(),
      chosen: z.array(z.string()),
      confidence: z.enum(["low", "medium", "high"]),
    }),
  ),
});
export type Solve = z.infer<typeof SolveSchema>;

export const AuditSchema = z.object({
  questions: z.array(
    z.object({
      index: z.number().int(),
      keyCorrect: z.boolean().describe("the marked correct option(s) are the best answer for the stated requirement"),
      uniquelyCorrect: z.boolean().describe("no distractor is also defensible as correct"),
      factualIssues: z.array(z.string()).describe("statements in stem/options/whys/explanation contradicted by the docs or known AWS behaviour"),
      translationOk: z.boolean(),
      verdict: z.enum(["pass", "fail"]),
    }),
  ),
  card: z.object({ factualIssues: z.array(z.string()), verdict: z.enum(["pass", "fail"]) }),
  recall: z.array(z.object({ index: z.number().int(), verdict: z.enum(["pass", "fail"]), issue: z.string() })),
});
export type Audit = z.infer<typeof AuditSchema>;

export const CardFixSchema = z.object({ card: z.object({ en: CardBodySchema, es: CardBodySchema }) });

export const UnitAuditSchema = z.object({
  overview: z.object({ factualIssues: z.array(z.string()), verdict: z.enum(["pass", "fail"]) }),
  items: z.array(
    z.object({
      id: z.string(),
      keyCorrect: z.boolean(),
      uniquelyCorrect: z.boolean(),
      factualIssues: z.array(z.string()),
      translationOk: z.boolean(),
      verdict: z.enum(["pass", "fail"]),
    }),
  ),
});
export type UnitAudit = z.infer<typeof UnitAuditSchema>;

export const OverviewFixSchema = z.object({
  hook: z.string(),
  segments: z.array(z.object({ narration: z.string(), show: z.array(z.string()), focus: z.string() })),
  keyPoints: z.array(z.string()),
  confusedWith: z.array(z.object({ unitOrService: z.string(), difference: z.string() })),
});

export const WhyFixSchema = z.object({ items: z.array(z.object({ id: z.string(), why: z.string() })) });
