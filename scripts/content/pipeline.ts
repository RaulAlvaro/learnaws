/**
 * Content pipeline — generates the question bank with OpenAI and verifies it.
 *
 *   pnpm content docs                 fetch AWS doc excerpts per concept (cached)
 *   pnpm content models               list available OpenAI models
 *   pnpm content gen [--direct] [--limit N] [--concepts a,b] [--only-missing]
 *   pnpm content verify [--direct] [--limit N] [--concepts a,b]
 *   pnpm content collect              download finished batches and apply results
 *   pnpm content finalize             assign held-out questions, write content/concepts/*.json
 *   pnpm content status
 *
 * Batch mode (default) costs half and takes up to 24 h. --direct runs synchronously
 * (use it with --limit to check prompt quality before a full batch).
 */
import { config } from "dotenv";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { Concept, ConceptContent, Question, Syllabus } from "../../src/lib/content/types";
import { AUDIT_INSTRUCTIONS, auditInput, GEN_INSTRUCTIONS, genInput, questionTarget, SOLVE_INSTRUCTIONS, solveInput } from "./prompts";
import {
  AuditSchema,
  CardFixSchema,
  GeneratedSchema,
  OverviewFixSchema,
  SolveSchema,
  UnitAuditSchema,
  WhyFixSchema,
  type Audit,
  type Generated,
  type Solve,
  type UnitAudit,
} from "./schemas";
import type { UnitContent } from "../../src/lib/content/types";

config({ path: [".env.local", ".env"], quiet: true });

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content");
const WORK = path.join(CONTENT, ".pipeline");
const DOCS = path.join(WORK, "docs");
const STAGE = path.join(WORK, "generated");
const VERIFY = path.join(WORK, "verify");
const OUT = path.join(CONTENT, "concepts");
const STATE = path.join(WORK, "state.json");
for (const d of [WORK, DOCS, STAGE, VERIFY, OUT]) fs.mkdirSync(d, { recursive: true });

const MODEL = process.env.OPENAI_MODEL_CONTENT ?? process.env.OPENAI_MODEL_SMART ?? "gpt-6-sol";
const VERIFY_MODEL = process.env.OPENAI_MODEL_VERIFY ?? MODEL;
const syllabus: Syllabus = JSON.parse(fs.readFileSync(path.join(CONTENT, "syllabus.json"), "utf8"));

interface State {
  batches: { id: string; kind: "gen" | "verify"; createdAt: string; done?: boolean }[];
}
const loadState = (): State => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { batches: [] });
const saveState = (s: State) => fs.writeFileSync(STATE, JSON.stringify(s, null, 2));

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

let _client: OpenAI | null = null;
const client = () => (_client ??= new OpenAI());

function selectConcepts(filter: (c: Concept) => boolean = () => true): Concept[] {
  const only = opt("concepts")?.split(",");
  let list = syllabus.concepts.filter((c) => (only ? only.includes(c.id) : true)).filter(filter);
  list.sort((a, b) => a.order - b.order);
  const limit = Number(opt("limit") ?? 0);
  if (limit) list = list.slice(0, limit);
  return list;
}

// ---------------------------------------------------------------- docs

function htmlToText(html: string): string {
  const main =
    html.match(/<div[^>]+id="main-col-body"[^>]*>([\s\S]*?)<div[^>]+id="(?:js_error_message|awsdocs-footer)/)?.[1] ??
    html.match(/<main[\s\S]*?<\/main>/)?.[0] ??
    html;
  return main
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<(br|p|li|h[1-6]|tr|div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const docFile = (url: string) => path.join(DOCS, `${createHash("sha1").update(url).digest("hex")}.txt`);

async function fetchDocs() {
  const urls = [...new Set(syllabus.concepts.flatMap((c) => c.docs))];
  let done = 0;
  const queue = urls.filter((u) => !fs.existsSync(docFile(u)));
  console.log(`${urls.length} URLs, ${queue.length} pendientes`);
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        try {
          const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 learnaws-study-bot" } });
          const text = res.ok ? htmlToText(await res.text()) : "";
          fs.writeFileSync(docFile(u), `SOURCE: ${u}\n${text.slice(0, 24_000)}`);
        } catch (e) {
          console.warn("  fallo", u, (e as Error).message);
        }
        if (++done % 25 === 0) console.log(`  ${done}/${urls.length}`);
      }
    }),
  );
}

