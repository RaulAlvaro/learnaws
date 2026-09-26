/** Lints every unit diagram with the real layout: overlaps and effective text size on a phone. */
import fs from "node:fs";
import { layoutDiagram } from "../src/lib/game/diagram-layout";
import type { UnitContent } from "../src/lib/content/types";

const PHONE = 340;
const rows: string[] = [];
let bad = 0;
for (const f of fs.readdirSync("content/units").filter((x) => x.endsWith(".json"))) {
  const u: UnitContent = JSON.parse(fs.readFileSync(`content/units/${f}`, "utf8"));
  const l = layoutDiagram(u.overview.diagram, PHONE);
  const scale = Math.min(1.25, PHONE / l.width, 620 / l.height);
  const font = 15 * scale;
  let overlaps = 0;
  for (let i = 0; i < l.nodes.length; i++)
    for (let j = i + 1; j < l.nodes.length; j++) {
      const a = l.nodes[i];
      const b = l.nodes[j];
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) overlaps++;
    }
  const flag = font < 11 || overlaps > 0;
  if (flag) bad++;
  rows.push(`${flag ? "!!" : "ok"} ${u.unitId.padEnd(28)} ${l.rankdir} ${Math.round(l.width)}x${Math.round(l.height)} font ${font.toFixed(1)}px overlaps ${overlaps}`);
}
console.log(rows.sort().join("\n"));
console.log(`\n${bad} diagramas con problemas`);
