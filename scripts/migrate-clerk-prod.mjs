#!/usr/bin/env node
/**
 * Move users from the Clerk development instance to production without losing progress.
 *
 * 1. Every dev user gets a production user with the same email and names
 *    (external_id = old dev id). Passwords cannot be exported from Clerk, so migrated users
 *    sign in with the email code (or "forgot password").
 * 2. Every table's user_id (and users.id) is rewritten dev id → prod id in one transaction.
 *
 * Dry run by default; nothing is written until --apply.
 *   CLERK_DEV_SECRET_KEY=sk_test_... CLERK_PROD_SECRET_KEY=sk_live_... \
 *     node --env-file=.env.local scripts/migrate-clerk-prod.mjs [--apply]
 *
 * Idempotent: users already in prod (same email) are reused; ids already remapped are skipped.
 * If a user signed in to prod before the remap, their empty prod row is replaced; if that
 * prod account already has progress the script stops for that user (resolve by hand).
 */
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const DEV = process.env.CLERK_DEV_SECRET_KEY;
const PROD = process.env.CLERK_PROD_SECRET_KEY;
if (!DEV?.startsWith("sk_test_")) throw new Error("CLERK_DEV_SECRET_KEY (sk_test_...) is required");
if (!PROD?.startsWith("sk_live_")) throw new Error("CLERK_PROD_SECRET_KEY (sk_live_...) is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const mask = (email) => email.replace(/^(.).*@/, "$1***@");

async function clerk(key, method, path, body) {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function allUsers(key) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const page = await clerk(key, "GET", `/users?limit=100&offset=${offset}&order_by=created_at`);
    out.push(...page);
    if (page.length < 100) return out;
  }
}

const primaryEmail = (u) =>
  (u.email_addresses.find((e) => e.id === u.primary_email_address_id) ?? u.email_addresses[0])?.email_address;

// 1. Clerk users
const devUsers = await allUsers(DEV);
const prodUsers = await allUsers(PROD);
const prodByEmail = new Map(prodUsers.flatMap((u) => u.email_addresses.map((e) => [e.email_address.toLowerCase(), u])));

const map = []; // { from, to, email }
for (const u of devUsers) {
  const email = primaryEmail(u);
  if (!email) {
    console.log(`skip ${u.id}: no email`);
    continue;
  }
  let prod = prodByEmail.get(email.toLowerCase());
  if (!prod) {
    const body = {
      email_address: [email],
      first_name: u.first_name ?? undefined,
      last_name: u.last_name ?? undefined,
      external_id: u.id,
      public_metadata: u.public_metadata ?? {},
      private_metadata: { ...(u.private_metadata ?? {}), migratedFromDev: u.id },
      skip_password_requirement: true,
      skip_legal_checks: true,
      created_at: new Date(u.created_at).toISOString(),
    };
    if (APPLY) prod = await clerk(PROD, "POST", "/users", body);
    console.log(`${APPLY ? "created" : "would create"} prod user for ${mask(email)}${prod ? ` → ${prod.id}` : ""}`);
  } else {
    console.log(`prod user exists for ${mask(email)} → ${prod.id}`);
  }
  map.push({ from: u.id, to: prod?.id ?? `<new prod id for ${u.id}>`, email: mask(email) });
}

// 2. Database remap
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const tables = (
  await sql`select table_name from information_schema.columns
            where column_name = 'user_id' and table_schema = 'public' order by 1`
).map((r) => r.table_name);

async function rowsFor(tx, id) {
  const counts = {};
  for (const t of tables) {
    const [{ n }] = await tx.unsafe(`select count(*)::int as n from "${t}" where user_id = $1`, [id]);
    if (n) counts[t] = n;
  }
  const [{ n }] = await tx`select count(*)::int as n from users where id = ${id}`;
  if (n) counts.users = n;
  return counts;
}

await sql.begin(async (tx) => {
  for (const m of map) {
    const from = await rowsFor(tx, m.from);
    if (!Object.keys(from).length) {
      console.log(`${m.email}: nothing to move (already remapped or no progress)`);
      continue;
    }
    if (!APPLY) {
      console.log(`${m.email}: would move ${JSON.stringify(from)} ${m.from} → ${m.to}`);
      continue;
    }
    const to = await rowsFor(tx, m.to);
    const toProgress = Object.keys(to).filter((k) => k !== "users");
    if (toProgress.length) throw new Error(`${m.email}: prod account ${m.to} already has progress in ${toProgress.join(", ")}; resolve by hand`);
    if (to.users) await tx`delete from users where id = ${m.to}`; // empty row from a sign-in before the remap
    for (const t of tables) await tx.unsafe(`update "${t}" set user_id = $1 where user_id = $2`, [m.to, m.from]);
    await tx`update users set id = ${m.to} where id = ${m.from}`;
    console.log(`${m.email}: moved ${JSON.stringify(from)} ${m.from} → ${m.to}`);
  }
});
await sql.end();

const admins = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const newAdmins = admins.map((a) => map.find((m) => m.from === a)?.to ?? a);
console.log(`\nADMIN_USER_IDS for production: ${newAdmins.join(",")}`);
console.log(APPLY ? "Done." : "Dry run only. Re-run with --apply to write.");
