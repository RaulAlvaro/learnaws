import { chromium } from "playwright";
const out = process.argv[2];
const unit = process.argv[3] ?? "sqs";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto(`http://localhost:3100/dev/discover/${unit}`, { waitUntil: "networkidle" });
let i = 0;
for (; i < 10; i++) {
  await page.waitForTimeout(700);
  if (i === 0 || i === 2 || i === 5) await page.screenshot({ path: `${out}/${unit}-seg${i}.png`, fullPage: true });
  const next = page.getByRole("button", { name: /Siguiente|Ver resumen/ });
  if (!(await next.count())) break;
  await next.click();
}
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/${unit}-summary.png`, fullPage: true });
await browser.close();
console.log(errs.length ? errs.join("\n") : `ok (${i} segments)`);
