import { NextRequest, NextResponse } from 'next/server';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { api } from '../../../../../convex/_generated/api';
import {
  searchPlanningApplicationsByOrganisationAndPostcode,
  normalizePlanningStatus,
  PlanningApplicationRaw,
} from '@/lib/planningDataApi/client';
import {
  searchLondonApplications,
  normalizeLondonPlanningStatus,
  LondonPlanningApplicationRaw,
} from '@/lib/londonPlanningDatahub/client';
import {
  getCorporateOwnedTitlesForCompany,
  normalizeOwnershipType,
  LandPropertyTitleRaw,
} from '@/lib/landPropertyData/client';

/**
 * Run prospect gauntlet for a company
 * POST /api/prospects/run-gauntlet
 * 
 * Body: { companyNumber: string } or { prospectId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyNumber, prospectId } = body;

    let targetCompanyNumber: string;

    // Resolve company number from prospectId if needed
    if (prospectId && !companyNumber) {
      const prospect = await fetchQuery(api.prospects.getProspect, {
        prospectId: prospectId as any,
      });
      if (!prospect) {
        return NextResponse.json(
          { error: 'Prospect not found' },
          { status: 404 }
        );
      }
      targetCompanyNumber = prospect.companyNumber;
    } else if (companyNumber) {
      targetCompanyNumber = companyNumber;
    } else {
      return NextResponse.json(
        { error: 'companyNumber or prospectId is required' },
        { status: 400 }
      );
    }

    console.log(`Starting gauntlet for company: ${targetCompanyNumber}`);

    // Get company data from Companies House
    const company = await fetchQuery(api.companiesHouse.getCompanyByNumber, {
      companyNumber: targetCompanyNumber,
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found in database' },
        { status: 404 }
      );
    }

    // Get full company data with officers and PSC
    const fullCompanyData = await fetchQuery(api.companiesHouse.getCompany, {
      companyId: company._id,
    });

    if (!fullCompanyData) {
      return NextResponse.json(
        { error: 'Company data not found' },
        { status: 404 }
      );
    }

    // Ensure prospect exists
    let prospect = await fetchQuery(api.prospects.getProspectByCompanyNumber, {
      companyNumber: targetCompanyNumber,
    });

    if (!prospect) {
      const prospectId = await fetchMutation(api.prospects.createProspect, {
        companyNumber: targetCompanyNumber,
        companyId: company._id,
      });
      prospect = await fetchQuery(api.prospects.getProspect, {
        prospectId: prospectId as any,
      });
    }

    if (!prospect) {
      return NextResponse.json(
        { error: 'Failed to create prospect' },
        { status: 500 }
      );
    }

    // Build search terms
    const searchTerms = buildSearchTerms(fullCompanyData);
    const postcodes = extractPostcodes(fullCompanyData);

    console.log(`Search terms: ${searchTerms.join(', ')}`);
    console.log(`Postcodes: ${postcodes.join(', ')}`);

    // === PLANNING PASS ===
    const planningResults: Array<{
      app: PlanningApplicationRaw | LondonPlanningApplicationRaw;
      source: 'planning_data_api' | 'london_datahub';
      matchReason: string;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    }> = [];

    // Search Planning Data API
    try {
      const planningDataResults =
        await searchPlanningApplicationsByOrganisationAndPostcode(
          fullCompanyData.companyName,
          postcodes
        );

      for (const app of planningDataResults) {
        const { matchReason, confidence } = calculateMatchConfidence(
          app,
          fullCompanyData,
          searchTerms,
          postcodes
        );
        planningResults.push({
          app,
          source: 'planning_data_api',
          matchReason,
          confidence,
        });
      }
    } catch (error: any) {
      console.error('Error searching Planning Data API:', error);
    }

    // Search London Datahub (if London postcodes detected)
    const isLondon = postcodes.some((pc) =>
      /^[A-Z]{1,2}[0-9]{1,2}/i.test(pc)
    );
    if (isLondon) {
      try {
        const londonResults = await searchLondonApplications(
          fullCompanyData.companyName,
          postcodes
        );

        for (const app of londonResults) {
          const { matchReason, confidence } = calculateMatchConfidence(
            app,
            fullCompanyData,
            searchTerms,
            postcodes
          );
          planningResults.push({
            app,
            source: 'london_datahub',
            matchReason,
            confidence,
          });
        }
      } catch (error: any) {
        console.error('Error searching London Datahub:', error);
      }
    }

    // Also search by officer/PSC names (lower confidence)
    for (const officer of fullCompanyData.officers || []) {
      if (officer.name) {
        try {
          const officerResults =
            await searchPlanningApplicationsByOrganisationAndPostcode(
              officer.name,
              postcodes
            );
          for (const app of officerResults) {
            const { matchReason, confidence } = calculateMatchConfidence(
              app,
              fullCompanyData,
              [officer.name],
              postcodes,
              true // person name match
            );
            planningResults.push({
              app,
              source: 'planning_data_api',
              matchReason: `PERSON_NAME_MATCH:${officer.name}`,
              confidence: confidence === 'HIGH' ? 'MEDIUM' : 'LOW', // Downgrade person matches
            });
          }
        } catch (error: any) {
          console.error(`Error searching for officer ${officer.name}:`, error);
        }
      }
    }

    // Save planning applications and links
    let planningAppsSaved = 0;
    for (const result of planningResults) {
      try {
        const externalId =
          result.app.reference ||
          result.app.application_number ||
          result.app.id ||
          JSON.stringify(result.app);

        const status =
          result.source === 'london_datahub'
            ? normalizeLondonPlanningStatus(
                result.app.status,
                (result.app as LondonPlanningApplicationRaw).decision
              )
            : normalizePlanningStatus(result.app.status);

        const planningAppId = await fetchMutation(
          api.planning.savePlanningApplication,
          {
            externalId,
            source: result.source,
            localAuthority:
              result.app.local_authority ||
              (result.app as LondonPlanningApplicationRaw).borough,
            councilName:
              result.app.local_authority_label ||
              (result.app as LondonPlanningApplicationRaw).borough,
            siteAddress:
              result.app.site_address ||
              (result.app as LondonPlanningApplicationRaw).site_address,
            sitePostcode:
              result.app.postcode ||
              (result.app as LondonPlanningApplicationRaw).postcode,
            applicantName:
              result.app.applicant_name ||
              (result.app as LondonPlanningApplicationRaw).applicant_name,
            applicantOrganisation:
              result.app.applicant_organisation ||
              (result.app as LondonPlanningApplicationRaw).applicant_organisation,
            status,
            decisionDate:
              result.app.decision_date ||
              (result.app as LondonPlanningApplicationRaw).decision_date,
            receivedDate:
              result.app.received_date ||
              (result.app as LondonPlanningApplicationRaw).received_date ||
              (result.app as LondonPlanningApplicationRaw).validated_date,
            rawPayload: result.app,
          }
        );

        await fetchMutation(api.planning.linkCompanyToPlanning, {
          companyNumber: targetCompanyNumber,
          planningApplicationId: planningAppId as any,
          matchConfidence: result.confidence,
          matchReason: result.matchReason,
        });

        planningAppsSaved++;
      } catch (error: any) {
        console.error('Error saving planning application:', error);
      }
    }

    // === LAND & PROPERTY PASS ===
    let propertiesSaved = 0;
    try {
      const propertyResults = await getCorporateOwnedTitlesForCompany(
        targetCompanyNumber
      );

      // Also try searching by company name
      const propertyResultsByName =
        await getCorporateOwnedTitlesForCompany(fullCompanyData.companyName);

      const allPropertyResults = [...propertyResults, ...propertyResultsByName];

      // Deduplicate by title number
      const seenTitles = new Set<string>();
      const uniqueProperties: LandPropertyTitleRaw[] = [];

      for (const prop of allPropertyResults) {
        if (prop.title_number && !seenTitles.has(prop.title_number)) {
          seenTitles.add(prop.title_number);
          uniqueProperties.push(prop);
        }
      }

      for (const prop of uniqueProperties) {
        try {
          if (!prop.title_number) continue;

          const propertyTitleId = await fetchMutation(
            api.property.savePropertyTitle,
            {
              titleNumber: prop.title_number,
              country: prop.country || 'E&W',
              address: prop.address || prop.property_address,
              postcode: prop.postcode,
              rawPayload: prop,
            }
          );

          // Determine dataset from context (would need to track which query returned it)
          const fromDataset = prop.company_number
            ? 'uk_companies_own_property'
            : 'overseas_companies_own_property';

          await fetchMutation(api.property.linkCompanyToProperty, {
            companyNumber: targetCompanyNumber,
            propertyTitleId: propertyTitleId as any,
            ownershipType: normalizeOwnershipType(prop.tenure),
            fromDataset,
            acquiredDate: prop.date_of_sale,
          });

          propertiesSaved++;
        } catch (error: any) {
          console.error('Error saving property title:', error);
        }
      }
    } catch (error: any) {
      console.error('Error searching Land & Property API:', error);
    }

    // === SCORING ===
    const score = await calculateProspectScore(
      targetCompanyNumber,
      planningResults.length,
      propertiesSaved
    );

    // Update prospect
    await fetchMutation(api.prospects.updateProspectScore, {
      prospectId: prospect._id,
      activeProjectScore: score.totalScore,
      prospectTier: score.tier,
      hasPlanningHits: planningAppsSaved > 0,
      hasOwnedPropertyHits: propertiesSaved > 0,
      lastGauntletRunAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      companyNumber: targetCompanyNumber,
      planningAppsFound: planningResults.length,
      planningAppsSaved,
      propertiesFound: propertiesSaved,
      propertiesSaved,
      score: score.totalScore,
      tier: score.tier,
    });
  } catch (error: any) {
    console.error('Error running gauntlet:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to run gauntlet',
      },
      { status: 500 }
    );
  }
}

/**
 * Build search terms from company data
 */
