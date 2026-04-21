import { NextRequest, NextResponse } from 'next/server';
import { getHubSpotClient } from '@/lib/hubspot/client';

// Full-account incremental syncs iterate through every company to fetch
// engagements — on a ~500-company / 20K-engagement portal that regularly
// runs 3–5 minutes. Vercel's default timeout (10s hobby, 60s pro) kills
// the function mid-sweep. Pro supports up to 300s; Fluid supports 900s.
// Bumping to 300s covers current account size with headroom; if we cross
// the limit we'll need to shard (e.g. Convex scheduler per-company).
export const maxDuration = 300;
import { fetchAllCompaniesFromHubSpot } from '@/lib/hubspot/companies';
import { fetchAllContactsFromHubSpot } from '@/lib/hubspot/contacts';
import { fetchAllDealsFromHubSpot } from '@/lib/hubspot/deals';
import { extractCustomProperties, generateHubSpotCompanyUrl, generateHubSpotContactUrl, generateHubSpotDealUrl } from '@/lib/hubspot/utils';
import { discoverProperties, clearPropertiesCache } from '@/lib/hubspot/properties';
import { clearOwnersCache, resolveOwnerName } from '@/lib/hubspot/owners';
import { fetchEngagementsForCompany } from '@/lib/hubspot/activities';
import { fetchCompanyIdsWithActivitySince } from '@/lib/hubspot/incremental';
import { dedupeAssociationIds } from '@/lib/hubspot/normalize';
import { api } from '../../../../../convex/_generated/api';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { ErrorResponses } from '@/lib/api/errorResponse';

