import { NextRequest, NextResponse } from 'next/server';
import { fetchMutation } from 'convex/nextjs';
import { api } from '../../../../../convex/_generated/api';
import { fetchEngagementsForCompany } from '@/lib/hubspot/activities';
import { batchReadOne } from '@/lib/hubspot/batch-read-one';
import { batchReadCompaniesFull } from '@/lib/hubspot/companies';
import { resolveOwnerName } from '@/lib/hubspot/owners';
import { dedupeAssociationIds } from '@/lib/hubspot/normalize';
import {
  extractCustomProperties,
  generateHubSpotCompanyUrl,
  generateHubSpotContactUrl,
  generateHubSpotDealUrl,
} from '@/lib/hubspot/utils';

/**
 * Bridge endpoint the Convex processWebhookEvent action calls to do the
 * actual HubSpot fetch + Convex write. Lives in Next.js because it needs
 * the HubSpot lib code in src/lib/hubspot/* which Convex can't import.
 *
 * Auth: X-Cron-Secret header (same shared secret pattern as sync-all's
 * cron-auth bypass). Not a public endpoint — the webhook receiver itself
 * is public; this bridge is internal-only.
 *
 * Ten-minute lookback window for engagements is the "self-healing" design
 * choice — idempotent upsert makes re-reading recent history safe, and the
 * 10 min buffer catches delayed webhook deliveries without a per-company
 * watermark.
 */

export const maxDuration = 60; // Single-record fetches — plenty.