function buildSearchTerms(companyData: any): string[] {
  const terms: string[] = [];

  // Company name
  if (companyData.companyName) {
    terms.push(companyData.companyName);
  }

  // Officer names
  for (const officer of companyData.officers || []) {
    if (officer.name) {
      terms.push(officer.name);
    }
  }

  // PSC names
  for (const psc of companyData.psc || []) {
    if (psc.name) {
      terms.push(psc.name);
    }
  }

  return terms;
}

/**
 * Extract postcodes from company data
 */
function extractPostcodes(companyData: any): string[] {
  const postcodes: string[] = [];

  // Registered office postcode
  if (companyData.registeredOfficeAddress?.postal_code) {
    postcodes.push(companyData.registeredOfficeAddress.postal_code);
  }

  // Charge addresses (if available)
  for (const charge of companyData.charges || []) {
    // Charges don't typically have addresses, but check if they do
    if (charge.address?.postal_code) {
      postcodes.push(charge.address.postal_code);
    }
  }

  return postcodes.filter((pc) => pc && pc.trim());
}

/**
 * Calculate match confidence for a planning application
 */
function calculateMatchConfidence(
  app: PlanningApplicationRaw | LondonPlanningApplicationRaw,
  companyData: any,
  searchTerms: string[],
  postcodes: string[],
  isPersonMatch: boolean = false
): { matchReason: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW' } {
  const appOrg =
    app.applicant_organisation ||
    (app as LondonPlanningApplicationRaw).applicant_organisation;
  const appPostcode =
    app.postcode || (app as LondonPlanningApplicationRaw).postcode;
  const companyName = companyData.companyName?.toLowerCase() || '';

  // HIGH: Organisation name match + postcode match
  if (
    appOrg &&
    companyName &&
    appOrg.toLowerCase().includes(companyName) &&
    appPostcode &&
    postcodes.some((pc) => pc.replace(/\s+/g, '') === appPostcode.replace(/\s+/g, ''))
  ) {
    return {
      matchReason: 'ORG_NAME_MATCH+POSTCODE_MATCH',
      confidence: 'HIGH',
    };
  }

  // MEDIUM: Organisation name fuzzy match OR person name + postcode
  if (isPersonMatch && appPostcode && postcodes.includes(appPostcode)) {
    return {
      matchReason: 'PERSON_NAME_MATCH+POSTCODE_MATCH',
      confidence: 'MEDIUM',
    };
  }

  if (
    appOrg &&
    companyName &&
    fuzzyMatch(appOrg.toLowerCase(), companyName)
  ) {
    return {
      matchReason: 'ORG_NAME_FUZZY_MATCH',
      confidence: 'MEDIUM',
    };
  }

  // LOW: Person name only or weak match
  if (isPersonMatch) {
    return {
      matchReason: 'PERSON_NAME_MATCH',
      confidence: 'LOW',
    };
  }

  return {
    matchReason: 'WEAK_MATCH',
    confidence: 'LOW',
  };
}

