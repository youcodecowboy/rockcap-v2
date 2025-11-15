/**
 * Fetch activities associated with deals from HubSpot
 * Activities include notes, calls, emails, meetings, tasks, etc.
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export interface HubSpotActivity {
  id: string;
  type: string;
  properties: Record<string, any>;
  associations?: {
    deals?: {
      results: Array<{ id: string }>;
    };
    contacts?: {
      results: Array<{ id: string }>;
    };
    companies?: {
      results: Array<{ id: string }>;
    };
  };
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Fetch activities for a specific deal
 */
export async function fetchActivitiesForDeal(
  dealId: string,
  limit: number = 100
): Promise<HubSpotActivity[]> {
  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) {
    throw new Error('HUBSPOT_API_KEY not found in environment variables');
  }

  try {
    // HubSpot Activities API endpoint
    // We'll use the engagements API which includes notes, calls, emails, meetings, tasks
    const params = new URLSearchParams({
      limit: limit.toString(),
      associations: 'deals,contacts,companies',
    });

    // Fetch engagements (activities) associated with this deal
    const response = await fetch(
      `${HUBSPOT_API_BASE}/engagements/v1/engagements/associated/deal/${dealId}?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch activities: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // The engagements API returns results in a specific format
    const engagements = data.results || data || [];
    
    return engagements.map((engagement: any) => ({
      id: engagement.id || engagement.engagement?.id || '',
      type: engagement.type || engagement.engagement?.type || 'unknown',
      properties: engagement.metadata || engagement.properties || {},
      associations: engagement.associations || {},
      createdAt: engagement.createdAt || engagement.engagement?.createdAt,
      updatedAt: engagement.updatedAt || engagement.engagement?.updatedAt,
    }));
  } catch (error: any) {
    console.error(`Error fetching activities for deal ${dealId}:`, error);
    throw error;
  }
}

/**
 * Fetch all activities for multiple deals
 */
export async function fetchActivitiesForDeals(
  dealIds: string[],
  limitPerDeal: number = 50
): Promise<Map<string, HubSpotActivity[]>> {
  const activitiesMap = new Map<string, HubSpotActivity[]>();
  
  for (const dealId of dealIds) {
    try {
      const activities = await fetchActivitiesForDeal(dealId, limitPerDeal);
      activitiesMap.set(dealId, activities);
      
      // Rate limiting: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error: any) {
      console.error(`Failed to fetch activities for deal ${dealId}:`, error);
      activitiesMap.set(dealId, []);
    }
  }
  
  return activitiesMap;
}

