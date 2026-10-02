// Event check: a new player sees the event in the welcome notice, plays the 5 timed questions,
// takes the selfie with Nubi (Chromium fake camera) and lands on the leaderboard.
// Needs a dev server with AUTH_BYPASS=1, EVENT_FAKE_NOW on event day and a throwaway DATABASE_URL.
//   node scripts/ui-event.mjs http://localhost:3100 <screenshots-dir>
import { chromium } from "playwright";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "shots-event";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["camera"] });
const page = await ctx.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on("response", (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));
let n = 0;
const shot = (name, fullPage = false) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage });

await page.goto(`${base}/`, { waitUntil: "networkidle" });
await page.getByText(/quiero participar/).waitFor({ timeout: 30_000 });
await shot("welcome-with-event");
await page.getByRole("button", { name: /quiero participar/ }).click();
await page.waitForURL(/\/events\//);
await page.getByRole("button", { name: /Jugar/ }).waitFor();
await shot("event-home", true);
await page.getByRole("button", { name: /Jugar/ }).click();

const scores = [];
for (let i = 0; i < 5; i++) {
  await page.getByText(new RegExp(`^${i + 1}/5$`)).waitFor({ timeout: 15_000 });
  if (i === 0) await shot("question");
  // answer quickly; the last one is left to time out to check the timer path
  if (i < 4) await page.locator("button.min-h-28").nth(i % 4).click();
  await page.getByText(/¡Correcto!|Incorrecto|Se acabó el tiempo/).waitFor({ timeout: 30_000 });
  scores.push(await page.getByText(/^\+\d+$/).innerText());
  if (i === 0) await shot("answered");
  await page.getByRole("button", { name: /Siguiente|Ver mi resultado/ }).click();
}
await page.getByText(/Puesto \d+ de \d+/).waitFor({ timeout: 15_000 });
await shot("result", true);

await page.getByRole("button", { name: /selfie con la mascota/ }).click();
await page.getByRole("button", { name: /A la izquierda/ }).click();
await page.waitForFunction(() => (document.querySelector("video")?.videoWidth ?? 0) > 0, null, { timeout: 15_000 });
await shot("selfie-preview");
await page.getByRole("button", { name: /Tomar foto/ }).click();
await page.getByAltText("Tu selfie con la mascota").waitFor({ timeout: 15_000 });
await shot("selfie-card");
await page.getByRole("checkbox").check();
await page.getByRole("button", { name: /Usar en el ranking/ }).click();
await page.getByText("Tu selfie está en el ranking.").waitFor({ timeout: 15_000 });
await shot("result-with-photo", true);

await page.goto(`${base}/`, { waitUntil: "networkidle" });
await page.getByText(/Ranking de/).waitFor({ timeout: 15_000 });
await shot("hub-after");

await browser.close();
console.log({ scores });
console.log(problems.length ? problems.join("\n") : "event UI OK");
