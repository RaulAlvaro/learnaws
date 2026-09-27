// Music check: hub plays the title loop after the first tap, a round switches to a level track,
// the toggle stops it. Needs a dev server with AUTH_BYPASS.
//   node scripts/ui-music.mjs http://localhost:3100 <screenshots-dir>
import { chromium } from "playwright";
import fs from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "shots-music";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--autoplay-policy=user-gesture-required"] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on("response", (r) => r.status() >= 400 && r.url().includes("/audio/") && problems.push(`HTTP ${r.status()} ${r.url()}`));
const track = () => page.evaluate(() => document.documentElement.dataset.music ?? "");
const waitTrack = async (re, ms = 8000) => {
  for (let t = 0; t < ms; t += 250) {
    const v = await track();
    if (re.test(v)) return v;
    await page.waitForTimeout(250);
  }
  return `timeout (${await track()})`;
};

await page.goto(`${base}/`, { waitUntil: "networkidle" });
if (await page.getByRole("button", { name: "Entendido" }).count()) await page.getByRole("button", { name: "Entendido" }).click();
await page.getByRole("button", { name: /Jugar/ }).waitFor({ timeout: 30_000 });
const beforeGesture = await track();
await page.mouse.click(5, 300); // first gesture unlocks audio
const hub = await waitTrack(/^title$/);
await page.screenshot({ path: `${out}/01-hub.png` });
if (await page.getByRole("button", { name: /Voz sí/ }).count()) await page.getByRole("button", { name: /Voz sí/ }).click();
await page.getByRole("button", { name: /Jugar/ }).click();
const round = await waitTrack(/^level\d$/);
await page.getByRole("button", { name: /Salir|Terminar|Volver/ }).first().click().catch(() => {});
await page.waitForTimeout(800);
if (await page.getByRole("button", { name: /Música sí/ }).count()) {
  await page.getByRole("button", { name: /Música sí/ }).click();
}
const off = await waitTrack(/^$/);
await page.screenshot({ path: `${out}/02-off.png` });
await page.getByRole("button", { name: /Música no/ }).click().catch(() => {});
const on = await waitTrack(/^title$/);
await browser.close();
console.log({ beforeGesture, hub, round, off: off === "" ? "stopped" : off, on });
console.log(problems.length ? problems.join("\n") : "music UI OK");
