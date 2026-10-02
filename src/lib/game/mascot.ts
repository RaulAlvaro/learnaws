/**
 * "Nubi", the app's own cloud mascot (original art, not an AWS trademark), in three poses
 * for the event selfie. Plain SVG strings so the same art renders in <img> and on a canvas.
 */
export type MascotPose = "wave" | "party" | "point";

export const MASCOT_POSES: { pose: MascotPose; label: string }[] = [
  { pose: "wave", label: "Saludo" },
  { pose: "party", label: "Festejo" },
  { pose: "point", label: "Señala" },
];

const INK = "#1c1840";
const BODY = "#ff9900";
const SHADE = "#e07800";

// Cloud = union of circles: an ink pass (thick stroke) underneath a fill pass gives one clean outline.
const BLOBS = [
  [100, 128, 60],
  [50, 142, 36],
  [150, 142, 36],
  [72, 92, 34],
  [126, 84, 44],
] as const;

function arm(x1: number, y1: number, x2: number, y2: number) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="22" stroke-linecap="round"/>
<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${BODY}" stroke-width="11" stroke-linecap="round"/>
<circle cx="${x2}" cy="${y2}" r="11" fill="${BODY}" stroke="${INK}" stroke-width="5.5"/>`;
}

const sparkle = (x: number, y: number, s: number, fill = "#ffc933") =>
  `<path d="M${x} ${y - s} Q${x + s * 0.2} ${y - s * 0.2} ${x + s} ${y} Q${x + s * 0.2} ${y + s * 0.2} ${x} ${y + s} Q${x - s * 0.2} ${y + s * 0.2} ${x - s} ${y} Q${x - s * 0.2} ${y - s * 0.2} ${x} ${y - s}Z" fill="${fill}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;

const ARMS: Record<MascotPose, string> = {
  wave: `${arm(42, 160, 22, 190)}${arm(156, 146, 186, 92)}
<path d="M196 70 q10 8 6 20 M206 62 q14 12 8 30" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`,
  party: `${arm(46, 146, 16, 92)}${arm(154, 146, 184, 92)}${sparkle(20, 50, 13)}${sparkle(184, 44, 11, "#3d8bff")}${sparkle(104, 18, 9, "#f2545b")}`,
  point: `${arm(48, 170, 4, 164)}${arm(156, 160, 178, 192)}
<path d="M-14 150 l-12 -8 M-16 164 h-14 M-14 178 l-12 8" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`,
};

export function mascotSvg(pose: MascotPose): string {
  const ink = BLOBS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}" stroke="${INK}" stroke-width="16"/>`).join("");
  const fill = BLOBS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${BODY}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 0 280 240" width="560" height="480">
<ellipse cx="100" cy="226" rx="70" ry="9" fill="${INK}" opacity="0.25"/>
<rect x="66" y="180" width="26" height="34" rx="12" fill="${SHADE}" stroke="${INK}" stroke-width="7"/>
<rect x="108" y="180" width="26" height="34" rx="12" fill="${SHADE}" stroke="${INK}" stroke-width="7"/>
${ink}<rect x="34" y="128" width="132" height="58" rx="26" fill="${INK}" stroke="${INK}" stroke-width="16"/>
${fill}<rect x="34" y="128" width="132" height="58" rx="26" fill="${BODY}"/>
<ellipse cx="114" cy="70" rx="22" ry="10" fill="#ffffff" opacity="0.45" transform="rotate(-18 114 70)"/>
<ellipse cx="80" cy="128" rx="9" ry="12" fill="${INK}"/><ellipse cx="120" cy="128" rx="9" ry="12" fill="${INK}"/>
<circle cx="83" cy="123" r="3.6" fill="#fff"/><circle cx="123" cy="123" r="3.6" fill="#fff"/>
<ellipse cx="62" cy="148" rx="10" ry="6" fill="#f2545b" opacity="0.6"/><ellipse cx="138" cy="148" rx="10" ry="6" fill="#f2545b" opacity="0.6"/>
<path d="M86 148 Q100 166 114 148 Z" fill="${INK}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
<path d="M93 156 Q100 162 107 156" fill="#f2545b"/>
${ARMS[pose]}
</svg>`;
}

export const mascotDataUrl = (pose: MascotPose) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mascotSvg(pose))}`;