/**
 * Simple fuzzy string matching
 */
function fuzzyMatch(str1: string, str2: string): boolean {
  // Check if one string contains the other (with some tolerance)
  if (str1.includes(str2) || str2.includes(str1)) {
    return true;
  }

  // Check for significant word overlap
  const words1 = str1.split(/\s+/).filter((w) => w.length > 3);
  const words2 = str2.split(/\s+/).filter((w) => w.length > 3);

  if (words1.length === 0 || words2.length === 0) return false;

  const overlap = words1.filter((w) => words2.includes(w)).length;
  const minLength = Math.min(words1.length, words2.length);

  return overlap / minLength >= 0.5; // 50% word overlap
}

/**
 * Calculate prospect score based on planning apps and properties
 */
async function calculateProspectScore(
  companyNumber: string,
  planningAppsCount: number,
  propertiesCount: number
): Promise<{ totalScore: number; tier: 'A' | 'B' | 'C' | 'UNQUALIFIED' }> {
  // Get planning applications for the company
  const planningLinks = await fetchQuery(
    api.planning.getPlanningApplicationsForCompany,
    { companyNumber }
  );

  // Get properties for the company
  const propertyLinks = await fetchQuery(api.property.getPropertiesForCompany, {
    companyNumber,
  });

  let score = 0;
  const twentyFourMonthsAgo = new Date();
  twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);

  // Score planning applications
  for (const link of planningLinks || []) {
    const app = link.planningApplication;
    if (!app) continue;

    const decisionDate = app.decisionDate
      ? new Date(app.decisionDate)
      : null;
    const receivedDate = app.receivedDate ? new Date(app.receivedDate) : null;
    const relevantDate = decisionDate || receivedDate;

    if (
      relevantDate &&
      relevantDate >= twentyFourMonthsAgo &&
      (app.status === 'APPROVED' || app.status === 'UNDER_CONSIDERATION')
    ) {
      score += 3;
    }
  }

  // Score properties
  for (const link of propertyLinks || []) {
    const property = link.propertyTitle;
    if (!property) continue;

    // Check if property was acquired recently (if date available)
    // For now, just count properties
    score += 2;
  }

  // Bonus: planning app + property share postcode
  const planningPostcodes = new Set(
    planningLinks
      .map((link) => link.planningApplication?.sitePostcode)
      .filter(Boolean)
  );
  const propertyPostcodes = new Set(
    propertyLinks
      .map((link) => link.propertyTitle?.postcode)
      .filter(Boolean)
  );

  for (const pc of planningPostcodes) {
    if (propertyPostcodes.has(pc)) {
      score += 1;
      break; // Only count once
    }
  }

  // Determine tier
  let tier: 'A' | 'B' | 'C' | 'UNQUALIFIED';
  if (score >= 10) {
    tier = 'A';
  } else if (score >= 5) {
    tier = 'B';
  } else if (score > 0) {
    tier = 'C';
  } else {
    tier = 'UNQUALIFIED';
  }

  return { totalScore: score, tier };
}

