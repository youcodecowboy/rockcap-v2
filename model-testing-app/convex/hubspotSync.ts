/**
 * HubSpot Sync Module - Re-export from directory structure
 * 
 * This file re-exports all HubSpot sync mutations and queries
 * from the modularized hubspotSync directory to maintain backward
 * compatibility with existing imports.
 * 
 * Usage:
 *   import { api } from "convex/_generated/api";
 *   await fetchMutation(api.hubspotSync.syncCompanyFromHubSpot, {...});
 */

// Re-export everything from the hubspotSync directory's index
export * from "./hubspotSync/index";

