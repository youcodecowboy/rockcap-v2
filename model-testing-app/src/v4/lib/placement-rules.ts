// =============================================================================
// V4 DETERMINISTIC PLACEMENT RULES
// =============================================================================
// Maps classified documents to their correct storage location.
// This is the POST-PROCESSING step after Claude classifies a document.
//
// The model suggests a folder, but placement rules have final authority.
// This ensures consistency regardless of model behavior.
//
// TAXONOMY (2026-07-07): folder keys follow the client-approved Dark Mills
// taxonomy (docs/classification/dark-mills-exemplar-pack.md §1). Placement
// resolves from (fileType, producer, audience) to a folder key that may be a
// SUBFOLDER key (e.g. "client_appraisals" under "modelling_info"). The DB
// resolvers (convex/driveSync.ts resolveProjectFolderKey / resolveClientFolderKey)
// fall back to the parent key when a subfolder row does not exist on an
// older project/client.
//
// Rules are organized by:
// 1. Axis-aware rules (producer decides between sibling subfolders)
// 2. File type → folder mapping (specific overrides)
// 3. Category → folder mapping (defaults)
//
// When adding new rules:
// - Add to FILE_TYPE_PLACEMENT for specific fileType → folder mapping
// - Add to CATEGORY_PLACEMENT for a category-wide default
// - Producer-conditional routing lives in resolveAxisPlacement()

import type { DocumentClassification, ClientContext, ProducerAxis } from '../types';

// =============================================================================
// PLACEMENT RESULT
// =============================================================================

export interface PlacementResult {
  /** Resolved folder key (e.g., "client_appraisals", "kyc") — may be a subfolder key */
  folderKey: string;
  /** Display name for the folder */
  folderName: string;
  /** Whether this belongs at client or project level */
  targetLevel: 'client' | 'project';
  /** Whether the model's suggestion was overridden */
  wasOverridden: boolean;
  /** Reason for the placement decision */
  reason: string;
  /**
   * Set when no placement rule matched and the document fell through to the
   * default folder. Consumers can surface this for operator review — the
   * explicit "unfiled" successor under the new key set (see fallback below).
   */
  lowConfidence?: boolean;
}

// =============================================================================
// STANDARD FOLDER DEFINITIONS (hierarchical)
// =============================================================================

/**
 * All possible folders in the system, keyed by canonical folderKey.
 * `parentKey` expresses the subfolder hierarchy — the shared contract with
 * the folder-template scaffolding: these exact folderKey strings exist as
 * clientFolders/projectFolders rows (folderType) with parentFolderId wiring.
 */
