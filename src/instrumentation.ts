export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL) return;

  // Apply pending migrations on boot (single instance, so no locking dance needed).
  const path = await import("node:path");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db } = await import("./db");
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  const { reminderTick } = await import("./lib/push");
  // A simple in-process timer is enough for one daily push.
  setInterval(() => {
    reminderTick().catch((e) => console.error("reminder", e));
  }, 60_000);
}
