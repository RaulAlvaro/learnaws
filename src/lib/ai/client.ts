import "server-only";
import OpenAI from "openai";
import { gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export const MODELS = {
  smart: process.env.OPENAI_MODEL_SMART ?? "gpt-5",
  fast: process.env.OPENAI_MODEL_FAST ?? "gpt-5-mini",
  tts: process.env.OPENAI_MODEL_TTS ?? "gpt-4o-mini-tts",
  stt: process.env.OPENAI_MODEL_STT ?? "gpt-4o-transcribe",
};

/** USD per 1M tokens (input, output). Estimates — only used for the spend meter. */
const PRICES: Record<string, [number, number]> = {
  "gpt-5": [1.25, 10],
  "gpt-5-mini": [0.25, 2],
  "gpt-5-nano": [0.05, 0.4],
};
const TTS_USD_PER_MIN = 0.015;
const STT_USD_PER_MIN = 0.006;

export const MONTHLY_CAP_USD = Number(process.env.AI_MONTHLY_CAP_USD ?? 20);

let client: OpenAI | null = null;
export function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no está configurada");
  client ??= new OpenAI();
  return client;
}

function priceFor(model: string): [number, number] {
  const key = Object.keys(PRICES)
    .sort((a, b) => b.length - a.length)
    .find((k) => model.startsWith(k));
  return key ? PRICES[key] : [1.25, 10];
}

export async function recordUsage(u: {
  purpose: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  kind?: "text" | "tts" | "stt";
}) {
  const [pin, pout] = priceFor(u.model);
  const audioMin = (u.audioSeconds ?? 0) / 60;
  const cost =
    u.kind === "tts"
      ? audioMin * TTS_USD_PER_MIN
      : u.kind === "stt"
        ? audioMin * STT_USD_PER_MIN
        : ((u.inputTokens ?? 0) * pin + (u.outputTokens ?? 0) * pout) / 1_000_000;
  await db.insert(schema.aiUsage).values({
    purpose: u.purpose,
    model: u.model,
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    audioSeconds: u.audioSeconds ?? 0,
    costUsd: cost,
  });
}

export async function monthSpend(): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.aiUsage.costUsd}), 0)` })
    .from(schema.aiUsage)
    .where(gte(schema.aiUsage.createdAt, start));
  return Number(row?.total ?? 0);
}

export class BudgetExceededError extends Error {
  constructor(spent: number) {
    super(`Tope mensual de IA alcanzado (US$${spent.toFixed(2)} / US$${MONTHLY_CAP_USD})`);
  }
}

export async function assertBudget() {
  const spent = await monthSpend();
  if (spent >= MONTHLY_CAP_USD) throw new BudgetExceededError(spent);
}
