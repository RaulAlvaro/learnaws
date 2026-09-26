import OpenAI from "openai";
import { NextResponse } from "next/server";
import { BudgetExceededError, NoApiKeyError } from "../ai/client";
import { UnauthorizedError } from "../auth";
import { RateLimitError } from "./rate-limit";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

/** Wraps a handler so thrown errors become friendly JSON. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof UnauthorizedError) return fail(e.message, 401);
      if (e instanceof NoApiKeyError) return fail(e.message, 412, "no-api-key");
      if (e instanceof BudgetExceededError) return fail(e.message, 402, "budget");
      if (e instanceof RateLimitError) return fail(e.message, 429, "rate-limit");
      if (e instanceof OpenAI.APIError) {
        console.error("openai", e.status, e.message);
        if (e.status === 401) {
          return fail("OpenAI rechazó tu API key. Revísala en Ajustes → IA.", 412, "bad-api-key");
        }
        if (e.status === 429 && /credits|quota|billing/i.test(e.message)) {
          return fail("Tu cuenta de OpenAI no tiene saldo. Puedes seguir con «Ver explicación».", 402, "no-credits");
        }
        if (e.status === 429) return fail("La IA está saturada en este momento; intenta de nuevo en un minuto.", 503);
        return fail("La IA falló al responder; intenta de nuevo o sigue con «Ver explicación».", 502);
      }
      console.error(e);
      return fail(e instanceof Error ? e.message : "Error inesperado", 500);
    }
  };
}
