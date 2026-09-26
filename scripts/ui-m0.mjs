// M0 UI check: privacy notice, settings (BYOK), feedback, tutor without key, admin.
//   node scripts/ui-m0.mjs http://localhost:3100 <screenshots-dir>
import { chromium } from "playwright";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "shots-m0";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on("response", (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));
let n = 0;
const shot = (name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true });

await page.goto(`${base}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
if (await page.getByText("Bienvenido a Learn AWS").count()) {
await shot("privacy");
await page.getByRole("button", { name: "Entendido" }).click();
await page.getByText("Bienvenido a Learn AWS").waitFor({ state: "detached", timeout: 5000 });
await page.waitForResponse((r) => r.url().includes("/api/me")).catch(() => {});
await page.reload({ waitUntil: "networkidle" });
if (await page.getByText("Bienvenido a Learn AWS").count()) problems.push("privacy ack not persisted");
}

// Tutor without key → friendly message with link to settings
await page.goto(`${base}/study`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Responder" }).waitFor({ timeout: 30_000 });
for (let i = 0; i < 4; i++) {
  const opts = page.locator("button:has(span.rounded-full)");
  if (await page.getByText(/elige 2/i).count()) {
    await opts.nth(0).click();
    await opts.nth(1).click();
  } else await opts.nth(i % 4).click();
  await page.getByRole("button", { name: "Bastante seguro" }).click();
  await page.getByRole("button", { name: "Responder" }).click();
  await page.getByText(/^(Correcto|Incorrecto)$/).first().waitFor({ timeout: 60_000 });
  if (await page.getByRole("button", { name: "Pedir pista" }).count()) {
    await page.getByRole("button", { name: "Pedir pista" }).click();
    await page.getByText(/API key/).first().waitFor({ timeout: 30_000 });
    await shot("tutor-no-key");
    break;
  }
  await page.getByRole("button", { name: /Siguiente|Saltar/ }).first().click();
  await page.getByRole("button", { name: "Responder" }).waitFor({ timeout: 30_000 });
}

// Settings: invalid key is rejected
await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
await page.getByPlaceholder("sk-…").fill("sk-this-is-not-a-real-key-000000000000");
await page.getByPlaceholder("sk-…").locator("xpath=following-sibling::button").click();
await page.getByText(/rechazó|validar/).waitFor({ timeout: 30_000 });
await shot("settings-bad-key");

// Feedback
await page.getByRole("button", { name: "Enviar comentario" }).click();
await page.getByPlaceholder(/Cuéntanos/).fill("Prueba automática de feedback");
await page.getByRole("button", { name: "Enviar", exact: true }).click();
await page.getByText("¡Gracias!").waitFor();

// Admin
await page.goto(`${base}/more`, { waitUntil: "networkidle" });
await shot("more");
await page.goto(`${base}/admin`, { waitUntil: "networkidle" });
await shot("admin");
if (!(await page.getByText("Prueba automática de feedback").count())) problems.push("feedback not visible in admin");

await browser.close();
console.log(problems.length ? problems.join("\n") : "M0 UI OK");
