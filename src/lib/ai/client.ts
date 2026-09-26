import "server-only";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt } from "../crypto";

export const MODELS = {
  smart: process.env.OPENAI_MODEL_SMART ?? "gpt-6-sol",
  fast: process.env.OPENAI_MODEL_FAST ?? "gpt-6-luna",
  tts: process.env.OPENAI_MODEL_TTS ?? "gpt-4o-mini-tts",
  stt: process.env.OPENAI_MODEL_STT ?? "gpt-transcribe",
};

/** USD per 1M tokens (input, output). Estimates — only used for the spend meter. */
const PRICES: Record<string, [number, number]> = {
  "gpt-6-astra": [10, 50],
  "gpt-6-sol": [2, 10],
  "gpt-6-luna": [0.1, 0.5],
  "gpt-5.5": [5, 30],
  "gpt-5.4-mini": [0.75, 4.5],
  "gpt-5.4-nano": [0.2, 1.25],
  "gpt-5.4": [2.5, 15],
  "gpt-5-mini": [0.25, 2],
  "gpt-5": [1.25, 10],
};
const TTS_USD_PER_MIN = 0.015;
const STT_USD_PER_MIN = 0.0045;

/** Usage paid with the server key (shared content such as cached narration). */
export const SYSTEM_USER = "system";

export class NoApiKeyError extends Error {
  constructor() {
    super("Agrega tu API key de OpenAI en Ajustes → IA para activar el tutor, la corrección y la voz.");
  }
}

export class BudgetExceededError extends Error {
  constructor(spent: number, cap: number) {
    super(`Llegaste a tu tope mensual de IA (US$${spent.toFixed(2)} / US$${cap}). Puedes subirlo en Ajustes → IA.`);
  }
}

const clients = new Map<string, OpenAI>();

/** OpenAI client with the user's own key (BYOK). */
export async function aiForUser(userId: string): Promise<OpenAI> {
  const [u] = await db
    .select({ enc: schema.users.openaiKeyEnc })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!u?.enc) throw new NoApiKeyError();
  const cacheKey = createHash("sha256").update(u.enc).digest("hex");
  let client = clients.get(cacheKey);
  if (!client) {
    client = new OpenAI({ apiKey: decrypt(u.enc) });
    clients.set(cacheKey, client);
  }
  return client;
}

/** Server key: only for shared, cached content (never for a user's session). */
export function systemAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY del servidor no está configurada");
  let client = clients.get(SYSTEM_USER);
  if (!client) {
    client = new OpenAI();
    clients.set(SYSTEM_USER, client);
  }
  return client;
}

function priceFor(model: string): [number, number] {
  const key = Object.keys(PRICES)
    .sort((a, b) => b.length - a.length)
    .find((k) => model.startsWith(k));
  return key ? PRICES[key] : [1.25, 10];
}

export async function recordUsage(u: {
  userId: string;
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
    userId: u.userId,
    purpose: u.purpose,
    model: u.model,
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    audioSeconds: u.audioSeconds ?? 0,
    costUsd: cost,
  });
}

function monthStart() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export async function monthSpend(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.aiUsage.costUsd}), 0)` })
    .from(schema.aiUsage)
    .where(and(eq(schema.aiUsage.userId, userId), gte(schema.aiUsage.createdAt, monthStart())));
  return Number(row?.total ?? 0);
}

export async function monthlyCap(userId: string): Promise<number> {
  const [u] = await db
    .select({ cap: schema.users.aiMonthlyCapUsd })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return u?.cap ?? 5;
}

/** The user's own key, within the cap they chose. */
export async function assertBudget(userId: string) {
  const [spent, cap] = await Promise.all([monthSpend(userId), monthlyCap(userId)]);
  if (spent >= cap) throw new BudgetExceededError(spent, cap);
}
