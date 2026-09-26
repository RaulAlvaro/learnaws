// M2 check: a post-diagnostic round shows "Descubrir" before new concepts, then lightning items.
//   node scripts/ui-discover-round.mjs http://localhost:3100 <screenshots-dir>
import { chromium } from "playwright";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "shots-m2-round";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on("response", (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));
let n = 0;
const shot = (name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true });

await page.goto(`${base}/`, { waitUntil: "networkidle" });
if (await page.getByRole("button", { name: /Voz sí/ }).count()) await page.getByRole("button", { name: /Voz sí/ }).click();
await page.getByRole("button", { name: /Jugar/ }).click();

let discovers = 0;
let lightning = 0;
let answered = 0;
for (let step = 0; step < 60 && answered < 8; step++) {
  await page.waitForTimeout(500);
  if (await page.getByText("Ronda completa").count()) break;
  if (await page.getByText(/nuevo servicio/i).count()) {
    discovers++;
    if (discovers === 1) await shot("discover");
    for (let k = 0; k < 10; k++) {
      const b = page.getByRole("button", { name: /Siguiente|Ver resumen|A practicar/ });
      if (!(await b.count())) break;
      const label = await b.first().innerText();
      await b.first().click();
      await page.waitForTimeout(label.includes("practicar") ? 1500 : 250);
      if (label.includes("practicar")) break;
    }
    continue;
  }
  const card = page.getByRole("button", { name: /Entendido, a jugar/ });
  if (await card.count()) {
    await card.click();
    continue;
  }
  const conf = page.getByRole("button", { name: /Bastante/ });
  if (!(await conf.count())) continue;
  const stem = await page.locator("p.leading-relaxed").first().innerText();
  const short = stem.split(/\s+/).length <= 25;
  if (short) lightning++;
  const opts = page.locator("button:has(span[aria-hidden])");
  const need = (await page.getByText(/^Elige 2$/).count()) ? 2 : 1;
  for (let k = 0; k < need; k++) await opts.nth(k).click();
  if (short && lightning === 1) await shot("lightning");
  await conf.click();
  await page.getByText(/¡Correcto!|Casi\./).first().waitFor({ timeout: 30_000 });
  answered++;
  if (await page.getByText("¡Casi!").count()) await page.getByRole("button", { name: "Ver respuesta" }).click();
  await page.getByRole("button", { name: /^Siguiente$/ }).click();
}
await shot("end");
await browser.close();
console.log({ discovers, lightning, answered });
console.log(problems.length ? problems.join("\n") : "M2 round OK");
