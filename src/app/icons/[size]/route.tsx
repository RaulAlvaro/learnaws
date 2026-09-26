import { ImageResponse } from "next/og";

/** App icon rendered on demand: orange dot + "SAA" on a dark tile. */
export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const size = Math.min(1024, Math.max(32, Number((await ctx.params).size) || 192));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#111110",
          color: "#eeece8",
          fontSize: size * 0.26,
          fontWeight: 700,
          letterSpacing: -size * 0.01,
        }}
      >
        <div style={{ width: size * 0.14, height: size * 0.14, borderRadius: size, background: "#f0913a", marginBottom: size * 0.06 }} />
        SAA
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800" } },
  );
}
