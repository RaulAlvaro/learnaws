export type DomainId = "d1" | "d2" | "d3" | "d4";

export interface Task {
  id: string;
  title: string;
  knowledge: string[];
  skills: string[];
}

export interface Domain {
  id: DomainId;
  name: string;
  weight: number;
  tasks: Task[];
}

export interface Concept {
  id: string;
  title: string;
  titleEs: string;
  domain: DomainId;
  tasks: string[];
  services: string[];
  prerequisites: string[];
  confusableGroup: string | null;
  examFrequency: 1 | 2 | 3;
  order: number;
  docs: string[];
  summary: string;
}

export interface ConfusableGroup {
  id: string;
  title: string;
  concepts: string[];
  discriminators: string[];
}

export interface Syllabus {
  exam: string;
  sourceUrls: string[];
  domains: Domain[];
  concepts: Concept[];
  confusableGroups: ConfusableGroup[];
}

/** Micro-card shown after the pretest. Kept short on purpose (1–2 screens). */
export interface CardBody {
  tldr: string;
  whenToUse: string[];
  keyFacts: string[];
  gotchas: string[];
  confusedWith: { concept: string; difference: string }[];
  examCues: string[];
}

export interface ConceptCard {
  en: CardBody;
  es: CardBody;
  docs: string[];
}

export interface QuestionOption {
  id: string; // "A".."F"
  text: string;
  correct: boolean;
  why: string;
}

export interface QuestionEs {
  stem: string;
  options: { id: string; text: string; why: string }[];
  explanation: string;
}

export interface Question {
  id: string;
  conceptId: string;
  secondaryConcepts: string[];
  domain: DomainId;
  type: "single" | "multi";
  difficulty: 1 | 2 | 3;
  stem: string;
  options: QuestionOption[];
  explanation: string;
  keywordCues: string[];
  docs: string[];
  es: QuestionEs;
  /** Held-out questions are only ever shown in full mocks. */
  heldOut: boolean;
  source: "generated" | "open-study";
  verification: { status: "pass" | "fixed"; notes: string };
}

/** Short free-recall prompt designed for voice (no options). */
export interface RecallPrompt {
  id: string;
  conceptId: string;
  kind: "recall" | "why-not";
  prompt: string;
  promptEs: string;
  idealAnswer: string;
  rubric: string[];
}

export interface ConceptContent {
  conceptId: string;
  card: ConceptCard;
  questions: Question[];
  recall: RecallPrompt[];
}

export interface Lab {
  id: string;
  order: number;
  title: string;
  titleEs: string;
  concepts: string[];
  domain: DomainId;
  minutes: number;
  estimatedCostUsd: string;
  costWarning: string | null;
  objectiveEs: string;
  steps: { id: string; textEs: string; detailEs: string | null }[];
  checkQuestions: { id: string; questionEs: string; answerEs: string }[];
  cleanup: { id: string; textEs: string }[];
  examTakeawaysEs: string[];
  docs: string[];
}
