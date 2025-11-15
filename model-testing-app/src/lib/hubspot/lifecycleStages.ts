/**
 * HubSpot lifecycle stage definitions
 * These are standard across HubSpot accounts
 */

export const LIFECYCLE_STAGES: Record<string, string> = {
  'subscriber': 'Subscriber',
  'lead': 'Lead',
  'marketingqualifiedlead': 'Marketing Qualified Lead',
  'salesqualifiedlead': 'Sales Qualified Lead',
  'opportunity': 'Opportunity',
  'customer': 'Customer',
  'evangelist': 'Evangelist',
  'other': 'Other',
};

/**
 * Get human-readable lifecycle stage name from stage ID/value
 */
export function getLifecycleStageName(stageId: string | null | undefined): string | undefined {
  if (!stageId) return undefined;
  
  const normalized = stageId.toLowerCase().trim();
  return LIFECYCLE_STAGES[normalized] || stageId; // Return original if not found
}

/**
 * Check if a lifecycle stage indicates a lead/prospect
 */
export function isLeadLifecycleStage(stageId: string | null | undefined): boolean {
  if (!stageId) return false;
  
  const normalized = stageId.toLowerCase().trim();
  return [
    'lead',
    'marketingqualifiedlead',
    'salesqualifiedlead',
    'opportunity',
  ].includes(normalized);
}

