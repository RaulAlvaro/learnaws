import "server-only";
import fs from "node:fs";
import path from "node:path";
import type {
  Concept,
  ConceptContent,
  Island,
  Lab,
  LightningItem,
  Question,
  RecallPrompt,
  ServiceUnit,
  Syllabus,
  UnitContent,
} from "./types";

const CONTENT_DIR = process.env.CONTENT_DIR ?? path.join(process.cwd(), "content");

interface ContentIndex {
  syllabus: Syllabus;
  concepts: Map<string, Concept>;
  content: Map<string, ConceptContent>;
  questions: Map<string, Question>;
  questionsByConcept: Map<string, Question[]>;
  recall: Map<string, RecallPrompt>;
  recallByConcept: Map<string, RecallPrompt[]>;
  labs: Lab[];
  islands: Island[];
  units: Map<string, ServiceUnit>;
  unitContent: Map<string, UnitContent>;
  unitByConcept: Map<string, string>;
}

let cached: ContentIndex | null = null;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function build(): ContentIndex {
  const syllabus = readJson<Syllabus>(path.join(CONTENT_DIR, "syllabus.json"));
  const concepts = new Map(syllabus.concepts.map((c) => [c.id, c]));
  const content = new Map<string, ConceptContent>();
  const questions = new Map<string, Question>();
  const questionsByConcept = new Map<string, Question[]>();
  const recall = new Map<string, RecallPrompt>();
  const recallByConcept = new Map<string, RecallPrompt[]>();

  const conceptsDir = path.join(CONTENT_DIR, "concepts");
  if (fs.existsSync(conceptsDir)) {
    for (const file of fs.readdirSync(conceptsDir)) {
      if (!file.endsWith(".json")) continue;
      const cc = readJson<ConceptContent>(path.join(conceptsDir, file));
      if (!concepts.has(cc.conceptId)) continue;
      content.set(cc.conceptId, cc);
      questionsByConcept.set(cc.conceptId, [...cc.questions]);
      recallByConcept.set(cc.conceptId, cc.recall);
      for (const q of cc.questions) questions.set(q.id, q);
      for (const r of cc.recall) recall.set(r.id, r);
    }
  }

  const labsFile = path.join(CONTENT_DIR, "labs.json");
  const labs = fs.existsSync(labsFile)
    ? readJson<{ labs: Lab[] }>(labsFile).labs.sort((a, b) => a.order - b.order)
    : [];

  // Islands, service units and their overviews + lightning items (M2).
  const servicesFile = path.join(CONTENT_DIR, "services.json");
  const map = fs.existsSync(servicesFile)
    ? readJson<{ islands: Island[]; units: ServiceUnit[] }>(servicesFile)
    : { islands: [], units: [] };
  const units = new Map(map.units.map((u) => [u.id, u]));
  const unitByConcept = new Map<string, string>();
  for (const u of map.units) for (const c of u.concepts) unitByConcept.set(c, u.id);
  const unitContent = new Map<string, UnitContent>();
  const unitsDir = path.join(CONTENT_DIR, "units");
  if (fs.existsSync(unitsDir)) {
    for (const file of fs.readdirSync(unitsDir)) {
      if (!file.endsWith(".json") || file.includes(".audit")) continue;
      const uc = readJson<UnitContent>(path.join(unitsDir, file));
      // Only audited content reaches learners.
      if (!units.has(uc.unitId) || !uc.audited) continue;
      unitContent.set(uc.unitId, uc);
      for (const item of uc.items) {
        const concept = concepts.get(item.conceptId);
        if (!concept) continue;
        const q = lightningToQuestion(item, concept);
        questions.set(q.id, q);
        if (!questionsByConcept.has(q.conceptId)) questionsByConcept.set(q.conceptId, []);
        questionsByConcept.get(q.conceptId)!.push(q);
      }
    }
  }

  return {
    islands: map.islands.sort((a, b) => a.order - b.order),
    units,
    unitContent,
    unitByConcept,
    syllabus,
    concepts,
    content,
    questions,
    questionsByConcept,
    recall,
    recallByConcept,
    labs,
  };
}

/** Lightning items share the question pipeline (scheduling, answers, XP) as short-format questions. */
function lightningToQuestion(item: LightningItem, concept: Concept): Question {
  return {
    id: item.id,
    conceptId: item.conceptId,
    secondaryConcepts: [],
    domain: concept.domain,
    type: "single",
    difficulty: 1,
    stem: item.prompt,
    options: item.options.map((o) => ({ id: o.id, text: o.text, correct: o.id === item.answer, why: o.id === item.answer ? item.why : "" })),
    explanation: item.why,
    keywordCues: [],
    docs: concept.docs,
    es: {
      stem: item.promptEs,
      options: item.options.map((o) => ({ id: o.id, text: o.text, why: o.id === item.answer ? item.why : "" })),
      explanation: item.why,
    },
    heldOut: false,
    source: "lightning",
    format: item.format,
    verification: { status: "pass", notes: "" },
  };
}

export const isShortFormat = (q: Question) => q.format === "lightning" || q.format === "thisorthat";

export function getContent(): ContentIndex {
  if (!cached || process.env.NODE_ENV === "development") cached = build();
  return cached;
}

/** Concepts that have generated content, in learning order. */
export function studyableConcepts(): Concept[] {
  const { syllabus, content } = getContent();
  return syllabus.concepts
    .filter((c) => content.has(c.id))
    .sort((a, b) => a.order - b.order);
}

export function domainWeight(domain: string): number {
  return getContent().syllabus.domains.find((d) => d.id === domain)?.weight ?? 0;
}
