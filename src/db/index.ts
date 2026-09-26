import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/learnaws", { max: 5, onnotice: () => {} });
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
