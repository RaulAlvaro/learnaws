import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./db";
import { reminderTick } from "./lib/push";

export async function start() {
  if (process.env.NEXT_PHASE === "phase-production-build" || !process.env.DATABASE_URL) return;
  // Apply pending migrations on boot (single instance, so no locking dance needed).
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  // A simple in-process timer is enough for one daily push.
  setInterval(() => {
    reminderTick().catch((e) => console.error("reminder", e));
  }, 60_000);
}