function docsFor(c: Concept, budget = 30_000): string {
  const per = Math.floor(budget / Math.max(1, c.docs.length));
  return c.docs
    .map((u) => (fs.existsSync(docFile(u)) ? fs.readFileSync(docFile(u), "utf8").slice(0, per) : ""))
    .filter(Boolean)
    .join("\n\n---\n\n");
}

// ---------------------------------------------------------------- requests

type Req = { custom_id: string; body: Record<string, unknown> };

function genRequest(c: Concept): Req {
  const group = syllabus.confusableGroups.find((g) => g.id === c.confusableGroup) ?? null;
  return {
    custom_id: `gen:${c.id}`,
    body: {
      model: MODEL,
      instructions: GEN_INSTRUCTIONS,
      input: genInput({ concept: c, syllabus, group, docs: docsFor(c) }),
      reasoning: { effort: "medium" },
      max_output_tokens: 24_000,
      text: { format: strip(zodTextFormat(GeneratedSchema, "concept_content")) },
    },
  };
}

function verifyRequests(c: Concept, g: Generated): Req[] {
  return [
    {
      custom_id: `solve:${c.id}`,
      body: {
        model: VERIFY_MODEL,
        instructions: SOLVE_INSTRUCTIONS,
        input: solveInput(g),
        reasoning: { effort: "medium" },
        max_output_tokens: 12_000,
        text: { format: strip(zodTextFormat(SolveSchema, "solve")) },
      },
    },
    {
      custom_id: `audit:${c.id}`,
      body: {
        model: VERIFY_MODEL,
        instructions: AUDIT_INSTRUCTIONS,
        input: auditInput(g, docsFor(c, 20_000)),
        reasoning: { effort: "medium" },
        max_output_tokens: 12_000,
        text: { format: strip(zodTextFormat(AuditSchema, "audit")) },
      },
    },
  ];
}

/** JSON-serialisable copy of the SDK's format helper. */
function strip<T>(format: T): T {
  return JSON.parse(JSON.stringify(format));
}

