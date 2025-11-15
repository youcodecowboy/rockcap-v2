/**
 * TypeScript interfaces for HubSpot data structures
 */

export interface HubSpotContact {
  id: string;
  properties: {
    email?: string;
    firstname?: string;
    lastname?: string;
    phone?: string;
    mobilephone?: string;
    company?: string;
    jobtitle?: string;
    lifecyclestage?: string;
    hubspot_owner_id?: string;
    [key: string]: any; // For custom properties
  };
  associations?: {
    companies?: {
      results?: Array<{ id: string; [key: string]: any }>;
    };
    deals?: {
      results?: Array<{ id: string; [key: string]: any }>;
    };
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface HubSpotCompany {
  id: string;
  properties: {
    name: string;
    domain?: string;
    website?: string;
    phone?: string;
    address?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    industry?: string;
    type?: string;
    description?: string;
    lifecyclestage?: string;
    hubspot_owner_id?: string;
    [key: string]: any; // For custom properties
  };
  associations?: {
    contacts?: {
      results?: Array<{ id: string; [key: string]: any }>;
    };
    deals?: {
      results?: Array<{ id: string; [key: string]: any }>;
    };
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname: string;
    amount?: string;
    dealstage?: string;
    closedate?: string;
    pipeline?: string;
    dealtype?: string;
    description?: string;
    hubspot_owner_id?: string;
    hs_next_step?: string;
    [key: string]: any; // For custom properties
  };
  associations?: {
    contacts?: {
      results?: Array<{ id: string; [key: string]: any }>;
    };
    companies?: {
      results?: Array<{ id: string; [key: string]: any }>;
    };
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface HubSpotSyncResult {
  success: boolean;
  synced: number;
  updated: number;
  created: number;
  errors: number;
  errorMessages?: string[];
}

export interface HubSpotSyncStats {
  companiesSynced: number;
  contactsSynced: number;
  dealsSynced: number;
  errors: number;
}