const OBJECT_TYPE_TO_NAME: Record<string, 'contact' | 'company' | 'deal'> = {
  '0-1': 'contact',
  '0-2': 'company',
  '0-3': 'deal',
};

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret');
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const { action, objectType, objectId } = body ?? {};
  if (!action || !objectType || !objectId) {
    return NextResponse.json(
      { error: 'missing action / objectType / objectId' },
      { status: 400 },
    );
  }

  const typeName = OBJECT_TYPE_TO_NAME[objectType];

  try {
    if (action === 'engagement') {
      // Engagement refresh — only valid for companies. HubSpot engagements
      // are always associated to a company via the v1 endpoint we use.
      if (typeName !== 'company') {
        return NextResponse.json({
          ok: true,
          noop: true,
          reason: `engagement action on non-company type ${objectType}`,
        });
      }
      const sinceIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const engagements = await fetchEngagementsForCompany(
        String(objectId),
        Number.POSITIVE_INFINITY,
        { since: sinceIso },
      );

      let synced = 0;
      let errors = 0;
      for (const eng of engagements) {
        try {
          const ownerName = eng.ownerId ? await resolveOwnerName(eng.ownerId) : null;
          const normalizedDirection =
            eng.direction === 'inbound' || eng.direction === 'outbound'
              ? eng.direction
              : undefined;
          await fetchMutation(api.hubspotSync.activities.syncActivityFromHubSpot, {
            hubspotActivityId: eng.id,
            activityType: eng.type,
            activityDate: eng.timestamp,
            subject: eng.subject,
            bodyPreview: eng.bodyPreview,
            bodyHtml: eng.bodyHtml,
            direction: normalizedDirection,
            status: eng.status,
            duration: eng.duration,
            fromEmail: eng.fromEmail,
            toEmails: eng.toEmails,
            outcome: eng.outcome,
            metadata: eng.metadata,
            sourceIntegration: eng.sourceIntegration,
            transcriptUrl: eng.transcriptUrl,
            hubspotCompanyId: String(objectId),
            hubspotContactIds: eng.contactIds,
            hubspotDealIds: eng.dealIds,
            hubspotOwnerId: eng.ownerId,
            ownerName: ownerName ?? undefined,
          });
          synced++;
        } catch (err) {
          // Per-engagement errors swallowed — the rest of the batch should
          // still succeed even if a single row is malformed. Top-level
          // errors still bubble so Convex can mark the event failed.
          errors++;
          console.error('[webhook-process] engagement upsert failed', err);
        }
      }

      return NextResponse.json({
        ok: true,
        action,
        companyId: String(objectId),
        sinceIso,
        synced,
        errors,
      });
    }

    if (action === 'object') {
      if (!typeName) {
        return NextResponse.json(
          { ok: false, error: `unknown objectType ${objectType}` },
          { status: 400 },
        );
      }

      if (typeName === 'company') {
        const [company] = await batchReadCompaniesFull([String(objectId)]);
        if (!company) {
          return NextResponse.json({
            ok: true,
            noop: true,
            reason: 'company not found in HubSpot',
          });
        }
        const props: any = company.properties ?? {};
        const ownerName = props.hubspot_owner_id
          ? await resolveOwnerName(props.hubspot_owner_id)
          : null;
        const customProperties = extractCustomProperties(props);
        const hubspotUrl = await generateHubSpotCompanyUrl(String(company.id));

        // Shape mirrors sync-all's companyData — only include fields that
        // have non-empty string values, same as the canonical path.
        const hasValue = (val: any): val is string =>
          val != null && val !== '' && typeof val === 'string';

        const rawName = props.name;
        const name =
          typeof rawName === 'string' && rawName.trim()
            ? rawName.trim()
            : `(unnamed company ${company.id})`;

        const hubspotContactIdsFromAssoc = dedupeAssociationIds(
          (company as any).associations?.contacts?.results ?? [],
        );
        const hubspotDealIdsFromAssoc = dedupeAssociationIds(
          (company as any).associations?.deals?.results ?? [],
        );

        const companyData: any = {
          hubspotCompanyId: String(company.id),
          name,
          lifecycleStage: props.lifecyclestage,
          customProperties,
          hubspotUrl: hubspotUrl || undefined,
          hubspotContactIds:
            hubspotContactIdsFromAssoc.length > 0 ? hubspotContactIdsFromAssoc : undefined,
          hubspotDealIds:
            hubspotDealIdsFromAssoc.length > 0 ? hubspotDealIdsFromAssoc : undefined,
        };
        if (hasValue(props.phone)) companyData.phone = props.phone;
        if (hasValue(props.domain)) companyData.website = props.domain;
        if (hasValue(props.address)) companyData.address = props.address;
        if (hasValue(props.city)) companyData.city = props.city;
        if (hasValue(props.state)) companyData.state = props.state;
        if (hasValue(props.zip)) companyData.zip = props.zip;
        if (hasValue(props.country)) companyData.country = props.country;
        if (hasValue(props.industry)) companyData.industry = props.industry;
        if (hasValue(props.hs_last_activity_date)) {
          companyData.lastActivityDate = props.hs_last_activity_date;
        }
        if (hasValue(props.hs_last_contacted_date)) {
          companyData.lastContactedDate = props.hs_last_contacted_date;
        }
        if (hasValue(props.hubspot_owner_id)) {
          companyData.hubspotOwnerId = props.hubspot_owner_id;
          companyData.ownerName = ownerName ?? undefined;
        }

        await fetchMutation(api.hubspotSync.syncCompanyFromHubSpot as any, companyData);

        return NextResponse.json({
          ok: true,
          action,
          companyId: String(objectId),
          synced: 1,
        });
      }

      if (typeName === 'contact') {
        const contact = await batchReadOne('contacts', String(objectId));
        if (!contact) {
          return NextResponse.json({
            ok: true,
            noop: true,
            reason: 'contact not found in HubSpot',
          });
        }
        const props: any = contact.properties ?? {};
        const ownerName = props.hubspot_owner_id
          ? await resolveOwnerName(props.hubspot_owner_id)
          : null;
        const customProperties = extractCustomProperties(props);
        const hubspotUrl = await generateHubSpotContactUrl(String(contact.id));

        const hasValue = (val: any): val is string =>
          val != null && val !== '' && typeof val === 'string';

        const name = `${props.firstname || ''} ${props.lastname || ''}`.trim();
        if (!name) {
          return NextResponse.json({
            ok: true,
            noop: true,
            reason: 'contact has no name — skipping (matches sync-all behavior)',
          });
        }

        const hubspotCompanyIds = dedupeAssociationIds(
          (contact as any).associations?.companies?.results ?? [],
        );
        const hubspotDealIds = dedupeAssociationIds(
          (contact as any).associations?.deals?.results ?? [],
        );

        const contactData: any = {
          hubspotContactId: String(contact.id),
          name,
          lifecycleStage: props.lifecyclestage,
          customProperties,
          hubspotUrl: hubspotUrl || undefined,
          hubspotCompanyIds: hubspotCompanyIds.length > 0 ? hubspotCompanyIds : undefined,
          hubspotDealIds: hubspotDealIds.length > 0 ? hubspotDealIds : undefined,
        };
        if (hasValue(props.email)) contactData.email = props.email;
        if (hasValue(props.phone)) contactData.phone = props.phone;
        else if (hasValue(props.mobilephone)) contactData.phone = props.mobilephone;
        if (hasValue(props.company)) contactData.company = props.company;
        if (hasValue(props.jobtitle)) contactData.role = props.jobtitle;
        if (hasValue(props.notes_last_contacted)) {
          contactData.lastContactedDate = props.notes_last_contacted;
        } else if (hasValue(props.lastcontacteddate)) {
          contactData.lastContactedDate = props.lastcontacteddate;
        }
        if (hasValue(props.notes_last_updated)) {
          contactData.lastActivityDate = props.notes_last_updated;
        }
        if (hasValue(props.hubspot_owner_id)) {
          contactData.hubspotOwnerId = props.hubspot_owner_id;
        }
        if (ownerName) {
          // Keep ownerName only if hubspotOwnerId also present (mirrors sync-all).
          if (contactData.hubspotOwnerId) contactData.ownerName = ownerName;
        }
        const linkedinIdentifier = props.hublead_linkedin_public_identifier;
        if (
          linkedinIdentifier &&
          typeof linkedinIdentifier === 'string' &&
          linkedinIdentifier.trim()
        ) {
          contactData.linkedinUrl = `https://www.linkedin.com/in/${linkedinIdentifier.trim()}`;
        }

        await fetchMutation(api.hubspotSync.syncContactFromHubSpot as any, contactData);

        return NextResponse.json({
          ok: true,
          action,
          contactId: String(objectId),
          synced: 1,
        });
      }

      if (typeName === 'deal') {
        const deal = await batchReadOne('deals', String(objectId));
        if (!deal) {
          return NextResponse.json({
            ok: true,
            noop: true,
            reason: 'deal not found in HubSpot',
          });
        }
        const props: any = deal.properties ?? {};
        const customProperties = extractCustomProperties(props);
        const hubspotUrl = await generateHubSpotDealUrl(String(deal.id));

        const companyIds = dedupeAssociationIds(
          (deal as any).associations?.companies?.results ?? [],
        );
        const contactIds = dedupeAssociationIds(
          (deal as any).associations?.contacts?.results ?? [],
        );

        const amount = props.amount ? parseFloat(props.amount) : undefined;

        const rawDealName = props.dealname;
        const dealName =
          typeof rawDealName === 'string' && rawDealName.trim()
            ? rawDealName.trim()
            : `(unnamed deal ${deal.id})`;

        const optStr = (v: any): string | undefined =>
          typeof v === 'string' && v.trim() ? v : undefined;

        const dealData: any = {
          hubspotDealId: String(deal.id),
          name: dealName,
          amount,
          stage: optStr(props.dealstage),
          pipeline: optStr(props.pipeline),
          closeDate: optStr(props.closedate),
          dealType: optStr(props.dealtype),
          hubspotOwnerId: optStr(props.hubspot_owner_id),
          companyIds: companyIds.length > 0 ? companyIds : undefined,
          contactIds: contactIds.length > 0 ? contactIds : undefined,
          customProperties,
          hubspotUrl: hubspotUrl || undefined,
        };

        const probRaw = props.hs_deal_stage_probability;
        if (probRaw != null && probRaw !== '') {
          const n = parseFloat(String(probRaw));
          if (Number.isFinite(n)) dealData.probability = n;
        }
        if (props.spv_name != null && props.spv_name !== '') {
          dealData.spvName = props.spv_name;
        }
        if (props.hs_is_closed != null) {
          dealData.isClosed =
            props.hs_is_closed === 'true' || props.hs_is_closed === true;
        }
        if (props.hs_is_closed_won != null) {
          dealData.isClosedWon =
            props.hs_is_closed_won === 'true' || props.hs_is_closed_won === true;
        }
        // NB: syncDealToDealsTable (writes to `deals` table), NOT
        // syncDealFromHubSpot (legacy, writes to `projects` table).
        await fetchMutation(api.hubspotSync.syncDealToDealsTable as any, dealData);

        return NextResponse.json({
          ok: true,
          action,
          dealId: String(objectId),
          synced: 1,
        });
      }
    }

    if (action === 'delete') {
      const result = await fetchMutation(api.hubspotSync.archive.archiveHubSpotRecord, {
        objectType: String(objectType),
        hubspotId: String(objectId),
      });
      return NextResponse.json({ ok: true, action, ...result });
    }

    return NextResponse.json(
      { ok: false, error: `unknown action: ${action}` },
      { status: 400 },
    );
  } catch (err: any) {
    // Top-level errors ARE surfaced as 500 so the Convex caller sees them
    // and marks the webhook event failed. Per-engagement errors inside the
    // loop are swallowed above; this path is for hard failures (HubSpot
    // fetch rejected, mutation schema violation, network, etc.).
    console.error('[webhook-process] handler error', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