function outputText(response: { output?: { type: string; content?: { type: string; text?: string }[] }[] }): string {
  return (response.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
}

/** Rewrites a card the auditor flagged, applying exactly its observations. */
function cardFixRequest(c: Concept, g: Generated, issues: string[]): Req {
  return {
    custom_id: `cardfix:${c.id}`,
    body: {
      model: MODEL,
      instructions: `You correct AWS SAA-C03 micro-lesson cards. Apply the reviewer's issues precisely (qualify or remove the flagged claims), keep everything else, keep the same structure and brevity. Update the Spanish (es) version to match, neutral Spanish with "tú", AWS terms in English.`,
      input: `CARD:
${JSON.stringify(g.card)}

REVIEWER ISSUES:
- ${issues.join("\n- ")}

AWS DOCUMENTATION EXCERPTS:
${docsFor(c, 12_000)}`,
      reasoning: { effort: "medium" },
      max_output_tokens: 8_000,
      text: { format: strip(zodTextFormat(CardFixSchema, "card_fix")) },
    },
  };
}

// ---------------------------------------------------------------- units (M2)

const UNITS = path.join(CONTENT, "units");
const UNIT_AUDIT = path.join(WORK, "units-audit");
const UNIT_BACKUP = path.join(WORK, "units-original");
fs.mkdirSync(UNIT_AUDIT, { recursive: true });
fs.mkdirSync(UNIT_BACKUP, { recursive: true });

type ItemVerdict = UnitAudit["items"][number];
/** Wrong key / another defensible option / bad translation → drop. */
const isHardFail = (i: ItemVerdict) => !i.keyCorrect || !i.uniquelyCorrect || !i.translationOk;
/** Key is fine but the explanation has imprecisions → rewrite the "why". */
const needsWhyFix = (i: ItemVerdict) => !isHardFail(i) && (i.verdict === "fail" || i.factualIssues.length > 0);

function whyFixRequest(u: UnitContent, verdicts: ItemVerdict[]): Req {
  const items = verdicts
    .map((v) => {
      const it = u.items.find((x) => x.id === v.id)!;
      return `ITEM ${it.id}
${it.prompt}
${it.options.map((o) => `${o.id}) ${o.text}${o.id === it.answer ? " [KEY]" : ""}`).join("\n")}
Current why (es): ${it.why}
Reviewer issues: ${v.factualIssues.join(" | ")}`;
    })
    .join("\n\n");
  return {
    custom_id: `whyfix:${u.unitId}`,
    body: {
      model: MODEL,
      instructions: `Rewrite the Spanish explanation ("why") of each AWS SAA-C03 practice item so it fixes the reviewer issues exactly (qualify or remove the inaccurate claim). Keep it ≤ 35 words, neutral Spanish with "tú", AWS terms in English, and keep explaining why the key is right for the stated requirement.`,
      input: `${items}

VERIFIED FACTS
${unitGrounding(u)}`,
      reasoning: { effort: "medium" },
      max_output_tokens: 6_000,
      text: { format: strip(zodTextFormat(WhyFixSchema, "why_fix")) },
    },
  };
}

function unitGrounding(u: UnitContent): string {
  const services = JSON.parse(fs.readFileSync(path.join(CONTENT, "services.json"), "utf8")) as {
    units: { id: string; concepts: string[] }[];
  };
  const concepts = services.units.find((x) => x.id === u.unitId)?.concepts ?? [];
  return concepts
    .map((cid) => {
      const f = path.join(OUT, `${cid}.json`);
      if (!fs.existsSync(f)) return "";
      const cc = JSON.parse(fs.readFileSync(f, "utf8"));
      return `CONCEPT ${cid}\nKey facts: ${cc.card.en.keyFacts.join(" | ")}\nGotchas: ${cc.card.en.gotchas.join(" | ")}`;
    })
    .join("\n\n");
}

function unitAuditRequest(u: UnitContent): Req {
  const items = u.items
    .map(
      (it) =>
        `ITEM ${it.id} (${it.format})\n${it.prompt}\nES: ${it.promptEs}\n${it.options
          .map((o) => `${o.id}) ${o.text}${o.id === it.answer ? " [KEY]" : ""}`)
          .join("\n")}\nWhy (es): ${it.why}`,
    )
    .join("\n\n");
  const ov = u.overview;
  return {
    custom_id: `unitaudit:${u.unitId}`,
    body: {
      model: VERIFY_MODEL,
      instructions: `You are a strict technical reviewer of AWS SAA-C03 learning material written in Spanish (AWS terms in English). Check it against the verified facts provided and current AWS behaviour.
Fail an item if: the key is wrong, another option is also defensible, the prompt is ambiguous, any statement is wrong or outdated, or the Spanish prompt changes the meaning.
Fail the overview only for factual errors that would mislead a learner (list minor imprecisions as issues but keep "pass").`,
      input: `UNIT ${u.unitId}\nOVERVIEW\nHook: ${ov.hook}\nNarration:\n${ov.segments.map((s, i) => `${i + 1}. ${s.narration}`).join("\n")}\nKey points: ${ov.keyPoints.join(" | ")}\nConfused with: ${ov.confusedWith.map((c) => `${c.unitOrService}: ${c.difference}`).join(" | ")}\n\nITEMS\n${items}\n\nVERIFIED FACTS\n${unitGrounding(u)}`,
      reasoning: { effort: "medium" },
      max_output_tokens: 12_000,
      text: { format: strip(zodTextFormat(UnitAuditSchema, "unit_audit")) },
    },
  };
}

