import OpenAI from "openai";
import { NextResponse } from "next/server";
import { BudgetExceededError } from "../ai/client";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Wraps a handler so thrown errors become JSON (budget errors → 402). */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof BudgetExceededError) return fail(e.message, 402);
      if (e instanceof OpenAI.APIError) {
        console.error("openai", e.status, e.message);
        if (e.status === 429 && /credits|quota|billing/i.test(e.message)) {
          return fail("La IA no está disponible: la cuenta de OpenAI no tiene saldo. Puedes seguir con «Ver explicación».", 402);
        }
        if (e.status === 429) return fail("La IA está saturada en este momento; intenta de nuevo en un minuto.", 503);
        return fail("La IA falló al responder; intenta de nuevo o sigue con «Ver explicación».", 502);
      }
      console.error(e);
      return fail(e instanceof Error ? e.message : "Error inesperado", 500);
    }
  };
}