export const FOLDER_DEFINITIONS: Record<string, { name: string; level: 'client' | 'project'; description: string; parentKey?: string }> = {
  // Client-level folders
  'background': { name: 'Background', level: 'client', description: 'Client background documents and general info' },
  'kyc': { name: 'KYC', level: 'client', description: 'Know Your Customer / identity documents', parentKey: 'background' },
  'background_docs': { name: 'Background Docs', level: 'client', description: 'Additional background documentation', parentKey: 'background' },
  'miscellaneous': { name: 'Miscellaneous', level: 'client', description: 'Uncategorized documents' },

  // Project-level folders — the Dark Mills taxonomy (pack §1)
  'modelling_info': { name: 'Modelling Info and Terms Request', level: 'project', description: 'Asset-fact gathering at deal start: statutory planning record, agent pricing evidence, drawings — everything about the asset before terms can be requested' },
  'client_appraisals': { name: 'Client Appraisals', level: 'project', description: "The developer's own land appraisal / development budget workbooks (developer-ops DNA)", parentKey: 'modelling_info' },
  // Lender Pack is an operator-curated OUTBOUND SNAPSHOT (what was sent to
  // lenders on a given date), not a document category. Membership encodes an
  // operator send-event that content-based classification cannot detect —
  // 6 of 8 Dark Mills pack files are byte-copies whose fingerprints point at
  // their canonical folders. HARD RULE: NEVER auto-classify INTO lender_pack
  // (enforced in resolvePlacement via NEVER_AUTO_CLASSIFY_FOLDER_KEYS).
  'lender_pack': { name: 'Lender Pack', level: 'project', description: 'Operator-curated outbound snapshot sent to lenders — NEVER an auto-classification target; type-classify to the canonical folder, pack membership is curated', parentKey: 'modelling_info' },
  'rockcap_appraisals': { name: 'Rockcap Appraisals', level: 'project', description: "RockCap's own debt-structured appraisal models (INTERNAL .xlsm source-of-truth + EXTERNAL .xlsx lender-facing cuts)", parentKey: 'modelling_info' },
  'terms_received': { name: 'Terms Received', level: 'project', description: 'Inbound single-lender indicative terms — one artifact per lender per date, in whatever form the lender sent them' },
  'terms_analysis': { name: 'Terms Analysis', level: 'project', description: 'RockCap-produced multi-lender comparisons, triage grids, and analysis-and-recommendation notes' },
  'comps': { name: 'Comps', level: 'project', description: 'Subject-side value case: Accommodation Schedule series (plot-keyed subject grids) and scheme-reference source docs' },
  'comps_appendix': { name: 'Appendix', level: 'project', description: 'Lender-facing "Appendix A: Master Comparable Schedule" deliverable slot — address-keyed external comparable evidence', parentKey: 'comps' },
  'credit': { name: 'Credit', level: 'project', description: 'Post-selection credit process with the chosen lender: credit checklists, credit-stage terms, submission attachments' },
  'post_completion': { name: 'Post Completion', level: 'project', description: 'Post-completion deal artifacts: facility/security docs, insurance, monitoring, drawdowns, facility administration' },
  'notes': { name: 'Notes', level: 'project', description: "RockCap's internal working record: call/meeting notes, internal briefs and filing copies, legacy internal models" },

  // Legacy fallback key — pre-taxonomy projects may still carry an "unfiled"
  // folder row; the DB resolver keeps it in the fallback chain for them.
  'unfiled': { name: 'Unfiled', level: 'project', description: 'Documents awaiting manual folder assignment (legacy projects only)' },
};

/** Folder keys that must NEVER be an auto-classification target (pack §1). */
export const NEVER_AUTO_CLASSIFY_FOLDER_KEYS = new Set(['lender_pack']);

/**
 * Parent folder key for a (sub)folder key, or undefined for top-level keys.
 * Used by the DB resolvers to fall back to the parent when a subfolder row
 * does not exist on an older project/client.
 */
export function getParentFolderKey(folderKey: string): string | undefined {
  return FOLDER_DEFINITIONS[folderKey]?.parentKey;
}

// =============================================================================
// CATEGORY → FOLDER MAPPING (defaults)
// =============================================================================

/** Default category-to-folder mapping. Specific fileTypes override below. */
const CATEGORY_PLACEMENT: Record<string, { folderKey: string; targetLevel: 'client' | 'project' }> = {
  // Project-level categories
  'Appraisals':           { folderKey: 'modelling_info', targetLevel: 'project' }, // producer axis refines to client_/rockcap_appraisals
  'Plans':                { folderKey: 'modelling_info', targetLevel: 'project' }, // drawings are asset evidence
  'Inspections':          { folderKey: 'post_completion', targetLevel: 'project' },
  'Professional Reports': { folderKey: 'modelling_info', targetLevel: 'project' }, // third-party asset evidence
  'Loan Terms':           { folderKey: 'terms_received', targetLevel: 'project' },
  'Legal Documents':      { folderKey: 'credit', targetLevel: 'project' },         // deal-execution legal docs accumulate in the credit workstream
  'Project Documents':    { folderKey: 'modelling_info', targetLevel: 'project' },
  'Insurance':            { folderKey: 'post_completion', targetLevel: 'project' },
  'Warranties':           { folderKey: 'post_completion', targetLevel: 'project' },
  'Photographs':          { folderKey: 'modelling_info', targetLevel: 'project' },
  'Communications':       { folderKey: 'notes', targetLevel: 'project' },

  // Client-level categories
  'KYC':                  { folderKey: 'kyc', targetLevel: 'client' },
  'Financial Documents':  { folderKey: 'background_docs', targetLevel: 'client' },

  // Fallback
  'Other':                { folderKey: 'miscellaneous', targetLevel: 'client' },
};

