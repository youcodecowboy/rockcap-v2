import { v } from 'convex/values';
import { mutation } from '../_generated/server';

/**
 * Upsert a HubSpot engagement into the activities table.
 * Deduplicates by hubspotActivityId — re-running sync is idempotent.
 * Resolves HubSpot IDs (company, contact, deal) to Convex IDs at write time.
 */
export const syncActivityFromHubSpot = mutation({
  args: {
    // Identity (maps fetcher's engagement.id → schema's hubspotActivityId)
    hubspotActivityId: v.string(),
    activityType: v.string(), // EMAIL | INCOMING_EMAIL | MEETING | CALL | NOTE | TASK | ...
    activityDate: v.string(), // ISO

    // Content
    subject: v.optional(v.string()),
    body: v.optional(v.string()), // legacy; kept for back-compat
    bodyPreview: v.optional(v.string()),
    bodyHtml: v.optional(v.string()),
    direction: v.optional(v.union(v.literal('inbound'), v.literal('outbound'))),
    status: v.optional(v.string()),
    duration: v.optional(v.number()),
    fromEmail: v.optional(v.string()),
    toEmails: v.optional(v.array(v.string())),
    outcome: v.optional(v.string()),
    metadata: v.optional(v.any()),
    sourceIntegration: v.optional(v.string()),
    transcriptUrl: v.optional(v.string()),

    // Associations — these are HubSpot IDs; we resolve them here
    hubspotCompanyId: v.optional(v.string()),
    hubspotContactIds: v.optional(v.array(v.string())),
    hubspotDealIds: v.optional(v.array(v.string())),

    // Owner
    hubspotOwnerId: v.optional(v.string()),
    ownerName: v.optional(v.string()),
    hubspotUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Resolve HubSpot → Convex IDs via indexes
    let companyId: any = undefined;
    if (args.hubspotCompanyId) {
      const company = await ctx.db
        .query('companies')
        .withIndex('by_hubspot_id', (q) => q.eq('hubspotCompanyId', args.hubspotCompanyId!))
        .first();
      companyId = company?._id;
    }

    const linkedContactIds: any[] = [];
    const seenContactIds = new Set<string>();
    for (const hsId of args.hubspotContactIds ?? []) {
      if (seenContactIds.has(hsId)) continue;
      seenContactIds.add(hsId);
      const c = await ctx.db
        .query('contacts')
        .withIndex('by_hubspot_id', (q) => q.eq('hubspotContactId', hsId))
        .first();
      if (c && !linkedContactIds.some((id) => id === c._id)) linkedContactIds.push(c._id);
    }

    const linkedDealIds: any[] = [];
    const seenDealIds = new Set<string>();
    for (const hsId of args.hubspotDealIds ?? []) {
      if (seenDealIds.has(hsId)) continue;
      seenDealIds.add(hsId);
      const d = await ctx.db
        .query('deals')
        .withIndex('by_hubspot_id', (q) => q.eq('hubspotDealId', hsId))
        .first();
      if (d && !linkedDealIds.some((id) => id === d._id)) linkedDealIds.push(d._id);
    }

    // Primary contact/deal for singular fields (first-resolved)
    const primaryContactId = linkedContactIds[0];
    const primaryDealId = linkedDealIds[0];

    const fields = {
      hubspotActivityId: args.hubspotActivityId,
      activityType: args.activityType,
      activityDate: args.activityDate,
      subject: args.subject,
      body: args.body,
      bodyPreview: args.bodyPreview,
      bodyHtml: args.bodyHtml,
      direction: args.direction,
      status: args.status,
      duration: args.duration,
      fromEmail: args.fromEmail,
      toEmails: args.toEmails,
      outcome: args.outcome,
      metadata: args.metadata,
      sourceIntegration: args.sourceIntegration,
      transcriptUrl: args.transcriptUrl,
      hubspotOwnerId: args.hubspotOwnerId,
      ownerName: args.ownerName,
      hubspotUrl: args.hubspotUrl,
      // Singular associations (existing schema fields)
      contactId: primaryContactId,
      companyId: companyId,
      dealId: primaryDealId,
      // HubSpot ID arrays for reference
      hubspotContactIds: args.hubspotContactIds,
      hubspotCompanyIds: args.hubspotCompanyId ? [args.hubspotCompanyId] : undefined,
      hubspotDealIds: args.hubspotDealIds,
      // Multi-association arrays (new fields from Task 1.1)
      linkedContactIds: linkedContactIds.length > 0 ? linkedContactIds : undefined,
      linkedDealIds: linkedDealIds.length > 0 ? linkedDealIds : undefined,
      lastHubSpotSync: now,
      updatedAt: now,
    };

    // Upsert by hubspotActivityId
    const existing = await ctx.db
      .query('activities')
      .withIndex('by_hubspot_id', (q) => q.eq('hubspotActivityId', args.hubspotActivityId))
      .first();

    if (existing) {
      // Strip undefined values before patching — Convex's db.patch treats
      // `undefined` as "remove this field from the document," which would
      // clobber good values on every re-sync when the current fetch path
      // doesn't happen to populate a given optional field. Example: the
      // new global `/engagements/recent/modified` path doesn't always
      // surface owner info, so re-syncing an existing activity with
      // ownerName: undefined was blanking the previously-resolved name
      // and the UI fell back to "Someone" everywhere.
      const patchFields: Record<string, any> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) patchFields[k] = v;
      }
      await ctx.db.patch(existing._id, patchFields);
      return existing._id;
    }

    return await ctx.db.insert('activities', {
      ...fields,
      createdAt: now,
    });
  },
});