export async function POST(request: NextRequest) {
  try {
    // Check authentication. The Convex cron path calls this endpoint
    // without a Clerk session but with a shared-secret header, so we
    // short-circuit requireAuth when the secret matches. No public
    // exposure — the secret lives only in the Convex deployment's env
    // and the Next.js deployment's env, both operator-controlled.
    const cronSecret = request.headers.get('x-cron-secret');
    const isAuthorisedCron =
      !!cronSecret &&
      !!process.env.CRON_SECRET &&
      cronSecret === process.env.CRON_SECRET;

    // Diagnostic only when auth fails. Logs presence + lengths without
    // the secret values. Lets future secret-rotation / env-misconfig
    // debugging stay self-service — healthy runs don't need the noise.
    if (cronSecret && !isAuthorisedCron) {
      console.warn(
        `[sync-all] cron secret rejected — ` +
        `env_present=${!!process.env.CRON_SECRET} ` +
        `header_len=${cronSecret.length} ` +
        `env_len=${process.env.CRON_SECRET?.length ?? 0} ` +
        `lengths_match=${process.env.CRON_SECRET?.length === cronSecret.length}`,
      );
    }

    const convexClient = await getAuthenticatedConvexClient();
    if (!isAuthorisedCron) {
      try {
        await requireAuth(convexClient);
      } catch (authError) {
        return ErrorResponses.unauthenticated();
      }
    }
    const {
      maxRecords = Number.POSITIVE_INFINITY,
      syncCompanies = true,
      syncContacts = true,
      syncDeals = true,
      syncActivities = true,
      // Incremental-sync controls:
      //   mode='incremental' (default) → pass config.lastSyncAt as `since` to
      //     each fetcher. The fetchers will use HubSpot's search API to pull
      //     only records modified since that timestamp. First sync (no
      //     lastSyncAt) falls back to a full fetch automatically.
      //   mode='full' → ignore lastSyncAt and re-sync everything.
      mode = 'incremental',
      // `sinceOverride` (ISO string) — when set, uses this value as the
      // incremental cursor for THIS run only, without touching the stored
      // config.lastSyncAt. Useful for targeted backdated repair runs
      // ("re-sync the last 5 days") without disrupting the ongoing cron's
      // normal incremental window.
      sinceOverride,
    } = await request.json().catch(() => ({}));

    const client = getHubSpotClient();
    const stats = {
      companiesSynced: 0,
      contactsSynced: 0,
      dealsSynced: 0,
      errors: 0,
    };

    const errorMessages: string[] = [];

    // Resolve `since`.
    //   - sinceOverride (caller-supplied) wins. Used for one-off backdated
    //     repair runs. The override is NOT written back to config, so the
    //     regular cron's incremental cursor stays put.
    //   - Otherwise, for incremental mode, use the stored lastSyncAt.
    //   - Full mode ignores `since` entirely.
    let since: string | undefined;
    const overrideActive = typeof sinceOverride === 'string' && sinceOverride.length > 0;
    if (overrideActive) {
      since = sinceOverride;
      console.log(`[sync-all] Override mode: since=${since} (config.lastSyncAt untouched)`);
    } else if (mode === 'incremental') {
      try {
        const config = await fetchQuery(api.hubspotSync.getSyncConfig as any, {}) as any;
        if (config?.lastSyncAt) {
          since = config.lastSyncAt;
          console.log(`[sync-all] Incremental mode enabled: since=${since}`);
        } else {
          console.log(`[sync-all] Incremental mode requested but no lastSyncAt — falling back to full sync`);
        }
      } catch (e) {
        console.warn(`[sync-all] Could not read lastSyncAt; doing full sync:`, e);
      }
    } else {
      console.log(`[sync-all] Full sync requested (mode=full)`);
    }

    // Update sync status to in_progress
    await fetchMutation(api.hubspotSync.updateSyncStatus as any, {
      status: 'in_progress',
    }) as any;

    // Warm property/owner caches at sync start so downstream fetchers don't re-discover per call
    clearPropertiesCache();
    clearOwnersCache();
    await discoverProperties('companies');
    await discoverProperties('contacts');
    await discoverProperties('deals');

    // Sync companies (to companies table, not clients)
    if (syncCompanies) {
      try {
        const companies = await fetchAllCompaniesFromHubSpot(client, maxRecords, { since });
        
        for (const company of companies) {
          try {
            const hubspotUrl = await generateHubSpotCompanyUrl(company.id);
            const customProperties = extractCustomProperties(company.properties);
            
            // Filter out null/undefined/empty values before sending to mutation
            // Convex doesn't accept null - only actual values or undefined (omitted)
            const hasValue = (val: any): val is string => {
              return val != null && val !== '' && typeof val === 'string';
            };
            
            // Name fallback — HubSpot allows empty-name companies; mutation
            // requires v.string(). Use a sensible fallback so every company
            // lands in Convex and can be linked to by its contacts/deals.
            const rawName = company.properties.name;
            const name = (typeof rawName === 'string' && rawName.trim())
              ? rawName.trim()
              : `(unnamed company ${company.id})`;

            // Extract and dedupe association IDs so the mutation's linker
            // can resolve contacts/deals back to this company.
            const hubspotContactIdsFromAssoc = dedupeAssociationIds(
              (company as any).associations?.contacts?.results ?? [],
            );
            const hubspotDealIdsFromAssoc = dedupeAssociationIds(
              (company as any).associations?.deals?.results ?? [],
            );

            const companyData: any = {
              hubspotCompanyId: company.id,
              name,
              lifecycleStage: company.properties.lifecyclestage,
              customProperties,
              hubspotUrl: hubspotUrl || undefined,
              hubspotContactIds: hubspotContactIdsFromAssoc.length > 0 ? hubspotContactIdsFromAssoc : undefined,
              hubspotDealIds: hubspotDealIdsFromAssoc.length > 0 ? hubspotDealIdsFromAssoc : undefined,
            };
            
            // Only include fields that have actual non-null, non-empty string values
            if (hasValue(company.properties.phone)) {
              companyData.phone = company.properties.phone;
            }
            if (hasValue(company.properties.domain)) {
              companyData.website = company.properties.domain;
            }
            if (hasValue(company.properties.address)) {
              companyData.address = company.properties.address;
            }
            if (hasValue(company.properties.city)) {
              companyData.city = company.properties.city;
            }
            if (hasValue(company.properties.state)) {
              companyData.state = company.properties.state;
            }
            if (hasValue(company.properties.zip)) {
              companyData.zip = company.properties.zip;
            }
            if (hasValue(company.properties.country)) {
              companyData.country = company.properties.country;
            }
            if (hasValue(company.properties.industry)) {
              companyData.industry = company.properties.industry;
            }

            // Activity timestamps — enable the incremental engagement sync
            // to skip companies with no recent movement. Without these the
            // filter would have nothing to key on and every company would
            // be walked on every tick.
            if (hasValue(company.properties.hs_last_activity_date)) {
              companyData.lastActivityDate = company.properties.hs_last_activity_date;
            }
            if (hasValue(company.properties.hs_last_contacted_date)) {
              companyData.lastContactedDate = company.properties.hs_last_contacted_date;
            }
            if (hasValue(company.properties.hubspot_owner_id)) {
              companyData.ownerName = await resolveOwnerName(company.properties.hubspot_owner_id) ?? undefined;
            }

            await fetchMutation(api.hubspotSync.syncCompanyFromHubSpot as any, companyData) as any;
            
            stats.companiesSynced++;
          } catch (error: any) {
            stats.errors++;
            errorMessages.push(`Company ${company.id}: ${error.message}`);
          }
        }
      } catch (error: any) {
        stats.errors++;
        errorMessages.push(`Companies sync error: ${error.message}`);
      }
    }
    
    // Sync contacts
    if (syncContacts) {
      try {
        const contacts = await fetchAllContactsFromHubSpot(client, maxRecords, { since });

        for (const contact of contacts) {
          try {
            const hubspotUrl = await generateHubSpotContactUrl(contact.id);
            const customProperties = extractCustomProperties(contact.properties);

            const name = `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim();
            if (!name) {
              continue;
            }

            // Filter out null/undefined/empty values for contacts too
            const hasValue = (val: any): val is string => {
              return val != null && val !== '' && typeof val === 'string';
            };

            // Extract and dedupe HubSpot association IDs so the mutation can
            // resolve them to Convex company/deal records. HubSpot returns both
            // HUBSPOT_DEFINED and USER_DEFINED association entries for the same
            // pair — dedupeAssociationIds collapses them.
            const hubspotCompanyIds = dedupeAssociationIds(
              (contact as any).associations?.companies?.results ?? [],
            );
            const hubspotDealIds = dedupeAssociationIds(
              (contact as any).associations?.deals?.results ?? [],
            );

            const contactData: any = {
              hubspotContactId: contact.id,
              name,
              lifecycleStage: contact.properties.lifecyclestage,
              customProperties,
              hubspotUrl: hubspotUrl || undefined,
              // Always pass the HubSpot ID arrays — the mutation's linker will
              // resolve them to Convex IDs when companies/deals are synced.
              hubspotCompanyIds: hubspotCompanyIds.length > 0 ? hubspotCompanyIds : undefined,
              hubspotDealIds: hubspotDealIds.length > 0 ? hubspotDealIds : undefined,
            };

            // Only include fields that have actual non-null, non-empty string values
            if (hasValue(contact.properties.email)) {
              contactData.email = contact.properties.email;
            }
            // Phone: prefer primary; fall back to mobilephone when primary empty
            if (hasValue(contact.properties.phone)) {
              contactData.phone = contact.properties.phone;
            } else if (hasValue(contact.properties.mobilephone)) {
              contactData.phone = contact.properties.mobilephone;
            }
            if (hasValue(contact.properties.company)) {
              contactData.company = contact.properties.company;
            }
            if (hasValue(contact.properties.jobtitle)) {
              contactData.role = contact.properties.jobtitle;
            }
            // Activity dates — use tenant-populated `notes_last_*` fields
            if (hasValue(contact.properties.notes_last_contacted)) {
              contactData.lastContactedDate = contact.properties.notes_last_contacted;
            } else if (hasValue(contact.properties.lastcontacteddate)) {
              contactData.lastContactedDate = contact.properties.lastcontacteddate;
            }
            if (hasValue(contact.properties.notes_last_updated)) {
              contactData.lastActivityDate = contact.properties.notes_last_updated;
            }
            const linkedinIdentifier = contact.properties.hublead_linkedin_public_identifier;
            if (linkedinIdentifier && typeof linkedinIdentifier === 'string' && linkedinIdentifier.trim()) {
              contactData.linkedinUrl = `https://www.linkedin.com/in/${linkedinIdentifier.trim()}`;
            }

            await fetchMutation(api.hubspotSync.syncContactFromHubSpot as any, contactData) as any;

            stats.contactsSynced++;
          } catch (error: any) {
            stats.errors++;
            errorMessages.push(`Contact ${contact.id}: ${error.message}`);
          }
        }
      } catch (error: any) {
        stats.errors++;
        errorMessages.push(`Contacts sync error: ${error.message}`);
      }
    }
    
    // Sync deals (skip if there are no deals or if fetching fails)
    if (syncDeals) {
      try {
        // Try to fetch deals, but don't fail the whole sync if it errors
        let deals: any[] = [];
        try {
          const dealsResult = await fetchAllDealsFromHubSpot(client, maxRecords, undefined, { since });
          deals = dealsResult.deals;
        } catch (dealsError: any) {
          console.error('Failed to fetch deals, skipping:', dealsError.message);
          errorMessages.push(`Deals sync skipped: ${dealsError.message}`);
          // Continue without failing the whole sync
        }
        
        for (const deal of deals) {
          try {
            const hubspotUrl = await generateHubSpotDealUrl(deal.id);
            const customProperties = extractCustomProperties(deal.properties);

            // Extract and dedupe association IDs from deal (mirrors company / contact patterns).
            const companyIds = dedupeAssociationIds(
              (deal as any).associations?.companies?.results ?? [],
            );
            const contactIds = dedupeAssociationIds(
              (deal as any).associations?.contacts?.results ?? [],
            );

            const amount = deal.properties.amount
              ? parseFloat(deal.properties.amount)
              : undefined;

            // Name fallback — HubSpot allows empty-name deals (draft pipelines, auto-
            // created from meetings). Mutation requires v.string().
            const rawDealName = deal.properties.dealname;
            const dealName = (typeof rawDealName === 'string' && rawDealName.trim())
              ? rawDealName.trim()
              : `(unnamed deal ${deal.id})`;

            // Convex v.optional(v.string()) accepts undefined but REJECTS null.
            // HubSpot returns null for unset fields — coerce to undefined.
            const optStr = (v: any): string | undefined =>
              (typeof v === 'string' && v.trim()) ? v : undefined;

            const dealData: any = {
              hubspotDealId: deal.id,
              name: dealName,
              amount,
              stage: optStr(deal.properties.dealstage),
              pipeline: optStr(deal.properties.pipeline),
              closeDate: optStr(deal.properties.closedate),
              dealType: optStr(deal.properties.dealtype),
              hubspotOwnerId: optStr(deal.properties.hubspot_owner_id),
              companyIds: companyIds.length > 0 ? companyIds : undefined,
              contactIds: contactIds.length > 0 ? contactIds : undefined,
              customProperties,
              hubspotUrl: hubspotUrl || undefined,
            };

            const probRaw = deal.properties.hs_deal_stage_probability;
            if (probRaw != null && probRaw !== '') {
              const n = parseFloat(String(probRaw));
              if (Number.isFinite(n)) dealData.probability = n;
            }
            if (deal.properties.spv_name != null && deal.properties.spv_name !== '') {
              dealData.spvName = deal.properties.spv_name;
            }
            if (deal.properties.hs_is_closed != null) {
              dealData.isClosed = deal.properties.hs_is_closed === 'true' || deal.properties.hs_is_closed === true;
            }
            if (deal.properties.hs_is_closed_won != null) {
              dealData.isClosedWon = deal.properties.hs_is_closed_won === 'true' || deal.properties.hs_is_closed_won === true;
            }

            // NB: call syncDealToDealsTable (writes to `deals` table) — NOT
            // syncDealFromHubSpot (legacy, writes to `projects` table).
            await fetchMutation(api.hubspotSync.syncDealToDealsTable as any, dealData) as any;

            stats.dealsSynced++;
          } catch (error: any) {
            stats.errors++;
            errorMessages.push(`Deal ${deal.id}: ${error.message}`);
          }
        }
      } catch (error: any) {
        stats.errors++;
        errorMessages.push(`Deals sync error: ${error.message}`);
      }
    }
    
    // Engagement sync: always per-company (the only endpoint that returns
    // full email bodies with the `sales-email-read` scope — the legacy v1
    // `/recent/modified` global endpoint unconditionally redacts bodies).
    //
    // Incremental speedup: ask HubSpot directly which companies had
    // engagement activity in the window. A single search on
    // `hs_last_activity_date >= since` across the whole portal returns
    // the exact set we need to walk — no dependency on any cached Convex
    // field. Turns "walk all 2600 companies" into "walk the 20 that
    // actually had activity."
    //
    // Full sweep (no `since`) still walks every company in the Convex
    // table — that's the backfill path.
    if (syncActivities) {
      try {
        const allCompanies = await fetchQuery(api.companies.listWithHubspotId, {}) as any[];
        let candidates: any[];
        if (since) {
          const recentIds = await fetchCompanyIdsWithActivitySince(since);
          const recentSet = new Set(recentIds);
          candidates = allCompanies.filter((c) =>
            recentSet.has(String(c.hubspotCompanyId)),
          );
          console.log(
            `[sync-all] engagements — HubSpot search reported ${recentIds.length} ` +
            `companies with activity since ${since}; ${candidates.length} of those ` +
            `are in our Convex companies table (rest are un-synced HubSpot companies)`,
          );
        } else {
          candidates = allCompanies;
        }

        let engagementTotal = 0;
        let engagementErrors = 0;
        const startedAt = Date.now();
        console.log(
          `[sync-all] engagements — walking ${candidates.length}/${allCompanies.length} companies` +
          `${since ? ` (HubSpot-filtered by hs_last_activity_date >= ${since})` : ' (full sweep)'}`,
        );

        const upsertEngagement = async (eng: any, hubspotCompanyId: string) => {
          const normalizedDirection =
            eng.direction === 'inbound' || eng.direction === 'outbound' ? eng.direction : undefined;
          const ownerName = eng.ownerId ? await resolveOwnerName(eng.ownerId) : null;
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
            hubspotCompanyId,
            hubspotContactIds: eng.contactIds,
            hubspotDealIds: eng.dealIds,
            hubspotOwnerId: eng.ownerId,
            ownerName: ownerName ?? undefined,
          });
        };

        for (let i = 0; i < candidates.length; i++) {
          const company = candidates[i];
          if (i > 0 && i % 25 === 0) {
            const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
            console.log(
              `[sync-all] engagements — progress ${i}/${candidates.length} ` +
              `(${engagementTotal} synced, ${engagementErrors} errors, ${elapsedSec}s elapsed)`,
            );
          }
          try {
            const engagements = await fetchEngagementsForCompany(
              company.hubspotCompanyId,
              Number.POSITIVE_INFINITY,
              since ? { since } : {},
            );
            for (const eng of engagements) {
              try {
                await upsertEngagement(eng, company.hubspotCompanyId);
                engagementTotal++;
              } catch (engErr) {
                engagementErrors++;
                console.error(`[sync-all] engagement ${eng.id} failed:`, engErr);
              }
            }
          } catch (companyErr) {
            engagementErrors++;
            console.error(`[sync-all] engagements for company ${company.hubspotCompanyId} failed:`, companyErr);
          }
        }

        console.log(`[sync-all] Engagements: ${engagementTotal} upserted, ${engagementErrors} errors`);
        (stats as any).activitiesSynced = engagementTotal;
      } catch (err) {
        console.error('[sync-all] activity sync phase failed:', err);
        stats.errors++;
        errorMessages.push(`Activity sync failed: ${(err as Error).message}`);
      }
    }

    // Update sync status — but ONLY on regular (non-override) runs.
    // Override runs are one-off repairs; writing `success` + a new
    // lastSyncAt would clobber the cron's incremental cursor and make
    // the next regular tick miss everything that happened during the
    // override's window.
    if (!overrideActive) {
      await fetchMutation(api.hubspotSync.updateSyncStatus as any, {
        status: stats.errors > 0 ? 'error' : 'success',
        stats,
      }) as any;
    } else {
      console.log('[sync-all] override run — skipping updateSyncStatus to preserve cron cursor');
    }

    return NextResponse.json({
      success: true,
      stats,
      errorMessages: errorMessages.slice(0, 20), // Limit error messages
      overrideActive,
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    
    // Update sync status to error
    try {
      await fetchMutation(api.hubspotSync.updateSyncStatus as any, {
        status: 'error',
      }) as any;
    } catch (e) {
      // Ignore errors updating status
    }
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Sync failed',
    }, { status: 500 });
  }
}