function overviewFixRequest(u: UnitContent, issues: string[]): Req {
  return {
    custom_id: `overviewfix:${u.unitId}`,
    body: {
      model: MODEL,
      instructions: `You correct a Spanish narrated overview of an AWS service for an SAA-C03 study game. Apply the reviewer issues precisely; keep the structure, segment count, node ids in show/focus, brevity (≤ 45 words per segment), neutral Spanish with "tú" and AWS terms in English.`,
      input: `CURRENT OVERVIEW\n${JSON.stringify(u.overview)}\n\nREVIEWER ISSUES\n- ${issues.join("\n- ")}\n\nVERIFIED FACTS\n${unitGrounding(u)}`,
      reasoning: { effort: "medium" },
      max_output_tokens: 8_000,
      text: { format: strip(zodTextFormat(OverviewFixSchema, "overview_fix")) },
    },
  };
}

function readUnits(): UnitContent[] {
  if (!fs.existsSync(UNITS)) return [];
  const only = opt("units")?.split(",");
  return fs
    .readdirSync(UNITS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(UNITS, f), "utf8")) as UnitContent)
    .filter((u) => !only || only.includes(u.unitId));
}

const auditOf = (id: string): UnitAudit | null => {
  const f = path.join(UNIT_AUDIT, `${id}.json`);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as UnitAudit) : null;
};

/** Drop failed items and apply overview fixes, in place. Returns one report line per unit. */
function applyUnitAudits(): string[] {
  const report: string[] = [];
  for (const u of readUnits()) {
    const audit = auditOf(u.unitId);
    if (!audit) {
      report.push(`${u.unitId}: sin auditoría`);
      continue;
    }
    const backup = path.join(UNIT_BACKUP, `${u.unitId}.json`);
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(u, null, 2));
    const failed = new Set(audit.items.filter(isHardFail).map((i) => i.id));
    const whyFile = path.join(UNIT_AUDIT, `${u.unitId}.whyfix.json`);
    const whys = fs.existsSync(whyFile)
      ? new Map(WhyFixSchema.parse(JSON.parse(fs.readFileSync(whyFile, "utf8"))).items.map((w) => [w.id, w.why]))
      : new Map<string, string>();
    const unfixed = audit.items.filter((i) => needsWhyFix(i) && !whys.has(i.id)).map((i) => i.id);
    for (const id of unfixed) failed.add(id); // imprecise explanation and no fix available → drop
    const kept = u.items.filter((i) => !failed.has(i.id)).map((i) => (whys.has(i.id) ? { ...i, why: whys.get(i.id)! } : i));
    const fix = path.join(UNIT_AUDIT, `${u.unitId}.overviewfix.json`);
    if (audit.overview.verdict === "fail" && fs.existsSync(fix)) {
      const f = OverviewFixSchema.parse(JSON.parse(fs.readFileSync(fix, "utf8")));
      u.overview = { ...u.overview, hook: f.hook, segments: f.segments, keyPoints: f.keyPoints, confusedWith: f.confusedWith };
    }
    const dropped = u.items.length - kept.length;
    u.items = kept;
    u.audited = true;
    fs.writeFileSync(path.join(UNITS, `${u.unitId}.json`), JSON.stringify(u, null, 2));
    const ovNote =
      audit.overview.verdict === "fail" ? (fs.existsSync(fix) ? " · resumen corregido" : " · RESUMEN CON OBSERVACIONES SIN CORREGIR") : "";
    report.push(`${u.unitId}: ${kept.length} ítems (${dropped} descartados)${ovNote}`);
  }
  return report;
}

