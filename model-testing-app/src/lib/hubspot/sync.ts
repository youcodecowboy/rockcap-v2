import { Client } from '@hubspot/api-client';
import { getHubSpotClient } from './client';
import { fetchAllContactsFromHubSpot } from './contacts';
import { fetchAllCompaniesFromHubSpot } from './companies';
import { fetchAllDealsFromHubSpot } from './deals';
import { HubSpotSyncStats } from './types';

/**
 * Orchestration layer for full sync operations
 */
export interface SyncOptions {
  maxRecords?: number;
  syncCompanies?: boolean;
  syncContacts?: boolean;
  syncDeals?: boolean;
}

export interface SyncProgress {
  status: 'in_progress' | 'completed' | 'error';
  companiesSynced: number;
  contactsSynced: number;
  dealsSynced: number;
  errors: number;
  errorMessages: string[];
}

/**
 * Perform full sync from HubSpot
 */
export async function performFullSync(
  options: SyncOptions = {}
): Promise<SyncProgress> {
  const {
    maxRecords = 100,
    syncCompanies = true,
    syncContacts = true,
    syncDeals = true,
  } = options;
  
  const client = getHubSpotClient();
  const progress: SyncProgress = {
    status: 'in_progress',
    companiesSynced: 0,
    contactsSynced: 0,
    dealsSynced: 0,
    errors: 0,
    errorMessages: [],
  };
  
  try {
    // Sync companies
    if (syncCompanies) {
      try {
        const companies = await fetchAllCompaniesFromHubSpot(client, maxRecords);
        // Companies will be synced via API route that calls Convex mutations
        progress.companiesSynced = companies.length;
      } catch (error: any) {
        progress.errors++;
        progress.errorMessages.push(`Companies sync error: ${error.message}`);
      }
    }
    
    // Sync contacts
    if (syncContacts) {
      try {
        const contacts = await fetchAllContactsFromHubSpot(client, maxRecords);
        // Contacts will be synced via API route that calls Convex mutations
        progress.contactsSynced = contacts.length;
      } catch (error: any) {
        progress.errors++;
        progress.errorMessages.push(`Contacts sync error: ${error.message}`);
      }
    }
    
    // Sync deals
    if (syncDeals) {
      try {
        const dealsResult = await fetchAllDealsFromHubSpot(client, maxRecords);
        const deals = dealsResult.deals;
        // Deals will be synced via API route that calls Convex mutations
        progress.dealsSynced = deals.length;
      } catch (error: any) {
        progress.errors++;
        progress.errorMessages.push(`Deals sync error: ${error.message}`);
      }
    }
    
    progress.status = progress.errors > 0 ? 'error' : 'completed';
  } catch (error: any) {
    progress.status = 'error';
    progress.errors++;
    progress.errorMessages.push(`Sync failed: ${error.message}`);
  }
  
  return progress;
}