// =============================================================================
// FILE TYPE → FOLDER MAPPING (specific overrides)
// =============================================================================
// Every fileType in convex/fileTypeDefinitions.ts maps to a new-taxonomy key
// either here or via its category default above. The full legacy→new mapping
// table with rationale lives in the exemplar pack appendix
// (docs/classification/dark-mills-exemplar-pack.md — "Appendix: legacy type
// mapping").

const FILE_TYPE_PLACEMENT: Record<string, { folderKey: string; targetLevel: 'client' | 'project' }> = {
  // ── Appraisals — producer-specific types (pack §3.1–3.3) ──
  'Client Land Appraisal':     { folderKey: 'client_appraisals', targetLevel: 'project' },
  'RockCap Appraisal Model':   { folderKey: 'rockcap_appraisals', targetLevel: 'project' }, // any audience (INTERNAL + EXTERNAL cuts live together)
  'RedBook Valuation':         { folderKey: 'modelling_info', targetLevel: 'project' },     // third-party asset evidence
  // Generic 'Appraisal'/'Cashflow' route by producer in resolveAxisPlacement().

  // ── Terms lifecycle (pack §3.6–3.10) ──
  'Indicative Terms':          { folderKey: 'terms_received', targetLevel: 'project' },
  'Term Sheet':                { folderKey: 'terms_received', targetLevel: 'project' },
  'Credit Backed Terms':       { folderKey: 'credit', targetLevel: 'project' },  // credit-stage terms (resolved-SPV marker)
  'Lender Comparison Sheet':   { folderKey: 'terms_analysis', targetLevel: 'project' },
  'Lender Comparison Table':   { folderKey: 'terms_analysis', targetLevel: 'project' },
  'Lender Analysis Note':      { folderKey: 'terms_analysis', targetLevel: 'project' },

  // ── Comps workstream (pack §3.11–3.12) ──
  'Accommodation Schedule':    { folderKey: 'comps', targetLevel: 'project' },          // subject plot grid → comps root
  'Comparable Schedule':       { folderKey: 'comps_appendix', targetLevel: 'project' }, // address-keyed Appendix A deliverable
  'Comparables':               { folderKey: 'comps_appendix', targetLevel: 'project' },

  // ── Credit workstream (pack §3.18) ──
  'Credit Checklist':          { folderKey: 'credit', targetLevel: 'project' },

  // ── Notes (pack §3.4–3.5) ──
  'Lender Brief Note':         { folderKey: 'notes', targetLevel: 'project' },  // filing copies + drafts; the EXTERNAL send copy is pack-curated
  'Initial Call Note':         { folderKey: 'notes', targetLevel: 'project' },
  'Meeting Minutes':           { folderKey: 'notes', targetLevel: 'project' },
  'Email/Correspondence':      { folderKey: 'notes', targetLevel: 'project' },

  // ── Statutory planning + third-party asset evidence (pack §3.13–3.17) ──
  'Planning Documentation':               { folderKey: 'modelling_info', targetLevel: 'project' },
  'Planning Permission Decision Notice':  { folderKey: 'modelling_info', targetLevel: 'project' },
  'S106 Discharge/Variation':             { folderKey: 'modelling_info', targetLevel: 'project' },
  'Commencement Confirmation Letter':     { folderKey: 'modelling_info', targetLevel: 'project' },
  'Agent Pricing Report':                 { folderKey: 'modelling_info', targetLevel: 'project' },
  'Architect Drawing Pack':               { folderKey: 'modelling_info', targetLevel: 'project' },

  // ── Legal DD for the credit process ──
  'Report on Title':           { folderKey: 'credit', targetLevel: 'project' },
  'Legal Opinion':             { folderKey: 'credit', targetLevel: 'project' },
  'Local Authority Search':    { folderKey: 'credit', targetLevel: 'project' },
  'Building Contract':         { folderKey: 'credit', targetLevel: 'project' },
  'Professional Appointment':  { folderKey: 'credit', targetLevel: 'project' },
  'Shareholders Agreement':    { folderKey: 'credit', targetLevel: 'project' },

  // ── Asset title facts → modelling info ──
  'Title Deed':                { folderKey: 'modelling_info', targetLevel: 'project' },
  'Lease':                     { folderKey: 'modelling_info', targetLevel: 'project' },

  // ── Executed facility / security docs → post completion ──
  'Facility Letter':           { folderKey: 'post_completion', targetLevel: 'project' },
  'Personal Guarantee':        { folderKey: 'post_completion', targetLevel: 'project' },
  'Corporate Guarantee':       { folderKey: 'post_completion', targetLevel: 'project' },
  'Debenture':                 { folderKey: 'post_completion', targetLevel: 'project' },
  'Share Charge':              { folderKey: 'post_completion', targetLevel: 'project' },
  'Collateral Warranty':       { folderKey: 'post_completion', targetLevel: 'project' },
  'Corporate Authorisations':  { folderKey: 'post_completion', targetLevel: 'project' },
  'Terms & Conditions':        { folderKey: 'post_completion', targetLevel: 'project' },

  // ── Monitoring / insurance (explicit for clarity; category defaults agree) ──
  'Initial Monitoring Report': { folderKey: 'post_completion', targetLevel: 'project' },
  'Interim Monitoring Report': { folderKey: 'post_completion', targetLevel: 'project' },
  'Insurance Policy':          { folderKey: 'post_completion', targetLevel: 'project' },
  'Insurance Certificate':     { folderKey: 'post_completion', targetLevel: 'project' },

  // ── Facility administration financials ──
  'Loan Statement':            { folderKey: 'post_completion', targetLevel: 'project' },
  'Redemption Statement':      { folderKey: 'post_completion', targetLevel: 'project' },
  'Completion Statement':      { folderKey: 'post_completion', targetLevel: 'project' },
  'Invoice':                   { folderKey: 'post_completion', targetLevel: 'project' }, // drawdown/monitoring evidence

  // ── KYC types outside the KYC category ──
  'Bank Statement':            { folderKey: 'kyc', targetLevel: 'client' },
  'Tax Return':                { folderKey: 'kyc', targetLevel: 'client' },
  'Certificate of Incorporation': { folderKey: 'kyc', targetLevel: 'client' },
};