async function auditUnits() {
  const units = readUnits().filter((u) => flag("all") || !auditOf(u.unitId));
  console.log(`Auditando ${units.length} unidades con ${VERIFY_MODEL}`);
  await runDirect(units.map(unitAuditRequest));
  const toFix = readUnits().filter(
    (u) => auditOf(u.unitId)?.overview.verdict === "fail" && !fs.existsSync(path.join(UNIT_AUDIT, `${u.unitId}.overviewfix.json`)),
  );
  console.log(`Corrigiendo ${toFix.length} resúmenes`);
  await runDirect(toFix.map((u) => overviewFixRequest(u, auditOf(u.unitId)!.overview.factualIssues)));
  const whyTargets = readUnits()
    .map((u) => ({ u, v: (auditOf(u.unitId)?.items ?? []).filter((i) => needsWhyFix(i) && u.items.some((x) => x.id === i.id)) }))
    .filter(({ u, v }) => v.length > 0 && !fs.existsSync(path.join(UNIT_AUDIT, `${u.unitId}.whyfix.json`)));
  console.log(`Corrigiendo explicaciones en ${whyTargets.length} unidades`);
  await runDirect(whyTargets.map(({ u, v }) => whyFixRequest(u, v)));
  const report = applyUnitAudits();
  fs.writeFileSync(path.join(WORK, "units-report.txt"), report.join("\n"));
  console.log(report.join("\n"));
}

function applyResult(customId: string, text: string) {
  const [kind, id] = customId.split(":");
  const data = JSON.parse(text);
  if (kind === "unitaudit") {
    fs.writeFileSync(path.join(UNIT_AUDIT, `${id}.json`), JSON.stringify(UnitAuditSchema.parse(data), null, 2));
    return;
  }
  if (kind === "whyfix") {
    fs.writeFileSync(path.join(UNIT_AUDIT, `${id}.whyfix.json`), JSON.stringify(WhyFixSchema.parse(data), null, 2));
    return;
  }
  if (kind === "overviewfix") {
    fs.writeFileSync(path.join(UNIT_AUDIT, `${id}.overviewfix.json`), JSON.stringify(OverviewFixSchema.parse(data), null, 2));
    return;
  }
  if (kind === "cardfix") {
    fs.writeFileSync(path.join(VERIFY, `${id}.cardfix.json`), JSON.stringify(CardFixSchema.parse(data), null, 2));
    return;
  }
  if (kind === "gen") fs.writeFileSync(path.join(STAGE, `${id}.json`), JSON.stringify(GeneratedSchema.parse(data), null, 2));
  else fs.writeFileSync(path.join(VERIFY, `${id}.${kind}.json`), JSON.stringify(kind === "solve" ? SolveSchema.parse(data) : AuditSchema.parse(data), null, 2));
}

async function runDirect(reqs: Req[]) {
  let i = 0;
  const queue = [...reqs];
  await Promise.all(
    Array.from({ length: Number(opt("concurrency") ?? 4) }, async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        try {
          const res = await client().responses.create(r.body as never);
          applyResult(r.custom_id, (res as unknown as { output_text: string }).output_text);
          console.log(`  ✓ ${r.custom_id} (${++i}/${reqs.length}) tokens in/out ${res.usage?.input_tokens}/${res.usage?.output_tokens}`);
        } catch (e) {
          console.warn(`  ✗ ${r.custom_id}: ${(e as Error).message}`);
        }
      }
    }),
  );
}

async function submitBatch(kind: "gen" | "verify", reqs: Req[]) {
  if (!reqs.length) return console.log("Nada que enviar.");
  const jsonl = reqs.map((r) => JSON.stringify({ custom_id: r.custom_id, method: "POST", url: "/v1/responses", body: r.body })).join("\n");
  const file = await client().files.create({ file: await toFile(Buffer.from(jsonl), `${kind}.jsonl`), purpose: "batch" });
  const batch = await client().batches.create({ input_file_id: file.id, endpoint: "/v1/responses", completion_window: "24h" });
  const s = loadState();
  s.batches.push({ id: batch.id, kind, createdAt: new Date().toISOString() });
  saveState(s);
  console.log(`Batch ${batch.id} enviado con ${reqs.length} requests. Revisa con: pnpm content collect`);
}

