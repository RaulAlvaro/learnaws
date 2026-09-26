// M1 UI check: hub → full round of 8 → result.
//   node scripts/ui-play.mjs http://localhost:3100 <screenshots-dir>
import { chromium } from "playwright";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "shots-play";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on("response", (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));
let n = 0;
const shot = (name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true });

await page.goto(`${base}/`, { waitUntil: "networkidle" });
if (await page.getByRole("button", { name: "Entendido" }).count()) await page.getByRole("button", { name: "Entendido" }).click();
await page.getByRole("button", { name: /Jugar/ }).waitFor({ timeout: 30_000 });
await shot("hub");
// turn auto-read off for the test (no audio in headless)
if (await page.getByRole("button", { name: /Voz sí/ }).count()) await page.getByRole("button", { name: /Voz sí/ }).click();
await page.getByRole("button", { name: /Jugar/ }).click();

let answered = 0;
for (let step = 0; step < 30 && answered < 8; step++) {
  await page.waitForTimeout(400);
  if (await page.getByText(/Ronda brillante|Buena ronda|Sembrando/).count()) break;
  const card = page.getByRole("button", { name: /^A jugar$/ });
  if (await card.count()) {
    if (step < 4) await shot(`card-${step}`);
    await card.click();
    continue;
  }
  const conf = page.getByRole("button", { name: /Bastante/ });
  await conf.waitFor({ timeout: 30_000 });
  const opts = page.locator("button:has(span[aria-hidden])");
  const need = (await page.getByText(/^Elige 2$/).count()) ? 2 : 1;
  const cnt = await opts.count();
  for (let k = 0; k < need; k++) await opts.nth((answered + k) % cnt).click();
  if (answered === 0) await shot("question");
  await conf.click();
  await page.getByText(/¡Correcto!|¡Casi!/).first().waitFor({ timeout: 30_000 });
  answered++;
  if (await page.getByText("¡Casi!").count()) {
    if (answered <= 2) await shot(`wrong-${answered}`);
    await page.getByRole("button", { name: "Ver respuesta" }).click();
  }
  await page.getByRole("button", { name: /^Siguiente$/ }).waitFor();
  if (answered <= 2) {
    await page.getByRole("button", { name: /¿Por qué\?/ }).click();
    await shot(`revealed-${answered}`);
  }
  await page.getByRole("button", { name: /^Siguiente$/ }).click();
}
await page.getByText(/Ronda brillante|Buena ronda|Sembrando/).waitFor({ timeout: 30_000 });
await page.waitForTimeout(1200);
await shot("result");
await page.getByRole("button", { name: /Terminar por ahora/ }).click();
await page.waitForTimeout(800);
await shot("hub-after");
await page.goto(`${base}/progress`, { waitUntil: "networkidle" });
await shot("progress");

await browser.close();
console.log(`answered ${answered}`);
console.log(problems.length ? problems.join("\n") : "M1 UI OK");
