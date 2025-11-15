/**
 * HubSpot Sync Module - Main Entry Point
 * 
 * This module re-exports all HubSpot sync mutations and queries
 * to maintain backward compatibility with existing imports.
 * 
 * Usage:
 *   import { api } from "convex/_generated/api";
 *   await fetchMutation(api.hubspotSync.syncCompanyFromHubSpot, {...});
 */

// Export company sync mutations
export { syncCompanyFromHubSpot, syncCompanyToClientFromHubSpot } from "./companies";

// Export contact sync mutations
export { syncContactFromHubSpot, syncLeadFromHubSpot } from "./contacts";

// Export deal sync mutations
export { syncDealToDealsTable, syncDealFromHubSpot } from "./deals";

// Export linking mutations
export {
  extractDatesFromMetadata,
  linkContactsToCompanies,
  linkDealsToContactsAndCompanies,
} from "./linking";

// Export config mutations and queries
export {
  updateSyncConfig,
  updateSyncStatus,
  getSyncConfig,
} from "./config";

// Export pipeline/stage mutations and queries
export {
  syncPipelinesAndStages,
  getStageName,
  getPipelineName,
  updateDealsWithStageAndPipelineNames,
} from "./pipelines";

// Activities module is placeholder for now
// export { syncActivitiesFromHubSpot } from "./activities";

