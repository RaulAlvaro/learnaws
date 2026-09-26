import "server-only";
import fs from "node:fs";
import path from "node:path";
import type {
  Concept,
  ConceptContent,
  Lab,
  Question,
  RecallPrompt,
  Syllabus,
} from "./types";

const CONTENT_DIR = path.join(process.cwd(), "content");

interface ContentIndex {
  syllabus: Syllabus;
  concepts: Map<string, Concept>;
  content: Map<string, ConceptContent>;
  questions: Map<string, Question>;
  questionsByConcept: Map<string, Question[]>;
  recall: Map<string, RecallPrompt>;
  recallByConcept: Map<string, RecallPrompt[]>;
  labs: Lab[];
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
      questionsByConcept.set(cc.conceptId, cc.questions);
      recallByConcept.set(cc.conceptId, cc.recall);
      for (const q of cc.questions) questions.set(q.id, q);
      for (const r of cc.recall) recall.set(r.id, r);
    }
  }

  const labsFile = path.join(CONTENT_DIR, "labs.json");
  const labs = fs.existsSync(labsFile)
    ? readJson<{ labs: Lab[] }>(labsFile).labs.sort((a, b) => a.order - b.order)
    : [];

  return {
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
