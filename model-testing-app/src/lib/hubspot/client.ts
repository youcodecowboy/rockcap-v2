import { Client } from '@hubspot/api-client';
import { getHubspotApiKey } from './http';

/**
 * Get HubSpot client using API key from environment
 * HubSpot private app access tokens should be used with accessToken parameter
 */
export const getHubSpotClient = () => {
  const apiKey = getHubspotApiKey();

  // HubSpot private app access tokens (format: eu1-xxx or us1-xxx) use accessToken
  // For SDK v13+, we need to use accessToken for private app tokens
  const client = new Client({ accessToken: apiKey });

  return client;
};

/**
 * Get HubSpot portal ID from environment or API
 */
export const getHubSpotPortalId = async (client?: Client): Promise<string | null> => {
  const portalId = process.env.HUBSPOT_PORTAL_ID;
  if (portalId) {
    return portalId;
  }
  
  // Try to get from API if not in env
  if (client) {
    try {
      const accountInfo: any = await client.apiRequest({
        method: 'GET',
        path: '/integrations/v1/me',
      });
      return accountInfo?.portalId?.toString() || null;
    } catch (error) {
      console.error('Failed to get portal ID from API:', error);
      return null;
    }
  }
  
  return null;
};

