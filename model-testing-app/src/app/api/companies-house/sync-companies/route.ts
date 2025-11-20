import { NextRequest, NextResponse } from 'next/server';
import { 
  searchCompaniesBySicCodes, 
  getCompanyProfile, 
  getCompanyCharges,
  getChargeDocumentUrl,
  downloadChargeDocument,
  getRegisteredOfficeAddress,
  getPersonsWithSignificantControl,
  getPSCIndividual,
  getPSCCorporateEntity,
  getCompanyOfficers,
  CompaniesHouseCharge,
} from '@/lib/companiesHouse/client';
import { api } from '../../../../../convex/_generated/api';
import { fetchMutation, fetchQuery } from 'convex/nextjs';

/**
 * Sync companies from Companies House API
 * POST /api/companies-house/sync-companies
 * 
 * Accepts: { sicCodes: string[], maxCompanies: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sicCodes, maxCompanies = 10 } = body;

    if (!sicCodes || !Array.isArray(sicCodes) || sicCodes.length === 0) {
      return NextResponse.json(
        { error: 'sicCodes array is required' },
        { status: 400 }
      );
    }

    const stats = {
      companiesFound: 0,
      companiesSynced: 0,
      chargesFound: 0,
      chargesSynced: 0,
      pdfsDownloaded: 0,
      pscFound: 0,
      pscSynced: 0,
      officersFound: 0,
      officersSynced: 0,
      errors: 0,
    };

    const errorMessages: string[] = [];

    // Get existing company numbers to skip already synced companies
    const existingCompanyNumbers = await fetchQuery(api.companiesHouse.getExistingCompanyNumbers, {});
    const existingSet = new Set(existingCompanyNumbers);
    console.log(`Found ${existingSet.size} existing companies in database. Will skip these during sync.`);

    // Optimized two-phase approach:
    // Phase 1: Search companies and check charges (minimal API calls)
    // Phase 2: Only fully sync companies with recent charges
    
    let startIndex = 0;
    const itemsPerPage = 100; // Search in batches
    let hasMore = true;
    const companiesToSync: Array<{ companyNumber: string; chargesData?: any }> = [];
    const allSearchedCompanyNumbers = new Set<string>(); // Track all companies we've seen
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    let explorationCalls = 0; // Track exploration calls (search + charge checks)
    const maxExplorationCalls = 300; // Limit exploration calls per sync

    console.log(`Starting search for SIC codes: ${sicCodes.join(', ')}`);
    console.log(`Max companies to sync: ${maxCompanies}`);
    console.log(`Phase 1: Exploring companies and checking charges (max ${maxExplorationCalls} calls)`);
    console.log(`Phase 2: Only fully syncing companies with charges within the last 12 months`);

    // Phase 1: Search and check charges (exploration phase)
    while (hasMore && companiesToSync.length < maxCompanies && explorationCalls < maxExplorationCalls) {
      try {
        // Step 1: Search for companies (1 API call)
        const searchResult = await searchCompaniesBySicCodes(
          sicCodes,
          itemsPerPage,
          startIndex,
          ['active'] // Only active companies
        );
        explorationCalls++;
        
        console.log(`Search result: ${searchResult.items.length} companies found (total_results: ${searchResult.total_results})`);
        console.log(`Exploration calls used: ${explorationCalls}/${maxExplorationCalls}`);

        stats.companiesFound += searchResult.items.length;

        // Step 2: Check charges for each company (1 API call per company)
        for (const item of searchResult.items) {
          // Skip if we've already processed this company number
          if (allSearchedCompanyNumbers.has(item.company_number)) {
            continue;
          }
          allSearchedCompanyNumbers.add(item.company_number);

          // Skip if company already exists in database
          if (existingSet.has(item.company_number)) {
            console.log(`Skipping existing company: ${item.company_number} - ${item.title}`);
            continue;
          }

          // Check if we've used too many exploration calls
          if (explorationCalls >= maxExplorationCalls) {
            console.log(`Reached exploration call limit (${maxExplorationCalls}). Stopping exploration.`);
            hasMore = false;
            break;
          }

          // Check charges (1 API call) - save data for Phase 2
          try {
            const chargesData = await getCompanyCharges(item.company_number);
            explorationCalls++;
            
            const hasRecentCharges = chargesData.items.some((charge: any) => {
              const chargeDate = charge.created_on || charge.delivered_on;
              if (!chargeDate) return false;
              const chargeDateObj = new Date(chargeDate);
              return chargeDateObj >= twelveMonthsAgo;
            });

            if (hasRecentCharges) {
              // Save company number and charges data (reuse in Phase 2)
              companiesToSync.push({ 
                companyNumber: item.company_number,
                chargesData: chargesData // Reuse this data in Phase 2
              });
              console.log(`✓ [${companiesToSync.length}/${maxCompanies}] Adding company with recent charges: ${item.company_number} - ${item.title}`);
            } else {
              console.log(`✗ Skipping company (no recent charges): ${item.company_number} - ${item.title}`);
            }
          } catch (error: any) {
            explorationCalls++;
            console.log(`✗ Skipping company (error checking charges): ${item.company_number} - ${error.message}`);
          }

          // Small delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 50));

          if (companiesToSync.length >= maxCompanies) {
            break;
          }
        }

        console.log(`Found ${companiesToSync.length} companies with recent charges (explored ${allSearchedCompanyNumbers.size} total, ${explorationCalls} calls used)`);

        // Continue searching if we haven't found enough companies with recent charges yet
        hasMore = searchResult.items.length === itemsPerPage && 
                  companiesToSync.length < maxCompanies &&
                  explorationCalls < maxExplorationCalls &&
                  startIndex + itemsPerPage < searchResult.total_results;

        startIndex += itemsPerPage;

        // Rate limiting - small delay between search batches
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error: any) {
        console.error('Error searching companies:', error);
        errorMessages.push(`Search error: ${error.message}`);
        stats.errors++;
        hasMore = false;
      }
    }

    console.log(`\n=== Phase 2: Fully syncing ${companiesToSync.length} companies with recent charges ===`);
    console.log(`Exploration phase used ${explorationCalls} API calls to find ${companiesToSync.length} companies`);

    if (companiesToSync.length === 0) {
      return NextResponse.json({
        success: true,
        stats,
        companiesToSync: 0,
        explorationCalls,
        message: `No companies with recent charges found. Explored ${allSearchedCompanyNumbers.size} companies using ${explorationCalls} API calls.`,
        searchedCount: allSearchedCompanyNumbers.size,
      });
    }

    // Phase 2: Fully sync companies with recent charges
    // Limit to 50 for rate limiting (each company uses ~5-8 API calls)
    const companiesToProcess = companiesToSync.slice(0, 50);
    console.log(`Fully syncing ${companiesToProcess.length} companies (limited to 50 for rate limiting)`);

    for (const companyInfo of companiesToProcess) {
      const companyNumber = companyInfo.companyNumber;
      try {
        console.log(`\n--- Phase 2: Fully syncing company ${companyNumber} ---`);
        
        // Get company profile (1 API call)
        const profile = await getCompanyProfile(companyNumber);
        
        // Get registered office address (1 API call)
        let registeredOfficeAddress;
        try {
          registeredOfficeAddress = await getRegisteredOfficeAddress(companyNumber);
          console.log(`  ✓ Registered office address fetched`);
        } catch (error: any) {
          console.error(`  ✗ Error getting registered office address for ${companyNumber}:`, error);
        }
        
        // Reuse charges data from Phase 1 (saves 1 API call per company!)
        let chargesData = companyInfo.chargesData || { items: [], total_count: 0 };
        stats.chargesFound += chargesData.items.length;
        console.log(`  ✓ Charges data reused from Phase 1: ${chargesData.items.length} charges`);
        
        // Get PSC list
        let pscList;
        try {
          pscList = await getPersonsWithSignificantControl(companyNumber);
          stats.pscFound += pscList.items.length;
          console.log(`  ✓ PSC list fetched: ${pscList.items.length}`);
        } catch (error: any) {
          console.error(`  ✗ Error getting PSC list for ${companyNumber}:`, error);
          pscList = { items: [], total_count: 0 };
        }
        
        // Get officers list
        let officersList;
        try {
          officersList = await getCompanyOfficers(companyNumber);
          stats.officersFound += officersList.items.length;
          console.log(`  ✓ Officers list fetched: ${officersList.items.length}`);
        } catch (error: any) {
          console.error(`  ✗ Error getting officers for ${companyNumber}:`, error);
          officersList = { items: [], total_count: 0 };
        }

        // Process charges and download PDFs
        // Only download PDFs for charges within the last 12 months
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        const chargesWithPdfs = await Promise.all(
          chargesData.items.map(async (charge: CompaniesHouseCharge) => {
            const chargeDate = charge.created_on || charge.delivered_on;
            const chargeDateObj = chargeDate ? new Date(chargeDate) : null;
            const isRecentCharge = chargeDateObj && chargeDateObj >= twelveMonthsAgo;
            
            const chargeData: any = {
              chargeId: charge.charge_id || charge.charge_number.toString(),
              chargeNumber: charge.charge_number,
              chargeDate: chargeDate,
              chargeDescription: charge.secured_details?.description || charge.charge_code,
              chargeStatus: charge.status, // "outstanding", "satisfied", "part-satisfied", "fully-satisfied"
              chargeeName: charge.persons_entitled?.[0]?.name,
            };
            
            // Only include pdfUrl if it exists (optional field)
            if (charge.links?.filing) {
              chargeData.pdfUrl = charge.links.filing;
            }
            
            // Only download PDF for charges within the last 12 months
            if (charge.links?.filing && isRecentCharge) {
              try {
                console.log(`  → Downloading PDF for recent charge ${charge.charge_number} (${chargeDate})`);
                const pdfBuffer = await downloadChargeDocument(charge.links.filing);
                if (pdfBuffer) {
                  // Convert buffer to base64 for Convex mutation
                  const base64Pdf = pdfBuffer.toString('base64');
                  
                  // Upload PDF to Convex storage via mutation
                  // Note: We'll upload after company is saved, so we need companyId
                  // For now, store the base64 data and upload after company sync
                  chargeData.pdfData = base64Pdf;
                  stats.pdfsDownloaded++;
                }
              } catch (error) {
                console.error(`Error downloading PDF for charge ${charge.charge_number}:`, error);
              }
            } else if (charge.links?.filing && !isRecentCharge) {
              console.log(`  → Skipping PDF download for old charge ${charge.charge_number} (${chargeDate})`);
            }

            return chargeData;
          })
        );

        // Save company and charges to database via Convex mutation
        const companyId = await fetchMutation(api.companiesHouse.syncCompanyData, {
          companyNumber: profile.company_number,
          companyName: profile.company_name,
          sicCodes: profile.sic_codes || [],
          address: profile.registered_office_address 
            ? Object.values(profile.registered_office_address).filter(Boolean).join(', ')
            : undefined,
          registeredOfficeAddress: registeredOfficeAddress || profile.registered_office_address,
          incorporationDate: profile.date_of_creation,
          companyStatus: profile.company_status,
          charges: chargesWithPdfs.map(({ pdfData, pdfDocumentId, ...charge }) => charge), // Remove pdfData and pdfDocumentId before sending
        });
        
        // Save PSC data
        for (const pscItem of pscList.items) {
          try {
            if (!pscItem.links?.self) continue;
            
            // Extract PSC ID from self link
            const pscIdMatch = pscItem.links.self.match(/\/(individual|corporate-entity|legal-person)\/([^\/]+)$/);
            if (!pscIdMatch) continue;
            
            const [, pscType, pscId] = pscIdMatch;
            
            let pscDetails: any;
            try {
              if (pscType === 'individual') {
                pscDetails = await getPSCIndividual(companyNumber, pscId);
                await fetchMutation(api.companiesHouse.savePSC, {
                  pscId,
                  companyId: companyId as any,
                  pscType: 'individual',
                  name: pscDetails.name,
                  nationality: pscDetails.nationality,
                  dateOfBirth: pscDetails.date_of_birth,
                  address: pscDetails.address,
                  naturesOfControl: pscDetails.natures_of_control,
                  notifiableOn: pscDetails.notified_on,
                  ceasedOn: pscDetails.ceased_on,
                });
                stats.pscSynced++;
              } else if (pscType === 'corporate-entity') {
                pscDetails = await getPSCCorporateEntity(companyNumber, pscId);
                await fetchMutation(api.companiesHouse.savePSC, {
                  pscId,
                  companyId: companyId as any,
                  pscType: 'corporate-entity',
                  name: pscDetails.name,
                  address: pscDetails.address,
                  naturesOfControl: pscDetails.natures_of_control,
                  notifiableOn: pscDetails.notified_on,
                  ceasedOn: pscDetails.ceased_on,
                  identification: pscDetails.identification,
                });
                stats.pscSynced++;
              }
            } catch (error: any) {
              console.error(`  ✗ Error fetching PSC details for ${pscId}:`, error);
            }
          } catch (error: any) {
            console.error(`  ✗ Error processing PSC item:`, error);
          }
        }
        
        // Save officers data
        for (const officerItem of officersList.items) {
          try {
            if (!officerItem.links?.officer?.appointments) continue;
            
            // Extract officer ID from appointments link
            const officerIdMatch = officerItem.links.officer.appointments.match(/\/officers\/([^\/]+)/);
            if (!officerIdMatch) continue;
            
            const officerId = officerIdMatch[1];
            
            await fetchMutation(api.companiesHouse.saveOfficer, {
              officerId,
              companyId: companyId as any,
              name: officerItem.name,
              officerRole: officerItem.officer_role,
              appointedOn: officerItem.appointed_on,
              resignedOn: officerItem.resigned_on,
              nationality: officerItem.nationality,
              occupation: officerItem.occupation,
              countryOfResidence: officerItem.country_of_residence,
              address: officerItem.address,
              dateOfBirth: officerItem.date_of_birth,
            });
            stats.officersSynced++;
          } catch (error: any) {
            console.error(`  ✗ Error processing officer:`, error);
          }
        }

        // Upload PDFs separately after company is synced
        for (const charge of chargesWithPdfs) {
          if (charge.pdfData) {
            try {
              await fetchMutation(api.companiesHouse.uploadChargePdf, {
                companyId: companyId as any,
                chargeId: charge.chargeId,
                pdfData: charge.pdfData,
                pdfUrl: charge.pdfUrl,
              });
            } catch (error) {
              console.error(`Error uploading PDF for charge ${charge.chargeId}:`, error);
            }
          }
        }

        stats.companiesSynced++;
        stats.chargesSynced += chargesWithPdfs.length;
        console.log(`  ✓ Company ${companyNumber} synced successfully`);

        // If company has recent charges, promote to prospect and trigger gauntlet
        const hasRecentCharges = chargesWithPdfs.some((charge) => {
          const chargeDate = charge.chargeDate ? new Date(charge.chargeDate) : null;
          const twelveMonthsAgo = new Date();
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
          return chargeDate && chargeDate >= twelveMonthsAgo;
        });

        if (hasRecentCharges) {
          try {
            console.log(`  → Promoting company ${companyNumber} to prospect and triggering gauntlet`);
            
            // Create prospect (idempotent)
            await fetchMutation(api.prospects.createProspect, {
              companyNumber: companyNumber,
              companyId: companyId as any,
            });

            // Trigger gauntlet asynchronously (don't wait for it to complete)
            // Fire and forget - gauntlet will run in background
            fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/prospects/run-gauntlet`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ companyNumber }),
            }).catch((error) => {
              console.error(`Error triggering gauntlet for ${companyNumber}:`, error);
            });

            console.log(`  ✓ Gauntlet triggered for company ${companyNumber}`);
          } catch (error: any) {
            console.error(`Error promoting to prospect/triggering gauntlet:`, error);
            // Don't fail the sync if prospect creation fails
          }
        }

        // Rate limiting - delay between companies (small delay to stay under limit)
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error: any) {
        console.error(`Error syncing company ${companyNumber}:`, error);
        errorMessages.push(`Company ${companyNumber}: ${error.message}`);
        stats.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      companiesToSync: companiesToSync.length,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
      message: companiesToSync.length === 0 
        ? `No companies with recent charges found. Explored ${allSearchedCompanyNumbers.size} companies using ${explorationCalls} API calls.`
        : `Successfully synced ${stats.companiesSynced} companies with recent charges (${stats.chargesSynced} charges, ${stats.pscSynced} PSC, ${stats.officersSynced} officers). Phase 1 exploration used ${explorationCalls} calls.`,
      explorationCalls,
      searchedCount: allSearchedCompanyNumbers.size,
    });
  } catch (error: any) {
    console.error('Error syncing companies:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to sync companies',
      },
      { status: 500 }
    );
  }
}