async function collect() {
  const s = loadState();
  for (const b of s.batches.filter((x) => !x.done)) {
    const batch = await client().batches.retrieve(b.id);
    console.log(`${b.kind} ${b.id}: ${batch.status} ${JSON.stringify(batch.request_counts)}`);
    if (!["completed", "expired", "cancelled", "failed"].includes(batch.status)) continue;
    for (const fileId of [batch.output_file_id, batch.error_file_id].filter(Boolean) as string[]) {
      const text = await (await client().files.content(fileId)).text();
      for (const line of text.split("\n").filter(Boolean)) {
        const row = JSON.parse(line);
        if (row.response?.status_code !== 200) {
          console.warn(`  ✗ ${row.custom_id}: ${JSON.stringify(row.error ?? row.response?.body?.error)}`);
          continue;
        }
        try {
          applyResult(row.custom_id, outputText(row.response.body));
        } catch (e) {
          console.warn(`  ✗ ${row.custom_id}: ${(e as Error).message}`);
        }
      }
    }
    b.done = true;
  }
  saveState(s);
}

// ---------------------------------------------------------------- finalize

function sameSet(a: string[], b: string[]) {
  const x = [...a].sort().join(",");
  return x === [...b].sort().join(",");
}

function validShape(q: Generated["questions"][number]): boolean {
  const n = q.options.length;
  const k = q.options.filter((o) => o.correct).length;
  const shapeOk = q.type === "single" ? n === 4 && k === 1 : n === 5 && k === 2;
  return shapeOk && q.es.options.length === n;
}

function keyIsLongest(q: Generated["questions"][number]): boolean {
  if (q.type !== "single") return false;
  const lens = q.options.map((o) => o.text.length);
  return lens[q.options.findIndex((o) => o.correct)] === Math.max(...lens);
}

/**
 * Deterministic option shuffle so the key is evenly spread across letters,
 * rewriting "Option X"/"opción X" references in explanations and whys.
 */
function reletter(q: Generated["questions"][number], seed: number) {
  const n = q.options.length;
  const order = Array.from({ length: n }, (_, i) => i);
  let s = seed || 1;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const letters = "ABCDEF".slice(0, n).split("");
  const map = new Map(order.map((oldIdx, newIdx) => [q.options[oldIdx].id, letters[newIdx]]));
  const fix = (text: string) =>
    text.replace(/\b([Oo]ptions?|[Oo]pci(?:ón|ones)) ([A-F])\b/g, (_m, w, l) => `${w} ${map.get(l) ?? l}`);
  const options = order.map((oldIdx, newIdx) => {
    const o = q.options[oldIdx];
    return { ...o, id: letters[newIdx], why: fix(o.why) };
  });
  const esById = new Map(q.es.options.map((o) => [o.id, o]));
  const esOptions = order.map((oldIdx, newIdx) => {
    const o = esById.get(q.options[oldIdx].id) ?? q.es.options[oldIdx];
    return { id: letters[newIdx], text: o.text, why: fix(o.why) };
  });
  return {
    options,
    explanation: fix(q.explanation),
    es: { stem: q.es.stem, options: esOptions, explanation: fix(q.es.explanation) },
  };
}