// =============================================================================
// AXIS-AWARE RULES (producer decides between sibling subfolders)
// =============================================================================

/**
 * Producer-conditional placement for the appraisal genre (pack §2 axis 1):
 * an appraisal-genre workbook with developer-ops DNA is the CLIENT's
 * appraisal; one with debt-structuring DNA is ROCKCAP's. Shared numbers do
 * NOT distinguish producer — RockCap imports the client's totals verbatim.
 * Audience does not move these: RockCap models file to rockcap_appraisals
 * whether INTERNAL (.xlsm source of truth) or EXTERNAL (.xlsx lender cut).
 */
function resolveAxisPlacement(
  fileType: string,
  producer: ProducerAxis | undefined,
): { folderKey: string; targetLevel: 'client' | 'project'; reason: string } | undefined {
  const appraisalGenre = fileType === 'Appraisal' || fileType === 'Cashflow';
  if (appraisalGenre && producer === 'client') {
    return {
      folderKey: 'client_appraisals',
      targetLevel: 'project',
      reason: `Appraisal-genre "${fileType}" with producer=client (developer-ops DNA) → client_appraisals`,
    };
  }
  if (appraisalGenre && producer === 'rockcap') {
    return {
      folderKey: 'rockcap_appraisals',
      targetLevel: 'project',
      reason: `Appraisal-genre "${fileType}" with producer=rockcap (debt-structuring DNA) → rockcap_appraisals`,
    };
  }
  return undefined;
}

// =============================================================================
// MAIN PLACEMENT FUNCTION
// =============================================================================

