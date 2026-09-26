// Expert check: answer a question, open "Pregúntale al experto", ask by text, then talk by voice
// (Chromium fake microphone). Needs a dev server with AUTH_BYPASS and a test user with an API key.
//   node scripts/ui-expert.mjs http://localhost:3100 <screenshots-dir>
import { chromium } from "playwright";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "shots-expert";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone"] });
const page = await ctx.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on("response", (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));

await page.goto(`${base}/`, { waitUntil: "networkidle" });
if (await page.getByRole("button", { name: /Voz sí/ }).count()) await page.getByRole("button", { name: /Voz sí/ }).click();
await page.getByRole("button", { name: /Jugar/ }).click();

// Get to a question and answer it.
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(600);
  const card = page.getByRole("button", { name: /^A jugar$|^Siguiente$|^Ver resumen$|A practicar/ });
  if (await page.getByRole("button", { name: /Bastante/ }).count()) break;
  if (await card.count()) await card.first().click();
}
const opts = page.locator("button:has(span[aria-hidden])");
const need = (await page.getByText(/^Elige 2$/).count()) ? 2 : 1;
for (let k = 0; k < need; k++) await opts.nth(k).click();
await page.getByRole("button", { name: /Bastante/ }).click();
await page.getByText(/¡Correcto!|¡Casi!/).first().waitFor({ timeout: 30_000 });

await page.getByRole("button", { name: /Pregúntale al experto/ }).click();
await page.getByText("Experto AWS").waitFor();
await page.getByRole("button", { name: /¿Cómo lo reconozco en el examen\?/ }).click();
// wait for a streamed answer with at least some text
await page.waitForFunction(() => {
  const bubbles = [...document.querySelectorAll('[role="dialog"] .bg-card-2')];
  return bubbles.some((b) => (b.textContent ?? "").length > 80);
}, null, { timeout: 60_000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/01-text.png`, fullPage: false });
const textAnswer = await page.locator('[role="dialog"] .bg-card-2').last().innerText();

// Voice: connect and wait for the expert to start talking (it opens the conversation).
await page.getByRole("button", { name: /Hablar con el experto/ }).click();
let spoke = false;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1000);
  if (await page.getByText(/El experto habla|Te escucho/).count()) spoke = true;
  const voiceBubbles = await page.locator('[role="dialog"] svg + *').count();
  if (spoke && voiceBubbles >= 0 && i > 6) break;
}
await page.screenshot({ path: `${out}/02-voice.png`, fullPage: false });
const errorText = (await page.locator('[role="dialog"] .bg-bad-bg').count()) ? await page.locator('[role="dialog"] .bg-bad-bg').innerText() : null;
if (await page.getByRole("button", { name: /Terminar conversación/ }).count()) await page.getByRole("button", { name: /Terminar conversación/ }).click();
await page.waitForTimeout(800);

await browser.close();
console.log({ textAnswer: textAnswer.slice(0, 300), voiceReachedSpeaking: spoke, errorText });
console.log(problems.length ? problems.join("\n") : "expert UI OK");
