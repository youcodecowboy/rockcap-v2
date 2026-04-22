/**
 * HubSpot engagement activities — fetched via the legacy v1 endpoint because
 * /crm/v3/objects/{type}/search requires crm.objects.emails.read granular scope
 * which is not available in Service Keys beta. The v1 endpoint accepts
 * sales-email-read (which we have) and returns all engagement types unified.
 */

import { getHubspotApiKey } from './http';
import { isFirefliesTranscript, parseFirefliesTranscript } from './fireflies';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export type EngagementType =
  | 'EMAIL'
  | 'INCOMING_EMAIL'
  | 'MEETING'
  | 'MEETING_NOTE'
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
  sourceIntegration?: 'fireflies';
  transcriptUrl?: string;
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
    const body = md.body;
    // Detect Fireflies.ai-generated call transcripts by content
    // signature (HubSpot doesn't attach integration source metadata —
    // see fireflies.ts for rationale).
    if (isFirefliesTranscript(body)) {
      const parsed = parseFirefliesTranscript(body);
      // Reclassify: this activity becomes a MEETING_NOTE — same
      // activity record, different type. Downstream (UI, filters)
      // treats it as a meeting-related artefact rather than a note.
      base.type = 'MEETING_NOTE';
      base.subject = parsed.title ?? 'Call transcript';
      base.bodyHtml = body;
      base.bodyPreview = body ? stripHtml(body).slice(0, 400) : undefined;
      base.duration = parsed.duration;
      base.toEmails = parsed.participantEmails;
      base.sourceIntegration = 'fireflies';
      base.transcriptUrl = parsed.transcriptUrl;
    } else {
      // Plain human note — unchanged from before.
      base.bodyHtml = body;
      base.bodyPreview = body ? stripHtml(body).slice(0, 400) : undefined;
    }
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
  opts: { since?: string } = {},
): Promise<HubSpotEngagement[]> {
  const apiKey = getHubspotApiKey();

  // Incremental window. The v1 engagements-associated-by-company endpoint
  // doesn't accept a native `since` query param, but engagements come back
  // newest-first — so we can still early-exit the paging loop once we hit
  // a page where every engagement is older than the window. Skipping stale
  // history on a 20K-engagement account is the difference between a
  // 15-minute sync and a 5-second one.
  const sinceMs = opts.since ? new Date(opts.since).getTime() : 0;
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

    if (sinceMs > 0) {
      const fresh = parsed.filter(
        (e) => new Date(e.timestamp).getTime() >= sinceMs,
      );
      results.push(...fresh);
      // Page had rows but none were in the window → we've paged past the
      // cutoff; stop rather than reading further history.
      if (parsed.length > 0 && fresh.length === 0) break;
    } else {
      results.push(...parsed);
    }

    if (!data.hasMore || parsed.length === 0) break;
    offset = data.offset ?? (offset + pageSize);

    await new Promise((r) => setTimeout(r, 100));
  }

  return results;
}

// NOTE: the global `/engagements/v1/engagements/recent/modified` endpoint
// was briefly used as an incremental-sync shortcut (commit c57ce15) but
// reverted — that endpoint returns email bodies as "[redacted]" template
// text regardless of scope. Only the per-company associated endpoint
// (`fetchEngagementsForCompany` above) returns real bodies with
// sales-email-read. Incremental perf is now handled by filtering the
// company list on `lastActivityDate` upstream in sync-all/route.ts
// before iterating.
