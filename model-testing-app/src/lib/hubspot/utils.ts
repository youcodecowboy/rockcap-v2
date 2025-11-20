/**
 * Generate HubSpot deep link URL for a contact
 * Portal ID can be provided or will be fetched from environment/API
 */
export async function generateHubSpotContactUrl(
  contactId: string,
  portalId?: string | null
): Promise<string | null> {
  let finalPortalId = portalId || process.env.HUBSPOT_PORTAL_ID;
  
  if (!finalPortalId) {
    // Try to get from API if not provided
    try {
      const { getHubSpotPortalId, getHubSpotClient } = await import('./client');
      finalPortalId = await getHubSpotPortalId(getHubSpotClient()) || undefined;
    } catch (error) {
      console.warn('Could not determine HubSpot portal ID:', error);
      return null;
    }
  }
  
  if (!finalPortalId) {
    return null;
  }
  
  return `https://app.hubspot.com/contacts/${finalPortalId}/contact/${contactId}`;
}

/**
 * Generate HubSpot deep link URL for a company
 * Portal ID can be provided or will be fetched from environment/API
 */
export async function generateHubSpotCompanyUrl(
  companyId: string,
  portalId?: string | null
): Promise<string | null> {
  let finalPortalId = portalId || process.env.HUBSPOT_PORTAL_ID;
  
  if (!finalPortalId) {
    // Try to get from API if not provided
    try {
      const { getHubSpotPortalId, getHubSpotClient } = await import('./client');
      finalPortalId = await getHubSpotPortalId(getHubSpotClient()) || undefined;
    } catch (error) {
      console.warn('Could not determine HubSpot portal ID:', error);
      return null;
    }
  }
  
  if (!finalPortalId) {
    return null;
  }
  
  return `https://app.hubspot.com/contacts/${finalPortalId}/company/${companyId}`;
}

/**
 * Generate HubSpot deep link URL for a deal
 * Portal ID can be provided or will be fetched from environment/API
 */
export async function generateHubSpotDealUrl(
  dealId: string,
  portalId?: string | null
): Promise<string | null> {
  let finalPortalId = portalId || process.env.HUBSPOT_PORTAL_ID;
  
  if (!finalPortalId) {
    // Try to get from API if not provided
    try {
      const { getHubSpotPortalId, getHubSpotClient } = await import('./client');
      finalPortalId = await getHubSpotPortalId(getHubSpotClient()) || undefined;
    } catch (error) {
      console.warn('Could not determine HubSpot portal ID:', error);
      return null;
    }
  }
  
  if (!finalPortalId) {
    return null;
  }
  
  return `https://app.hubspot.com/contacts/${finalPortalId}/deal/${dealId}`;
}

/**
 * Map HubSpot lifecycle stage to client status
 */
export function mapLifecycleStageToStatus(lifecycleStage?: string): 'prospect' | 'active' | 'archived' | 'past' {
  if (!lifecycleStage) {
    return 'active';
  }
  
  const stage = lifecycleStage.toLowerCase();
  
  // Prospect stages
  if (
    stage === 'lead' ||
    stage === 'marketingqualifiedlead' ||
    stage === 'salesqualifiedlead' ||
    stage === 'opportunity'
  ) {
    return 'prospect';
  }
  
  // Active stages
  if (
    stage === 'customer' ||
    stage === 'evangelist' ||
    stage === 'other'
  ) {
    return 'active';
  }
  
  // Default to active
  return 'active';
}

/**
 * Extract custom properties from HubSpot object
 * Returns all properties that are not standard HubSpot properties
 */
export function extractCustomProperties(properties: Record<string, any>): Record<string, any> {
  const standardProperties = new Set([
    'id',
    'createdAt',
    'updatedAt',
    'email',
    'firstname',
    'lastname',
    'phone',
    'company',
    'jobtitle',
    'lifecyclestage',
    'name',
    'domain',
    'address',
    'city',
    'state',
    'zip',
    'country',
    'industry',
    'dealname',
    'amount',
    'dealstage',
    'closedate',
    'pipeline',
    'hs_object_id',
    'hs_created_at',
    'hs_updated_at',
  ]);
  
  const customProperties: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(properties)) {
    if (!standardProperties.has(key.toLowerCase())) {
      customProperties[key] = value;
    }
  }
  
  return customProperties;
}

/**
 * Delay function for rate limiting
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

