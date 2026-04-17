/**
 * HubSpot engagement activities — fetched via the legacy v1 endpoint because
 * /crm/v3/objects/{type}/search requires crm.objects.emails.read granular scope
 * which is not available in Service Keys beta. The v1 endpoint accepts
 * sales-email-read (which we have) and returns all engagement types unified.
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export type EngagementType =
  | 'EMAIL'
  | 'INCOMING_EMAIL'
  | 'MEETING'
  | 'CALL'
  | 'NOTE'
  | 'TASK';

export interface HubSpotEngagement {
  id: string;
  type: EngagementType | 'UNKNOWN';
  timestamp: string; // ISO
  subject?: string;
  bodyPreview?: string;
  bodyHtml?: string;
  direction?: string;
  status?: string;
  duration?: number;
  fromEmail?: string;
  toEmails?: string[];
  outcome?: string;
  metadata?: Record<string, unknown>;
  ownerId?: string;
  companyIds: string[];
  contactIds: string[];
  dealIds: string[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseEngagement(raw: any): HubSpotEngagement | null {
  const eng = raw.engagement ?? raw;
  const md = raw.metadata ?? {};
  if (!eng?.id || !eng?.type) return null;

  const type = eng.type as EngagementType;
  const timestamp = new Date(eng.timestamp ?? Date.now()).toISOString();

  const base: HubSpotEngagement = {
    id: String(eng.id),
    type,
    timestamp,
    ownerId: eng.ownerId ? String(eng.ownerId) : undefined,
    companyIds: (raw.associations?.companyIds ?? []).map(String),
    contactIds: (raw.associations?.contactIds ?? []).map(String),
    dealIds: (raw.associations?.dealIds ?? []).map(String),
    metadata: md,
  };

  if (type === 'EMAIL' || type === 'INCOMING_EMAIL') {
    base.subject = md.subject;
    base.bodyHtml = md.html;
    base.bodyPreview = md.html ? stripHtml(md.html).slice(0, 400) : md.text?.slice(0, 400);
    base.direction = type === 'EMAIL' ? 'outbound' : 'inbound';
    base.status = md.status;
    base.fromEmail = md.from?.email;
    base.toEmails = (md.to ?? []).map((t: any) => t.email).filter(Boolean);
  } else if (type === 'MEETING') {
    base.subject = md.title;
    base.bodyPreview = md.body ? stripHtml(md.body).slice(0, 400) : undefined;
    base.duration = md.startTime && md.endTime
      ? Number(md.endTime) - Number(md.startTime)
      : undefined;
    base.outcome = md.meetingOutcome;
  } else if (type === 'CALL') {
    base.subject = md.title;
    base.duration = md.durationMilliseconds;
    base.direction = md.toNumber ? 'outbound' : 'inbound';
    base.status = md.status;
    base.bodyPreview = md.body ? stripHtml(md.body).slice(0, 400) : undefined;
  } else if (type === 'NOTE') {
    base.bodyHtml = md.body;
    base.bodyPreview = md.body ? stripHtml(md.body).slice(0, 400) : undefined;
  } else if (type === 'TASK') {
    base.subject = md.subject;
    base.status = md.status;
    base.bodyPreview = md.body ? stripHtml(md.body).slice(0, 400) : undefined;
  }

  return base;
}

/**
 * Fetch all engagements for a given company, paginating until exhausted.
 */
export async function fetchEngagementsForCompany(
  companyId: string,
  maxRecords: number = Number.POSITIVE_INFINITY,
): Promise<HubSpotEngagement[]> {
  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) throw new Error('HUBSPOT_API_KEY not set');

  const results: HubSpotEngagement[] = [];
  let offset = 0;
  const pageSize = 100;

  while (results.length < maxRecords) {
    const url = `${HUBSPOT_API_BASE}/engagements/v1/engagements/associated/company/${companyId}?limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot engagements fetch failed for company ${companyId}: ${res.status} ${text.slice(0, 200)}`);
    }

    const data = await res.json() as {
      results?: any[];
      hasMore?: boolean;
      offset?: number;
    };

    const parsed = (data.results ?? [])
      .map(parseEngagement)
      .filter((e): e is HubSpotEngagement => e !== null);

    results.push(...parsed);

    if (!data.hasMore || parsed.length === 0) break;
    offset = data.offset ?? (offset + pageSize);

    await new Promise((r) => setTimeout(r, 100));
  }

  return results;
}
