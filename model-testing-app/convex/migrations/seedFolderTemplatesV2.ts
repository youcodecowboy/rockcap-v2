import { internalMutation } from "../_generated/server";

/**
 * Migration: Seed Folder Templates V2 — Dark Mills taxonomy
 *
 * Upserts the default Borrower project-level folder template to the
 * client-approved taxonomy from the Dark Mills exemplar pack
 * (docs/classification/dark-mills-exemplar-pack.md §1), replacing the
 * legacy 8 flat folders with numbered lifecycle folders + nested subfolders.
 *
 * Borrower client-level and all Lender templates are unchanged.
 * Existing projectFolders rows are NOT migrated — the template only affects
 * newly created projects (retro-migration is deferred to a later pass).
 *
 * Run with: npx convex run migrations/seedFolderTemplatesV2:seedFolderTemplatesV2
 */

// Borrower project-level folders (Dark Mills client-approved taxonomy).
// folderKey strings are a shared contract with the placement engine — do not rename.
const BORROWER_PROJECT_FOLDERS_V2 = [
  { name: "1. Modelling Info and Terms Request", folderKey: "modelling_info", order: 1, description: "Asset-fact gathering at deal start — planning record, agent pricing, drawings; asset evidence produced by neither RockCap nor a lender" },
  { name: "Client Appraisals", folderKey: "client_appraisals", parentKey: "modelling_info", order: 2, description: "The developer's own land appraisal / development budget workbooks — the client's cost and profit view of the scheme" },
  { name: "Lender Pack", folderKey: "lender_pack", parentKey: "modelling_info", order: 3, description: "Curated outbound pack copies — operator-managed; auto-classification never targets this folder" },
  { name: "Rockcap Appraisals", folderKey: "rockcap_appraisals", parentKey: "modelling_info", order: 4, description: "RockCap's debt-structured appraisal models — INTERNAL source-of-truth workbooks and EXTERNAL lender-facing exports" },
  { name: "2. Terms Received", folderKey: "terms_received", order: 5, description: "Inbound indicative terms — one artifact per lender per date, in whatever form the lender sent them" },
  { name: "3. Terms Analysis", folderKey: "terms_analysis", order: 6, description: "RockCap-produced like-for-like comparison of received terms and lender recommendation" },
  { name: "4. Comps", folderKey: "comps", order: 7, description: "Subject-side value case — accommodation schedule series and third-party scheme-reference source documents" },
  { name: "Appendix", folderKey: "comps_appendix", parentKey: "comps", order: 8, description: "Lender-facing 'Appendix A: Master Comparable Schedule' series — a credit-pack deliverable slot, not a topic folder" },
  { name: "5. Credit", folderKey: "credit", order: 9, description: "Post-selection credit process with the chosen lender — request checklists, credit-stage terms, submission attachments" },
  { name: "6. Post Completion", folderKey: "post_completion", order: 10, description: "Post-completion deal artifacts — drawdown monitoring, PMS reports, sales updates, facility administration" },
  { name: "Notes", folderKey: "notes", order: 11, description: "RockCap's internal working record — call/meeting notes, internal filing copies of outward docs, legacy internal models" },
];

export const seedFolderTemplatesV2 = internalMutation({
  handler: async (ctx) => {
    const now = new Date().toISOString();

    const templates = await ctx.db
      .query("folderTemplates")
      .withIndex("by_client_type_level", (q: any) =>
        q.eq("clientType", "borrower").eq("level", "project")
      )
      .collect();

    // Upsert: replace folders on the existing default (or first) template so
    // the template _id (and any references to it) stays stable.
    const existing = templates.find((t) => t.isDefault) || templates[0];

    if (existing) {
      await ctx.db.patch(existing._id, {
        folders: BORROWER_PROJECT_FOLDERS_V2,
        isDefault: true,
        updatedAt: now,
      });
      console.log(`Updated borrower/project template ${existing._id} to V2 taxonomy (${BORROWER_PROJECT_FOLDERS_V2.length} folders)`);
      return { action: "updated", templateId: existing._id };
    }

    const templateId = await ctx.db.insert("folderTemplates", {
      clientType: "borrower",
      level: "project",
      folders: BORROWER_PROJECT_FOLDERS_V2,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created borrower/project template ${templateId} with V2 taxonomy (${BORROWER_PROJECT_FOLDERS_V2.length} folders)`);
    return { action: "created", templateId };
  },
});
