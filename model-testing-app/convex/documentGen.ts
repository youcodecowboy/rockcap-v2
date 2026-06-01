// MCP-facing orchestration: render a document via the Next route (Chromium
// lives there), then stage a document_publish approval as the given operator.
// Default-runtime action (fetch is available; no "use node" needed).
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const renderAndStage = internalAction({
  args: {
    // Freeform house document. Optional when rendering a branded brief instead.
    contentHtml: v.optional(v.string()),
    // Branded brief: a layout ("lender-brief" | "client-brief") + structured briefData.
    layout: v.optional(v.string()),
    briefData: v.optional(v.any()),
    // Comps appendix: structured compsData rendered to xlsx / docx.
    compsData: v.optional(v.any()),
    title: v.string(),
    docType: v.string(),
    category: v.optional(v.string()),
    summary: v.optional(v.string()),
    formats: v.optional(v.array(v.string())),
    isBaseDocument: v.optional(v.boolean()),
    requestedByUserId: v.id("users"),
    relatedClientId: v.optional(v.id("clients")),
    relatedProjectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args): Promise<{ approvalId: string; formats: string[] }> => {
    const rawAppUrl = process.env.NEXT_APP_URL;
    if (!rawAppUrl) throw new Error("NEXT_APP_URL not set; cannot reach the render route");
    // NEXT_APP_URL may be stored without a scheme (e.g. "rockcap-v2.vercel.app").
    // Normalise like replyEventProcessor so the fetch URL is absolute.
    const appUrl = rawAppUrl.startsWith("http") ? rawAppUrl : `https://${rawAppUrl}`;
    // Comps default to xlsx; briefs/house docs default to pdf+docx.
    const defaultFormats = args.compsData ? ["xlsx"] : ["pdf", "docx"];
    const formats = args.formats && args.formats.length ? args.formats : defaultFormats;

    // Comps appendix (compsData), branded brief (layout + briefData), or freeform
    // house document (contentHtml).
    const payload = args.compsData
      ? { compsData: args.compsData, title: args.title, formats }
      : args.layout
        ? { layout: args.layout, briefData: args.briefData, title: args.title, formats }
        : { contentHtml: args.contentHtml, title: args.title, formats };

    const res = await fetch(`${appUrl}/api/documents/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-convex-internal-secret": process.env.CONVEX_INTERNAL_SECRET ?? "",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Document render failed: ${res.status} ${detail}`);
    }
    const { files } = await res.json();
    if (!Array.isArray(files) || files.length === 0) throw new Error("Document render returned no files");

    const staged: { approvalId: string } = await ctx.runMutation(internal.documentPublish.stageInternal, {
      title: args.title,
      docType: args.docType,
      category: args.category ?? "Generated",
      summary: args.summary ?? args.title,
      files,
      isBaseDocument: args.isBaseDocument ?? true,
      requestedByUserId: args.requestedByUserId,
      requestSourceName: "document-author (mcp)",
      relatedClientId: args.relatedClientId,
      relatedProjectId: args.relatedProjectId,
    });

    return { approvalId: staged.approvalId, formats: files.map((f: any) => f.format) };
  },
});
