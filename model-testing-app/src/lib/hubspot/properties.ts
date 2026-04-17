/**
 * HubSpot property discovery — lists all properties defined on an object type
 * for this tenant. Used at sync start to harvest the full property payload.
 */

export type PropertyDef = {
  name: string;
  label: string;
  type: string;
  fieldType?: string;
  groupName?: string;
  description?: string;
  hubspotDefined?: boolean;
};

const cache = new Map<string, PropertyDef[]>();

export function clearPropertiesCache(): void {
  cache.clear();
}

export async function discoverProperties(
  objectType: 'companies' | 'contacts' | 'deals',
): Promise<PropertyDef[]> {
  if (cache.has(objectType)) {
    return cache.get(objectType)!;
  }

  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) {
    throw new Error('HUBSPOT_API_KEY not set');
  }

  const res = await fetch(`https://api.hubapi.com/crm/v3/properties/${objectType}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot properties discovery failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { results?: PropertyDef[] };
  const results = data.results ?? [];
  cache.set(objectType, results);
  return results;
}