function finalize() {
  let kept = 0;
  let dropped = 0;
  const report: string[] = [];
  const perConcept: ConceptContent[] = [];
  for (const c of syllabus.concepts) {
    const genFile = path.join(STAGE, `${c.id}.json`);
    if (!fs.existsSync(genFile)) continue;
    const g: Generated = JSON.parse(fs.readFileSync(genFile, "utf8"));
    const solveFile = path.join(VERIFY, `${c.id}.solve.json`);
    const auditFile = path.join(VERIFY, `${c.id}.audit.json`);
    if (!fs.existsSync(solveFile) || !fs.existsSync(auditFile)) {
      report.push(`${c.id}: sin verificación, se omite`);
      continue;
    }
    const solve: Solve = JSON.parse(fs.readFileSync(solveFile, "utf8"));
    const audit: Audit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
    const cardFix = path.join(VERIFY, `${c.id}.cardfix.json`);
    if (audit.card.verdict === "fail") {
      if (!fs.existsSync(cardFix)) {
        report.push(`${c.id}: ficha con observaciones, falta corregirla (pnpm content fix-cards) — ${audit.card.factualIssues.join("; ")}`);
        continue;
      }
      g.card = CardFixSchema.parse(JSON.parse(fs.readFileSync(cardFix, "utf8"))).card;
    }
    const { keep } = questionTarget(c);
    const siblings = new Set(syllabus.concepts.map((x) => x.id));
    const passing: { q: Generated["questions"][number]; notes: string }[] = [];
    g.questions.forEach((q, i) => {
      const key = q.options.filter((o) => o.correct).map((o) => o.id);
      const s = solve.answers.find((a) => a.index === i);
      const a = audit.questions.find((x) => x.index === i);
      const pass =
        validShape(q) && !!s && sameSet(s.chosen, key) && !!a && a.verdict === "pass" && a.keyCorrect && a.uniquelyCorrect && a.translationOk;
      if (pass) {
        passing.push({ q, notes: a?.factualIssues.join("; ") ?? "" });
      } else {
        dropped++;
        report.push(`${c.id} q${i}: descartada (${!validShape(q) ? "forma" : !s || !sameSet(s.chosen, key) ? `solver eligió ${s?.chosen.join(",")} vs ${key.join(",")}` : a?.factualIssues.join("; ") || "auditoría"})`);
      }
    });
    // When there are spares, drop the ones where the key is the longest option (a giveaway cue).
    passing.sort((x, y) => Number(keyIsLongest(x.q)) - Number(keyIsLongest(y.q)));
    const questions: Question[] = passing.slice(0, keep).map(({ q, notes }) => {
      const id = `${c.id}--${createHash("sha1").update(q.stem).digest("hex").slice(0, 8)}`;
      const r = reletter(q, hash(id));
      kept++;
      return {
        id,
        conceptId: c.id,
        secondaryConcepts: q.secondaryConcepts.filter((x) => siblings.has(x) && x !== c.id),
        domain: c.domain,
        type: q.type,
        difficulty: Math.min(3, Math.max(1, q.difficulty)) as 1 | 2 | 3,
        stem: q.stem,
        options: r.options,
        explanation: r.explanation,
        keywordCues: q.keywordCues,
        docs: c.docs,
        es: r.es,
        heldOut: false,
        source: "generated",
        verification: { status: "pass", notes },
      };
    });
    const recall = g.recall
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => audit.recall.find((x) => x.index === i)?.verdict !== "fail")
      .map(({ r, i }) => ({ id: `${c.id}--r${i}`, conceptId: c.id, ...r }));
    if (questions.length < 2) {
      report.push(`${c.id}: solo ${questions.length} preguntas válidas — regenerar (pnpm content gen --concepts ${c.id})`);
    }
    if (!questions.length) continue;
    perConcept.push({ conceptId: c.id, card: { ...g.card, docs: c.docs }, questions, recall });
  }

  // Held-out bank: every concept with ≥ 3 questions reserves exactly one (lowest hash) for full mocks.
  // Stable per concept, so publishing more concepts later never moves an already-practised question
  // into the held-out set. Yields ~25% of the bank; every concept keeps ≥ 2 practice questions.
  for (const pc of perConcept) {
    if (pc.questions.length < 3) continue;
    pc.questions.slice().sort((a, b) => hash(a.id) - hash(b.id))[0].heldOut = true;
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const pc of perConcept) fs.writeFileSync(path.join(OUT, `${pc.conceptId}.json`), JSON.stringify(pc, null, 2));
  fs.writeFileSync(path.join(WORK, "finalize-report.txt"), report.join("\n"));
  const heldOut = perConcept.flatMap((p) => p.questions).filter((q) => q.heldOut).length;
  console.log(`Conceptos: ${perConcept.length}/${syllabus.concepts.length} · preguntas: ${kept} (reservadas ${heldOut}) · descartadas: ${dropped}`);
  console.log(`Detalle en content/.pipeline/finalize-report.txt`);
}

