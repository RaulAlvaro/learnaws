// Renders an A4 poster (poster.html in a marketing folder) to a PDF (print) and PNG (sharing).
// Inlines game-icons (assets/sprites/icons, CC BY 3.0) for {{icon:name}} and a star for {{star}}.
//   node scripts/build-poster.mjs [folder] [output-name]
//   node scripts/build-poster.mjs marketing/event-poster aws-community-day-peru-2026-a4
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? "marketing/poster";
const name = process.argv[3] ?? "learnaws-poster-a4";
const iconSvg = (name) => {
  const svg = fs.readFileSync(path.join("assets/sprites/icons", `${name}.svg`), "utf8");
  const d = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "M0 0h512v512H0z");
  return `<svg class="icon" viewBox="0 0 512 512" aria-hidden="true"><path d="${d.join(" ")}"/></svg>`;
};
const STAR = `<svg viewBox="0 0 100 100" aria-hidden="true"><polygon fill="currentColor" points="50,4 61,37 97,37 68,58 79,93 50,72 21,93 32,58 3,37 39,37"/></svg>`;

const html = fs
  .readFileSync(path.join(dir, "poster.html"), "utf8")
  .replace(/\{\{icon:([a-z0-9-]+)\}\}/g, (_, n) => iconSvg(n))
  .replaceAll("{{star}}", STAR);
const built = path.join(dir, ".poster.built.html");
fs.writeFileSync(built, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 3 });
await page.goto(`file://${path.resolve(built)}`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const overflow = await page.evaluate(() => {
  const p = document.querySelector(".page");
  const over = p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1;
  return over && `${p.scrollWidth}x${p.scrollHeight} > ${p.clientWidth}x${p.clientHeight}`;
});
await page.pdf({ path: path.join(dir, `${name}.pdf`), format: "A4", printBackground: true, preferCSSPageSize: true });
const png = await page.screenshot({ fullPage: false });
// An image viewer holding the PNG open makes Windows refuse the write for a moment; retry.
for (let i = 0; ; i++) {
  try {
    fs.writeFileSync(path.join(dir, `${name}.png`), png);
    break;
  } catch (e) {
    if (i >= 10) throw e;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
await browser.close();
fs.rmSync(built);
console.log(overflow ? `WARNING: content overflows the A4 page (${overflow})` : "poster OK (A4 PDF + PNG at 3x)");