/**
 * Resolve the final placement for a classified document.
 *
 * Priority order:
 * 1. Axis-aware rules (producer decides sibling subfolders)
 * 2. File type rule (specific fileType → folder)
 * 3. Category default (category → folder)
 * 4. Model suggestion (if it names a known, allowed folder key —
 *    lender_pack is blocked: pack membership encodes an operator send-event,
 *    never a content classification)
 * 5. Fallback — project-scoped → modelling_info with lowConfidence flag
 *    (the explicit successor of the old "unfiled" fallback: modelling_info
 *    is the deal-start gathering folder, and lowConfidence marks the doc for
 *    operator review); client-scoped → miscellaneous.
 *
 * NOTE: clientType-based routing was removed with the old
 * terms_request/terms_comparison split — the Dark Mills taxonomy has a
 * single terms lane (terms_received / terms_analysis / credit) keyed off
 * document content, not client type. ClientContext stays in the signature
 * for API stability and future use.
 */
export function resolvePlacement(
  classification: DocumentClassification,
  clientContext: ClientContext,
): PlacementResult {
  const { fileType, category, suggestedFolder, targetLevel: modelTargetLevel, producer } = classification.classification;
  void clientContext;

  const buildResult = (
    folderKey: string,
    targetLevel: 'client' | 'project',
    reason: string,
    lowConfidence?: boolean,
  ): PlacementResult => ({
    folderKey,
    folderName: FOLDER_DEFINITIONS[folderKey]?.name || folderKey,
    targetLevel,
    wasOverridden: folderKey !== suggestedFolder,
    reason,
    ...(lowConfidence ? { lowConfidence: true } : {}),
  });

  // Priority 1: Axis-aware rules
  const axisPlacement = resolveAxisPlacement(fileType, producer);
  if (axisPlacement) {
    return buildResult(axisPlacement.folderKey, axisPlacement.targetLevel, axisPlacement.reason);
  }

  // Priority 2: File type rule
  if (FILE_TYPE_PLACEMENT[fileType]) {
    const rule = FILE_TYPE_PLACEMENT[fileType];
    return buildResult(rule.folderKey, rule.targetLevel, `File type "${fileType}" has specific placement rule → ${rule.folderKey}`);
  }

  // Priority 3: Category default
  if (CATEGORY_PLACEMENT[category]) {
    const rule = CATEGORY_PLACEMENT[category];
    return buildResult(rule.folderKey, rule.targetLevel, `Category "${category}" maps to ${rule.folderKey}`);
  }

  // Priority 4: Use model's suggestion if it names a known, allowed folder.
  // lender_pack is blocked — pack membership encodes an operator send-event;
  // type-classify to the canonical folder always (pack §1).
  if (
    suggestedFolder &&
    FOLDER_DEFINITIONS[suggestedFolder] &&
    !NEVER_AUTO_CLASSIFY_FOLDER_KEYS.has(suggestedFolder)
  ) {
    const folder = FOLDER_DEFINITIONS[suggestedFolder];
    return {
      folderKey: suggestedFolder,
      folderName: folder.name,
      targetLevel: folder.level,
      wasOverridden: false,
      reason: `Using model suggestion: ${suggestedFolder}`,
    };
  }

  // Priority 5: Fallback. Project-scoped documents land in modelling_info
  // flagged lowConfidence (successor of the old "unfiled" fallback — the DB
  // resolver still falls through to a legacy "unfiled" folder row on old
  // projects that have one); client-scoped documents keep miscellaneous.
  const isProjectScoped = modelTargetLevel === 'project';
  return buildResult(
    isProjectScoped ? 'modelling_info' : 'miscellaneous',
    isProjectScoped ? 'project' : 'client',
    `No placement rule for "${fileType}" (${category}). Defaulting to ${isProjectScoped ? 'modelling_info (low confidence)' : 'miscellaneous'}.`,
    isProjectScoped,
  );
}

// =============================================================================
// BATCH PLACEMENT
// =============================================================================

/**
 * Resolve placement for all documents in a batch result.
 * Returns a map of documentIndex → PlacementResult.
 */
export function resolveBatchPlacement(
  classifications: DocumentClassification[],
  clientContext: ClientContext,
): Map<number, PlacementResult> {
  const placements = new Map<number, PlacementResult>();

  for (const cls of classifications) {
    placements.set(cls.documentIndex, resolvePlacement(cls, clientContext));
  }

  return placements;
}