function hash(s: string) {
  return parseInt(createHash("md5").update(s).digest("hex").slice(0, 8), 16);
}

function status() {
  const gen = fs.readdirSync(STAGE).length;
  const ver = fs.readdirSync(VERIFY).filter((f) => f.endsWith(".audit.json")).length;
  const out = fs.readdirSync(OUT).length;
  const docs = fs.readdirSync(DOCS).length;
  console.log(`docs ${docs} · generados ${gen}/${syllabus.concepts.length} · verificados ${ver} · publicados ${out}`);
  console.log(`modelo generación ${MODEL} · verificación ${VERIFY_MODEL}`);
  for (const b of loadState().batches) console.log(`  batch ${b.kind} ${b.id} ${b.done ? "(recogido)" : ""}`);
}

async function main() {
  switch (cmd) {
    case "docs":
      return fetchDocs();
    case "models": {
      const list = await client().models.list();
      const ids: string[] = [];
      for await (const m of list) ids.push(m.id);
      console.log(ids.filter((id) => /^(gpt|o\d)/.test(id)).sort().join("\n"));
      return;
    }
    case "gen": {
      const onlyMissing = flag("only-missing");
      const list = selectConcepts((c) => !onlyMissing || !fs.existsSync(path.join(STAGE, `${c.id}.json`)));
      const reqs = list.map(genRequest);
      console.log(`Generando ${reqs.length} conceptos con ${MODEL}${flag("direct") ? " (directo)" : " (batch)"}`);
      return flag("direct") ? runDirect(reqs) : submitBatch("gen", reqs);
    }
    case "verify": {
      const list = selectConcepts((c) => fs.existsSync(path.join(STAGE, `${c.id}.json`)) && (flag("all") || !fs.existsSync(path.join(VERIFY, `${c.id}.audit.json`))));
      const reqs = list.flatMap((c) => verifyRequests(c, JSON.parse(fs.readFileSync(path.join(STAGE, `${c.id}.json`), "utf8"))));
      console.log(`Verificando ${list.length} conceptos con ${VERIFY_MODEL}${flag("direct") ? " (directo)" : " (batch)"}`);
      return flag("direct") ? runDirect(reqs) : submitBatch("verify", reqs);
    }
    case "fix-cards": {
      const list = selectConcepts((c) => {
        const a = path.join(VERIFY, `${c.id}.audit.json`);
        if (!fs.existsSync(a) || fs.existsSync(path.join(VERIFY, `${c.id}.cardfix.json`))) return false;
        return (JSON.parse(fs.readFileSync(a, "utf8")) as Audit).card.verdict === "fail";
      });
      const reqs = list.map((c) => {
        const g: Generated = JSON.parse(fs.readFileSync(path.join(STAGE, `${c.id}.json`), "utf8"));
        const a: Audit = JSON.parse(fs.readFileSync(path.join(VERIFY, `${c.id}.audit.json`), "utf8"));
        return cardFixRequest(c, g, a.card.factualIssues);
      });
      console.log(`Corrigiendo ${reqs.length} fichas con ${MODEL}`);
      return runDirect(reqs);
    }
    case "audit-units":
      return auditUnits();
    case "collect":
      return collect();
    case "finalize":
      return finalize();
    case "status":
      return status();
    default:
      console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
