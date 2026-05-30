// MCP-facing bridge: render a StructureGraph to SVG via the Next route.
// Default-runtime action (fetch is available; no "use node" needed).
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const renderChart = internalAction({
  args: { graph: v.any() },
  handler: async (_ctx, { graph }): Promise<{ svg: string; dataUri: string; verdict: unknown }> => {
    const rawAppUrl = process.env.NEXT_APP_URL;
    if (!rawAppUrl) throw new Error("NEXT_APP_URL not set; cannot reach the render route");
    // NEXT_APP_URL may be stored without a scheme (e.g. "rockcap-v2.vercel.app").
    // Normalise like replyEventProcessor so the fetch URL is absolute.
    const appUrl = rawAppUrl.startsWith("http") ? rawAppUrl : `https://${rawAppUrl}`;

    const res = await fetch(`${appUrl}/api/structure/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-convex-internal-secret": process.env.CONVEX_INTERNAL_SECRET ?? "",
      },
      body: JSON.stringify({ graph }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Structure render failed: ${res.status} ${detail}`);
    }
    return (await res.json()) as { svg: string; dataUri: string; verdict: unknown };
  },
});
