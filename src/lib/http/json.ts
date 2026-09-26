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
      console.error(e);
      return fail(e instanceof Error ? e.message : "Error inesperado", 500);
    }
  };
}
