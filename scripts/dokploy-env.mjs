#!/usr/bin/env node
/**
 * Merge KEY=VALUE lines from a file into the Dokploy app's environment
 * (NEXT_PUBLIC_* also go to build args, since Next inlines them at build time).
 * Values are never printed.
 *
 *   node scripts/dokploy-env.mjs <file-with-KEY=VALUE-lines>
 *   node scripts/dokploy-env.mjs --list        # key names only
 *
 * Credentials come from the `vps` CLI profile (~/.vps/config.json).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP = JSON.parse(fs.readFileSync(new URL("./dokploy.json", import.meta.url), "utf8"));

function profile() {
  const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".vps", "config.json"), "utf8"));
  const name = process.env.VPS_PROFILE ?? APP.profile ?? cfg.active;
  const p = cfg.profiles?.[name] ?? cfg.profiles?.[cfg.active] ?? cfg;
  if (!p?.domain || !p?.apiKey) throw new Error(`Perfil vps "${name}" sin domain/apiKey`);
  return p;
}

async function api(method, route, body) {
  const p = profile();
  const url = `${p.domain.replace(/\/$/, "")}/api/${route}`;
  const res = await fetch(url, {
    method,
    headers: { "x-api-key": p.apiKey, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${route}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function parse(text) {
  const out = new Map();
  for (const line of (text ?? "").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}
const serialize = (map) => [...map].map(([k, v]) => `${k}=${v}`).join("\n");

const app = await api("GET", `application.one?applicationId=${APP.applicationId}`);
const env = parse(app.env);
const buildArgs = parse(app.buildArgs);

if (process.argv[2] === "--list") {
  console.log(`env: ${[...env.keys()].join(", ") || "(vacío)"}`);
  console.log(`buildArgs: ${[...buildArgs.keys()].join(", ") || "(vacío)"}`);
  process.exit(0);
}

const file = process.argv[2];
if (!file) throw new Error("Uso: node scripts/dokploy-env.mjs <archivo>");
const updates = parse(fs.readFileSync(file, "utf8"));
for (const [k, v] of updates) {
  env.set(k, v);
  if (k.startsWith("NEXT_PUBLIC_")) buildArgs.set(k, v);
}
await api("POST", "application.saveEnvironment", {
  applicationId: APP.applicationId,
  env: serialize(env),
  buildArgs: serialize(buildArgs),
  buildSecrets: app.buildSecrets ?? "",
  createEnvFile: app.createEnvFile ?? true,
});
console.log(`Dokploy: ${updates.size} variable(s) actualizadas (${[...updates.keys()].join(", ")})`);
