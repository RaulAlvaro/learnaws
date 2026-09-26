// UI walkthrough with Playwright against a local dev server (AUTH_BYPASS=1, test DB).
//   node scripts/ui-walkthrough.mjs http://localhost:3100 <screenshots-dir>
import { chromium } from "playwright";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "shots";
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: "dark" });
const page = await ctx.newPage();
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text().slice(0, 200)}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on("response", (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));
let n = 0;
const shot = async (name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true });

await page.goto(`${base}/`, { waitUntil: "networkidle" });
await shot("home-empty");

// Diagnostic: answer 6 questions (first "A", then whatever), exercising both paths.
await page.goto(`${base}/study`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Responder" }).waitFor({ timeout: 30_000 });
await shot("diagnostic-question");
for (let i = 0; i < 6; i++) {
  const opts = page.locator("button:has(span.rounded-full)");
  const multi = await page.getByText(/elige 2/i).count();
  await opts.nth(i % 4).click();
  if (multi) await opts.nth((i + 1) % 4).click();
  await page.getByRole("button", { name: "Bastante seguro" }).click();
  if (i === 0) await shot("diagnostic-ready");
  await page.getByRole("button", { name: "Responder" }).click();
  await page.getByText(/^(Correcto|Incorrecto)$/).first().waitFor({ timeout: 60_000 });
  if (await page.getByRole("button", { name: "Ver explicación" }).count()) {
    if (i < 2) await shot(`wrong-${i}`);
    if (i === 1) {
      await page.getByRole("button", { name: "Pedir pista" }).click();
      await page.waitForTimeout(3000);
      await shot("hint-attempt");
    }
    await page.getByRole("button", { name: "Ver explicación" }).click();
    await page.getByRole("button", { name: "Siguiente" }).waitFor({ timeout: 30_000 });
  }
  if (i < 3) await shot(`revealed-${i}`);
  const skip = page.getByRole("button", { name: "Saltar" });
  if (await skip.count()) await skip.click();
  else await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Responder" }).or(page.getByRole("button", { name: /Entendido/ })).first().waitFor({ timeout: 30_000 });
}

await page.getByRole("button", { name: /español/i }).first().click().catch(() => {});
await shot("spanish-toggle");

for (const path of ["/", "/mock", "/errors", "/concepts", "/labs", "/labs/lab-01-vpc-from-scratch", "/guide", "/settings", "/voice", "/more"]) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await shot(path === "/" ? "home-after" : path.replaceAll("/", "_").slice(1));
}

// Mini mock: answer 3, submit, review.
await page.goto(`${base}/mock`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Mini simulacro" }).click();
await page.waitForURL(/\/mock\/\d+/);
await page.getByRole("button", { name: /Terminar|Siguiente/ }).first().waitFor();
await shot("mock-taking");
for (let i = 0; i < 3; i++) {
  await page.locator("button:has(span.font-semibold)").first().click();
  await page.getByRole("button", { name: "Siguiente" }).click();
}
await page.getByRole("button", { name: /Entregar ahora/ }).click();
await page.getByText("Resultado").waitFor({ timeout: 30_000 });
await shot("mock-review");

// Desktop layout check.
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${base}/study`, { waitUntil: "networkidle" });
await shot("desktop-study");

await browser.close();
console.log(problems.length ? problems.join("\n") : "no console/page/5xx errors");
