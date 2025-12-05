import { ExtractedData } from '@/types';
import { TOGETHER_API_URL, MODEL_CONFIG } from '@/lib/modelConfig';

export async function verifyExtractedData(
  normalizedData: ExtractedData,
  markdownContent: string,
  fileName: string
): Promise<ExtractedData> {
  const apiKey = process.env.TOGETHER_API_KEY;
  
  if (!apiKey) {
    throw new Error('TOGETHER_API_KEY environment variable is not set');
  }

  console.log('[Data Verification] Starting verification for file:', fileName);
  console.log('[Data Verification] Markdown content length:', markdownContent.length);
  const startTime = Date.now();

  // Calculate current totals for comparison
  const extractedCostsTotal = normalizedData.costs?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0;
  const extractedPlotsTotal = normalizedData.plots?.reduce((sum, p) => sum + (p.cost || 0), 0) || 0;
  const extractedMiscTotal = normalizedData.miscellaneous?.reduce((sum, m) => sum + (m.amount || 0), 0) || 0;

  // Prepare full extracted data structure for the prompt (so model can preserve it)
  const extractedDataJson = JSON.stringify({
    costs: normalizedData.costs || [],
    plots: normalizedData.plots || [],
    miscellaneous: normalizedData.miscellaneous || [],
    units: normalizedData.units || null,
    revenue: normalizedData.revenue || null,
    profit: normalizedData.profit || null,
    financing: normalizedData.financing || null,
    averageInterest: normalizedData.averageInterest || null,
  }, null, 2);

  // Prepare summary for quick reference
  const extractedSummary = {
    costsCount: normalizedData.costs?.length || 0,
    costsTotal: extractedCostsTotal,
    plotsCount: normalizedData.plots?.length || 0,
    plotsTotal: extractedPlotsTotal,
    miscellaneousCount: normalizedData.miscellaneous?.length || 0,
    miscellaneousTotal: extractedMiscTotal,
    units: normalizedData.units ? `${normalizedData.units.count} ${normalizedData.units.type}` : 'None',
    revenue: normalizedData.revenue?.totalSales || 0,
    profit: normalizedData.profit?.total || 0,
  };

  const prompt = `You are a financial data verification specialist. Your task is to validate extracted financial data against the source markdown tables and correct any errors.

ORIGINAL MARKDOWN TABLE CONTENT:
${markdownContent.substring(0, 30000)}${markdownContent.length > 30000 ? '\n\n[... content truncated ...]' : ''}

NORMALIZED DATA TO VERIFY (PRESERVE ALL STRUCTURE, NAMES, AND DETAILS):
${extractedDataJson}

QUICK SUMMARY:
- Costs: ${extractedSummary.costsCount} items, Total: ${extractedSummary.costsTotal.toLocaleString()}
- Plots: ${extractedSummary.plotsCount} items, Total: ${extractedSummary.plotsTotal.toLocaleString()}
- Miscellaneous: ${extractedSummary.miscellaneousCount} items, Total: ${extractedSummary.miscellaneousTotal.toLocaleString()}
- Units: ${extractedSummary.units}
- Revenue: ${extractedSummary.revenue.toLocaleString()}
- Profit: ${extractedSummary.profit.toLocaleString()}

VERIFICATION TASKS:

CRITICAL: PRESERVE ALL EXISTING DATA STRUCTURE
- You MUST preserve ALL cost names/types exactly as they appear in the normalized data above
- CRITICAL: Do NOT replace cost names with category names (e.g., if you see "Site Purchase Price" keep it as "Site Purchase Price" NOT "Purchase" or "Site Costs")
- CRITICAL: Do NOT simplify cost names to just category names (e.g., keep "Engineers" NOT "Professional", keep "Build Cost" NOT "Construction", keep "Selling Agents Fee" NOT "Marketing")
- The "type" field must contain the ACTUAL cost name from the spreadsheet, NOT the category name
- The "category" field is SEPARATE - it categorizes the cost but does NOT replace the name
- When re-categorizing items, UPDATE the "category" field but PRESERVE the "type" field exactly as it is
- You MUST preserve ALL plot names exactly as they appear
- You MUST preserve ALL plot details (name, cost, squareFeet, pricePerSquareFoot, currency)
- You MUST preserve ALL units information (type, count, costPerUnit, currency)
- DO NOT remove or simplify any cost names - keep them exactly as provided
- DO NOT remove plot names - keep all plot entries with their full details
- DO NOT convert plots to just prices - plots must have name, cost, squareFeet, pricePerSquareFoot
- Only ADD missing items or REMOVE incorrect items (subtotals, duplicates, revenue items)
- Only CORRECT amounts if they're wrong, but keep all names/types unchanged
- CRITICAL EXCEPTION: REMOVE category subtotals if they appear:
  * If you find a cost named "Site Costs", "Disposal Fees", "Professional Fees", "Net Construction Costs", or "Financing/Legal Fees" with no additional detail, check if it's a subtotal
  * Compare its amount to the sum of other costs in that category
  * If the amount matches (within 1%) the sum of other items, it's a SUBTOTAL - REMOVE IT
  * Example: "Disposal Fees: £86,812.5" should be REMOVED if you also have "Selling Agents Fee: £78,812.5" + "Selling Legal Fees: £4,500" + another small fee that sum to £86,812.5

1. COST CATEGORY VALIDATION (CRITICAL):
   - Find the exact category subtotals from the markdown tables:
     * Look for rows like "Site Costs: £1,232,000", "Prof Fees: £208,477", "Net Construction Cost: £2,846,127"
     * These are the SOURCE OF TRUTH for category subtotals
   - For each category in the normalized data, compare to markdown table:
     * If extracted "Professional Fees" subtotal = £104,027 but markdown shows "Prof Fees: £208,477", there's a £104,450 discrepancy
     * This means £104,450 worth of items are miscategorized
   - CRITICAL: Re-categorize based on SPREADSHEET STRUCTURE, not item names:
     * Look at the markdown table to see where each cost item appears
     * Items belong to the category whose subtotal row appears AFTER them in the table
     * Example: If "Lender Legals: £8,500" appears before "Prof Fees: £208,477" subtotal row, it belongs to Professional Fees
     * Example: If "Marketing: £50,000" appears before "Disposal Fees: £133,312.5" subtotal row, it belongs to Disposal Fees
   - For each miscategorized item:
     * Find its position in the markdown table
     * Look for the next subtotal row after it
     * Move it to that category (UPDATE the "category" field)
     * PRESERVE the "type" field exactly as it is - do NOT change the cost name
   - Recalculate category subtotals after re-categorization
   - Verify each category subtotal matches the markdown table's subtotal EXACTLY
   - Calculate the sum of all category subtotals
   - Find "Total Development Costs" in the markdown table
   - Verify: Sum of category subtotals = Total Development Costs EXACTLY
   - If still NO MATCH:
     * Review which categories still have discrepancies
     * Double-check item positions in markdown table
     * Ensure all items are in the correct category based on table structure
     * Make totals match EXACTLY

2. MATH VALIDATION (CRITICAL):
   - Find the "Total Costs", "Total Development Costs", or similar total rows in the markdown tables
   - Calculate what the actual total should be from the markdown tables
   - Compare: Does extracted costs total (${extractedSummary.costsTotal.toLocaleString()}) match the actual total from markdown?
   - CRITICAL: Check for double-counted category subtotals:
     * Look for costs named ONLY "Site Costs", "Disposal Fees", "Professional Fees", "Net Construction Costs", or "Financing/Legal Fees"
     * For each such cost, check if its amount equals the sum of other costs in that category
     * If YES, it's a subtotal being double-counted - REMOVE IT
     * Example: If "Disposal Fees: £86,812.5" is in costs, and you also have "Selling Agents Fee: £78,812.5" + "Selling Legal Fees: £4,500" + "Site Set Up Legals: £3,500" = £86,812.5, REMOVE "Disposal Fees"
   - After removing double-counted subtotals, recalculate the total
   - If NO MATCH to markdown total:
     * Calculate the difference
     * Identify which cost items are MISSING (in markdown but not extracted) - ADD them with their full names and correct category
     * When adding missing costs, use the EXACT name from the markdown table (e.g., "Site Purchase Price" NOT "Purchase")
     * Identify which cost items are INCORRECTLY INCLUDED (subtotals, duplicates, or revenue items) - REMOVE only these
     * Preserve ALL existing cost names/types - only add missing ones or remove incorrect ones
     * Make totals match EXACTLY
   - Do the same validation for plots total and miscellaneous total
   - The extracted totals MUST equal the actual totals from the markdown tables
   - IMPORTANT: When adding missing costs, include the FULL cost name/type from the markdown table and assign the correct category

3. PLOT PRESERVATION (CRITICAL):
   - Preserve ALL plot entries exactly as they are in the normalized data
   - Each plot MUST have: name, cost, squareFeet (if available), pricePerSquareFoot (if calculable), currency
   - DO NOT remove plot names - plots are NOT just prices
   - If plots are missing, add them with their full details from the markdown table
   - If plot costs need correction, update the cost but keep the name and other details

4. UNIT INTERPRETATION VALIDATION (CRITICAL):
   - Check if "Total Units" or similar was extracted
   - Look at the markdown table context: Are there adjacent cells mentioning "sq ft", "square feet", "ft²", or similar?
   - If "Total Units: 12,000" appears but the context suggests it's actually TOTAL SQUARE FEET:
     * Correct the units extraction
     * Set units.count to the actual number of units (if available)
     * Preserve units.type, costPerUnit, and currency
     * Note the misinterpretation in verificationNotes
   - Common pattern: "Total Units" column header with square footage values = it's square feet, not unit count
   - Look for actual unit counts elsewhere in the table (might be in a different row/column)
   - IMPORTANT: Preserve the units object structure - only correct the count if wrong

5. MISSING ITEM DETECTION:
   - Review the markdown tables systematically
   - Identify any cost items that appear in markdown but are NOT in the extracted costs
   - These might be:
     * Items with unusual names that were missed
     * Items in different sections/sheets
     * Items that need to be added to make totals match
   - When adding missing costs, use the EXACT name/type from the markdown table

6. REVENUE VALIDATION:
   - Verify revenue is correctly separated from costs
   - Check if "Total Sales" matches the sum of individual plot sales (if available)
   - Verify profit calculation: Revenue - Costs = Profit

7. RETURN CORRECTED DATA:
   - Return the corrected ExtractedData with all fixes applied
   - PRESERVE all existing cost names, plot names, and structure
   - Only add missing items or remove incorrect items (subtotals, duplicates, revenue)
   - Include verificationNotes explaining what was corrected
   - Include verificationConfidence (0.0-1.0) based on how well data matches source
   - Include verificationDiscrepancies array listing any issues found and fixed

IMPORTANT RULES:
- PRESERVE ALL COST NAMES/TYPES - do not remove or simplify them (EXCEPT category subtotals)
- CRITICAL: Do NOT replace cost names with category names - keep the actual cost name in "type" field (e.g., "Site Purchase Price" NOT "Purchase", "Engineers" NOT "Professional")
- CRITICAL: The "category" field is SEPARATE from the "type" field - update category but preserve the cost name
- CRITICAL EXCEPTION: REMOVE category subtotals if present ("Site Costs", "Disposal Fees", "Professional Fees", etc. with no additional detail)
- PRESERVE ALL PLOT DETAILS - plots must have name, cost, squareFeet, pricePerSquareFoot
- PRESERVE ALL UNITS INFORMATION - keep type, count, costPerUnit, currency
- The extracted costs total MUST match the "Total Development Costs" from markdown tables EXACTLY
- If totals don't match, first check for double-counted category subtotals, then ADD missing items or REMOVE incorrect items, but preserve all names
- When adding missing costs, use the EXACT name from the markdown table, not simplified category names
- Check context carefully for unit misinterpretations
- Be thorough - review the entire markdown table structure

Respond with a JSON object in the SAME format as ExtractedData, but with corrections applied and verification fields added:
{
  "costs": [...], // Corrected costs array
  "costsTotal": {...}, // Recalculated total
  "plots": [...], // Corrected plots array
  "plotsTotal": {...}, // Recalculated total
  "profit": {...},
  "financing": {...},
  "averageInterest": {...},
  "units": {...}, // Corrected units (if misinterpretation found)
  "miscellaneous": [...], // Corrected miscellaneous array
  "miscellaneousTotal": {...}, // Recalculated total
  "revenue": {...},
  "detectedCurrency": "GBP",
  "verificationNotes": "Verified totals match source. Corrected units interpretation: 'Total Units' was actually square feet. Added 2 missing cost items.",
  "verificationConfidence": 0.98,
  "verificationDiscrepancies": [
    {
      "type": "unit_misinterpretation",
      "description": "'Total Units: 12,000' was actually total square feet, not unit count"
    },
    {
      "type": "missing_item",
      "description": "Added 'Site Survey: £5,000' which was missing from extraction"
    }
  ],
  "extractionNotes": "...",
  "confidence": 0.95,
  "tokensUsed": 0
}`;

  try {
    console.log('[Data Verification] Making API request to:', TOGETHER_API_URL);
    const requestBody = {
      model: MODEL_CONFIG.verification.model,
      messages: [
        {
          role: 'system',
          content: 'You are a financial data verification specialist. Always respond with COMPLETE, valid JSON only. Validate extracted financial data against source markdown tables, correct math errors, fix unit misinterpretations, and ensure totals match exactly. CRITICAL: Preserve ALL cost names, plot names, and data structure - only add missing items or remove incorrect items (subtotals, duplicates, revenue). Do NOT simplify or remove names.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: MODEL_CONFIG.verification.temperature,
      max_tokens: MODEL_CONFIG.verification.maxTokens,
    };
    
    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const elapsedTime = Date.now() - startTime;
    console.log('[Data Verification] API response received in:', elapsedTime, 'ms');
    console.log('[Data Verification] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Data Verification] API error response:', errorText);
      
      // Try to parse error response for better error messages
      let errorMessage = `Together.ai API error: ${response.status}`;
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.message) {
          errorMessage = `Together.ai API error (${response.status}): ${errorData.error.message}`;
        } else if (errorData.error) {
          errorMessage = `Together.ai API error (${response.status}): ${JSON.stringify(errorData.error)}`;
        }
      } catch {
        errorMessage = `Together.ai API error (${response.status}): ${errorText}`;
      }
      
      // Add specific messages for common error codes
      if (response.status === 503) {
        errorMessage += '. Service temporarily unavailable. Please try again in a few moments.';
      } else if (response.status === 429) {
        errorMessage += '. Rate limit exceeded. Please wait a moment before trying again.';
      } else if (response.status === 401) {
        errorMessage += '. Authentication failed. Please check your API key.';
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const usage = data.usage;
    
    console.log('[Data Verification] Content length:', content?.length || 0);
    console.log('[Data Verification] Tokens used:', usage?.total_tokens || 0);

    if (!content) {
      throw new Error('No response content from Together.ai API');
    }

    // Extract JSON from response
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    }

    // Check if JSON appears truncated
    if (!jsonContent.endsWith('}')) {
      console.warn('[Data Verification] JSON response may be truncated, attempting to fix...');
      const lastBrace = jsonContent.lastIndexOf('}');
      if (lastBrace > 0) {
        jsonContent = jsonContent.substring(0, lastBrace + 1);
        console.log('[Data Verification] Truncated JSON to last complete object');
      } else {
        throw new Error('JSON response appears to be incomplete or truncated');
      }
    }

    let result: ExtractedData;
    try {
      result = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('[Data Verification] JSON parse error:', parseError);
      console.error('[Data Verification] JSON content preview:', jsonContent.substring(0, 500));
      throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }
    
    const totalTime = Date.now() - startTime;
    console.log('[Data Verification] Verification complete in:', totalTime, 'ms');
    console.log('[Data Verification] Verification confidence:', result.verificationConfidence);
    console.log('[Data Verification] Verification notes:', result.verificationNotes);
    console.log('[Data Verification] Discrepancies found:', result.verificationDiscrepancies?.length || 0);
    
    // Calculate totals for verified data
    const detectedCurrency = result.detectedCurrency || normalizedData.detectedCurrency || 'GBP';
    
    // Calculate costs total
    let costsTotal: { amount: number; currency: string } | undefined = undefined;
    if (result.costs && Array.isArray(result.costs) && result.costs.length > 0) {
      const validCosts = result.costs.filter(c => c && typeof c.amount === 'number' && !isNaN(c.amount));
      if (validCosts.length > 0) {
        const total = validCosts.reduce((sum, cost) => sum + cost.amount, 0);
        costsTotal = {
          amount: total,
          currency: validCosts[0].currency || detectedCurrency,
        };
      }
    }
    
    // Calculate plots total and ensure price per square foot is calculated
    let plotsTotal: { amount: number; currency: string } | undefined = undefined;
    if (result.plots && Array.isArray(result.plots) && result.plots.length > 0) {
      const validPlots = result.plots.map(plot => {
        // Calculate price per square foot if not already calculated
        if (plot && typeof plot.cost === 'number' && typeof plot.squareFeet === 'number' && plot.squareFeet > 0) {
          if (!plot.pricePerSquareFoot || plot.pricePerSquareFoot === 0) {
            plot.pricePerSquareFoot = plot.cost / plot.squareFeet;
          }
        }
        return plot;
      }).filter(p => p && typeof p.cost === 'number' && !isNaN(p.cost));
      
      if (validPlots.length > 0) {
        const total = validPlots.reduce((sum, plot) => sum + plot.cost, 0);
        plotsTotal = {
          amount: total,
          currency: validPlots[0].currency || detectedCurrency,
        };
      }
    }
    
    // Calculate miscellaneous total
    let miscellaneousTotal: { amount: number; currency: string } | undefined = undefined;
    if (result.miscellaneous && Array.isArray(result.miscellaneous) && result.miscellaneous.length > 0) {
      const validMisc = result.miscellaneous.filter(m => m && typeof m.amount === 'number' && !isNaN(m.amount));
      if (validMisc.length > 0) {
        const total = validMisc.reduce((sum, item) => sum + item.amount, 0);
        miscellaneousTotal = {
          amount: total,
          currency: validMisc[0].currency || detectedCurrency,
        };
      }
    }
    
    return {
      // Merge verified data with normalized data to preserve structure
      // If verification removed something important, fall back to normalized data
      costs: result.costs && Array.isArray(result.costs) && result.costs.length > 0 
        ? result.costs.filter(c => c !== null && c.type && c.amount !== undefined && c.amount !== null)
        : normalizedData.costs,
      costCategories: result.costCategories || normalizedData.costCategories || undefined,
      costsTotal: costsTotal || normalizedData.costsTotal,
      profit: result.profit && typeof result.profit === 'object' ? {
        ...result.profit,
        currency: result.profit.currency || detectedCurrency,
      } : normalizedData.profit,
      financing: result.financing && typeof result.financing === 'object' ? {
        ...result.financing,
        currency: result.financing.currency || detectedCurrency,
      } : normalizedData.financing,
      averageInterest: result.averageInterest && typeof result.averageInterest === 'object' ? result.averageInterest : normalizedData.averageInterest,
      units: result.units && typeof result.units === 'object' && result.units.count !== null && result.units.count !== undefined ? {
        ...result.units,
        currency: result.units.currency || detectedCurrency,
      } : normalizedData.units,
      plots: result.plots && Array.isArray(result.plots) && result.plots.length > 0 
        ? result.plots.map(plot => {
            // Ensure price per square foot is calculated if square feet is available
            if (plot && typeof plot.cost === 'number' && typeof plot.squareFeet === 'number' && plot.squareFeet > 0) {
              if (!plot.pricePerSquareFoot || plot.pricePerSquareFoot === 0) {
                plot.pricePerSquareFoot = plot.cost / plot.squareFeet;
              }
            }
            return plot;
          }).filter(p => p !== null && p.name && p.cost !== undefined && p.cost !== null)
        : normalizedData.plots,
      plotsTotal: plotsTotal || normalizedData.plotsTotal,
      miscellaneous: result.miscellaneous && Array.isArray(result.miscellaneous) && result.miscellaneous.length > 0 
        ? result.miscellaneous.filter(m => m !== null && m.type && m.amount !== undefined && m.amount !== null)
        : normalizedData.miscellaneous,
      miscellaneousTotal: miscellaneousTotal || normalizedData.miscellaneousTotal,
      revenue: result.revenue && typeof result.revenue === 'object' ? {
        ...result.revenue,
        currency: result.revenue.currency || detectedCurrency,
      } : normalizedData.revenue,
      detectedCurrency: result.detectedCurrency || detectedCurrency,
      verificationNotes: result.verificationNotes || undefined,
      verificationConfidence: result.verificationConfidence !== null && result.verificationConfidence !== undefined ? result.verificationConfidence : undefined,
      verificationDiscrepancies: result.verificationDiscrepancies && Array.isArray(result.verificationDiscrepancies) ? result.verificationDiscrepancies : undefined,
      extractionNotes: result.extractionNotes || normalizedData.extractionNotes || undefined,
      confidence: result.confidence !== null && result.confidence !== undefined ? result.confidence : normalizedData.confidence || 0.0,
      tokensUsed: (normalizedData.tokensUsed || 0) + (usage?.total_tokens || 0),
    };
  } catch (error) {
    console.error('[Data Verification] Error during verification:', error);
    // Return original data if verification fails
    console.log('[Data Verification] Returning original normalized data due to verification error');
    return normalizedData;
  }
}

