import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUserOrNull } from "./authHelpers";
import {
  sizeBandFromLoanAmount,
  inferSector,
  buildAnonymisedHeadline,
  type DealSector,
} from "./lib/dealBook";

/**
 * Scan completed projects with no case study and create draft entries with
 * inferred sector/region/sizeBand. Idempotent: skips projects already covered.
 * Callable from the web app (Clerk) and from MCP (bearer token) — no user required.
 */
export const deriveDrafts = mutation({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("projects")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    const completed = projects.filter((p) => p.status === "completed");
    const now = new Date().toISOString();
    let created = 0;
    let skipped = 0;
    for (const p of completed) {
      const existing = await ctx.db
        .query("caseStudies")
        .withIndex("by_project", (q: any) => q.eq("projectId", p._id))
        .filter((q: any) => q.neq(q.field("isDeleted"), true))
        .first();
      if (existing) {
        skipped++;
        continue;
      }
      const sector = inferSector(
        `${p.name ?? ""} ${p.description ?? ""} ${(p.tags ?? []).join(" ")}`,
      );
      await ctx.db.insert("caseStudies", {
        projectId: p._id,
        curationStatus: "draft",
        sector: sector ?? "",
        dealType: "",
        region: p.city ?? p.state ?? "",
        sizeBand: sizeBandFromLoanAmount(p.loanAmount),
        headline: "",
        referenceable: false,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
    return { created, skipped, totalCompleted: completed.length };
  },
});

/**
 * Operator confirms/edits a draft. If no headline supplied, an anonymised one
 * is generated from sector + region. Sets curationStatus = "confirmed".
 */
export const confirm = mutation({
  args: {
    id: v.id("caseStudies"),
    sector: v.string(),
    dealType: v.optional(v.string()),
    region: v.optional(v.string()),
    sizeBand: v.optional(v.string()),
    headline: v.optional(v.string()),
    referenceable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUserOrNull(ctx);
    const entry = await ctx.db.get(args.id);
    if (!entry) throw new Error("Case study not found");
    const region = args.region ?? entry.region;
    const sizeBand = args.sizeBand ?? entry.sizeBand;
    const headline =
      args.headline && args.headline.trim().length > 0
        ? args.headline
        : buildAnonymisedHeadline({
            sector: args.sector as DealSector,
            region,
            sizeBand,
          });
    const now = new Date().toISOString();
    await ctx.db.patch(args.id, {
      sector: args.sector,
      dealType: args.dealType ?? entry.dealType,
      region,
      sizeBand,
      headline,
      referenceable: args.referenceable ?? entry.referenceable,
      curationStatus: "confirmed",
      confirmedBy: user?._id,
      confirmedAt: now,
      updatedAt: now,
    });
    return { status: "confirmed", id: args.id };
  },
});

/**
 * Query the index for hook rung 9. Returns ONLY confirmed + referenceable
 * entries, projected to anonymised fields — never the backing project name.
 * If a region is given and any match shares it, region matches are preferred.
 */
export const matchForProspect = query({
  args: { sector: v.string(), region: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let entries = await ctx.db
      .query("caseStudies")
      .withIndex("by_sector", (q: any) => q.eq("sector", args.sector))
      .filter((q: any) => q.neq(q.field("isDeleted"), true))
      .collect();
    entries = entries.filter(
      (e) => e.curationStatus === "confirmed" && e.referenceable === true,
    );
    if (args.region) {
      const regionMatches = entries.filter(
        (e) => (e.region ?? "").toLowerCase() === args.region!.toLowerCase(),
      );
      if (regionMatches.length > 0) entries = regionMatches;
    }
    return entries.map((e) => ({
      sector: e.sector,
      region: e.region,
      sizeBand: e.sizeBand,
      dealType: e.dealType,
      headline: e.headline,
    }));
  },
});

/** List entries (joined with their backing project) for the page and ops. */
export const list = query({
  args: {
    curationStatus: v.optional(v.union(v.literal("draft"), v.literal("confirmed"))),
    sector: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let entries = await ctx.db
      .query("caseStudies")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    if (args.curationStatus) {
      entries = entries.filter((e) => e.curationStatus === args.curationStatus);
    }
    if (args.sector) entries = entries.filter((e) => e.sector === args.sector);
    return Promise.all(
      entries.map(async (e) => ({ ...e, project: await ctx.db.get(e.projectId) })),
    );
  },
});

/** Fetch the case study for a project (closed-row "Case study" button). */
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("caseStudies")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .filter((q: any) => q.neq(q.field("isDeleted"), true))
      .first();
  },
});

/** Toggle the hook-eligibility gate. */
export const setReferenceable = mutation({
  args: { id: v.id("caseStudies"), referenceable: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      referenceable: args.referenceable,
      updatedAt: new Date().toISOString(),
    });
    return { status: "updated", id: args.id, referenceable: args.referenceable };
  },
});
