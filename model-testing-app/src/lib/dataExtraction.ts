import { ExtractedData } from '@/types';

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const MODEL_NAME = 'openai/gpt-oss-120b'; // GPT-OSS-120B via Together.ai

export async function extractSpreadsheetData(
  markdownContent: string,
  fileName: string
): Promise<{ extractedData: ExtractedData | null; tokensUsed: number; confidence: number }> {
  const apiKey = process.env.TOGETHER_API_KEY;
  
  if (!apiKey) {
    throw new Error('TOGETHER_API_KEY environment variable is not set');
  }

  console.log('[Data Extraction] Starting extraction for file:', fileName);
  console.log('[Data Extraction] Markdown content length:', markdownContent.length);
  const startTime = Date.now();

  const prompt = `You are an expert financial data extraction specialist analyzing real estate development spreadsheets for a real estate financing company.

CONTEXT:
- This is a real estate financing company
- Extract financial data that would be useful for property appraisals and financial analysis
- Normalize terminology variations (e.g., "units" = "houses" = "dwellings" = "plots" = "developments")
- Handle different layouts and terminology - be flexible in finding the data
- This document is likely in Great Britain Pounds (GBP) - look for £ symbols, "GBP", or British formatting

FILE INFORMATION:
File name: ${fileName}

Markdown table content:
${markdownContent}

EXTRACTION REQUIREMENTS:
Extract the following information if available (do not fail if some are missing):

1. COSTS: Extract ALL cost-related line items across the document as INDIVIDUAL items and CATEGORIZE them.
   - CRITICAL: Do NOT group costs together. If there are costs for different plots/developments, extract each separately.
   - CRITICAL: EXCLUDE ALL SUBTOTALS AND CATEGORY TOTALS
   - Before extracting ANY cost, check if it's a subtotal/category total by:
     * Looking for names like "Site Costs", "Net Construction Costs", "Professional Fees", "Disposal Fees", "Total", "Subtotal"
     * Checking if the value equals the sum of items in the rows/cells around it
     * If a row has a category name (like "Disposal Fees") followed by an amount, and that amount equals the sum of items below/above it, it's a SUBTOTAL - EXCLUDE IT
   - Examples of SUBTOTALS to EXCLUDE: "Site Costs: £1,135,000", "Disposal Fees: £86,812.5", "Professional Fees: £145,000", "Net Construction Cost: £2,100,000"
   - Examples of INDIVIDUAL ITEMS to INCLUDE: "Site Purchase Price: £1,200,000", "Selling Agents Fee: £78,812.5", "Legal Fees: £50,000"
   - Look for: Construction costs, Permit fees, Legal fees, Marketing costs, Finance costs, Operational costs, Professional fees, Overheads, Admin fees, Commissions, Development costs, Project costs, or any other expense categories
   - If costs are associated with specific plots/developments, include the plot/development name in the type (e.g., "Plot A - Construction", "Development 1 - Legal Fees")
   - CRITICAL: Strip ALL currency symbols AND thousand separators from numeric values before returning
     Examples:
     - "£1,000,000" → 1000000
     - "$500,000" → 500000
     - "€12,345.67" → 12345.67
     - "1,234" → 1234
   - EXCLUDE items with zero values, blank amounts, or no monetary data
   - EXCLUDE subtotal or total rows - only extract contributing line items
   - Each cost should have: type (the ACTUAL cost name/description from the spreadsheet - preserve the exact name as it appears, e.g., "Site Purchase Price", "Engineers", "Build Cost", "Selling Agents Fee"), amount (number without symbols/separators), currency (detected currency), category (see categorization below - this is SEPARATE from the type/name)
   - CRITICAL: The "type" field should contain the ACTUAL cost name from the spreadsheet, NOT the category name
   - CRITICAL: The "category" field is ADDITIONAL information - it does NOT replace the cost name
   - DO NOT duplicate the same item multiple times

   COST CATEGORIZATION (CRITICAL):
   - CRITICAL: Categorize based on the SPREADSHEET'S STRUCTURE, not item names
   - Look at the markdown table to see how costs are grouped:
     * Find the category subtotal rows (e.g., "Site Costs: £X", "Prof Fees: £Y", "Net Construction Cost: £Z")
     * Each individual cost item belongs to the category whose subtotal appears AFTER it in the table
     * Example: If you see "Architect: £22,000" followed by "Engineer: £12,500" and then "Prof Fees: £208,477", both items belong to "Professional Fees"
   
   - Map the spreadsheet's category names to our standard categories:
     1. "Site Costs" - Items under any subtotal like "Site Costs", "Site Purchase", "Land Costs"
     2. "Net Construction Costs" - Items under "Net Construction Cost", "Build Costs", "Construction Costs", "Groundworks"
     3. "Professional Fees" - Items under "Prof Fees", "Professional Fees", "Prof Costs", "Fees", "Consultancy"
     4. "Financing/Legal Fees" - Items under "Financing Costs", "Finance Costs", "Legal Costs", "Loan Costs" (ONLY if this category exists as a separate subtotal)
     5. "Disposal Fees" - Items under "Disposal Fees", "Sales Costs", "Marketing Costs", "Disposal Costs"
   
   - IMPORTANT: Use the SPREADSHEET'S grouping, not assumptions based on item names
     * If "Lender Legals" appears under the "Prof Fees" subtotal in the spreadsheet, categorize it as "Professional Fees"
     * If "Marketing" appears under "Disposal Fees" subtotal, categorize it as "Disposal Fees"
     * Follow the spreadsheet's logic, not your own assumptions
   
   - Algorithm:
     1. Scan through the markdown table from top to bottom
     2. When you find a cost item, note its position
     3. Look for the next subtotal row after that item
     4. That subtotal's category is the category for that item
     5. Map the spreadsheet's category name to our standard category names
   
   - DO NOT extract rows that are subtotals themselves (e.g., "Site Costs: £X", "Prof Fees: £Y")
   - Only extract the INDIVIDUAL LINE ITEMS and categorize them based on their position in the table structure

2. PLOTS/DEVELOPMENTS: Extract individual plot/development costs separately.
   - If the document has costs broken down by plot/development, extract each plot's cost separately
   - Include plot/development name (e.g., "Plot A", "Plot 1", "Development A", "Unit 101")
   - Extract the total cost for each individual plot/development
   - Extract square footage (sq ft, sqft, square feet, ft²) for each plot if available
   - Calculate price per square foot (cost / square feet) if both are available
   - Look for square footage in various formats: "1,200 sq ft", "1200 sqft", "1,200 square feet", "1200 ft²"
   - Strip currency symbols and separators from amounts
   - EXCLUDE if value is zero or blank

3. PROFIT: Extract profit information:
   - Total profit amount (strip currency symbols and separators)
   - Profit percentage (if available)
   - Currency (detected currency)
   - EXCLUDE if value is zero or blank

4. FINANCING: Extract financing information:
   - Loan amount (strip currency symbols and separators)
   - Interest rate as decimal (e.g., 0.045 for 4.5%)
   - Interest rate as percentage (e.g., 4.5)
   - Look for terms like "interest rate", "APR", "financing rate", "mortgage rate", "loan rate", "loan amount", "mortgage amount"
   - Currency (detected currency)
   - EXCLUDE if value is zero or blank

5. AVERAGE INTEREST: Extract interest rate information (if not already in financing):
   - Interest rate as decimal (e.g., 0.045 for 4.5%)
   - Interest rate as percentage (e.g., 4.5)
   - Look for terms like "interest rate", "APR", "financing rate", "mortgage rate", "loan rate"
   - EXCLUDE if value is zero or blank

6. UNITS: Extract unit/property count information:
   - CRITICAL: Check CONTEXT before extracting - labels can be misleading!
   - If you see "Total Units: 12,000" but surrounding cells/rows mention "sq ft", "square feet", "ft²", or similar,
     this is likely TOTAL SQUARE FEET, not unit count
   - Look at adjacent cells/rows to understand what the number actually represents
   - Common pattern: Column header says "Total Units" but values are square footage = it's square feet, not unit count
   - If the label says "Total Units" but the context suggests square footage, DO NOT extract as units
   - Instead, look for the actual unit count elsewhere in the table (might be in a different row/column)
   - Count of units/houses/developments/plots (actual count, NOT square footage)
   - Type of unit (normalize to: "units", "houses", "developments", or "plots")
   - Cost per unit (if available) - strip currency symbols and separators
   - Currency (detected currency)
   - EXCLUDE if count is zero or blank
   - EXCLUDE if it's actually square footage (check context carefully - look for "sq ft" indicators)
   - If uncertain, check multiple rows/columns to understand the data structure

7. MISCELLANEOUS: Extract any other financial items not covered above:
   - Any other costs, fees, or financial data
   - Strip currency symbols and separators
   - Include type and amount
   - Currency (detected currency)
   - EXCLUDE revenue/sales items (see REVENUE section below)

8. REVENUE/SALES: Extract revenue and sales information separately from costs:
   - Total Sales / Total Revenue / Projected Sales / Sales Value
   - Sales per unit / Price per unit (if available)
   - This is REVENUE, not a cost - it represents money coming in, not going out
   - Look for terms like "Total Sales", "Sales Value", "Revenue", "Projected Sales", "Sale Price", "Selling Price"
   - Strip currency symbols and separators from amounts
   - Currency (detected currency)
   - EXCLUDE if value is zero or blank
   - CRITICAL: Do NOT include revenue/sales in costs or miscellaneous - it's separate

9. CURRENCY DETECTION:
   - Detect the primary currency used in the document
   - Look for: £ (GBP), $ (USD), € (EUR), or explicit currency labels
   - If £ symbol is found, use "GBP"
   - If $ symbol is found, use "USD"
   - If € symbol is found, use "EUR"
   - If multiple currencies found, use the most common one
   - Set detectedCurrency field with the detected currency

9. EXTRACTION NOTES: 
   - If no extractable data is found, set extractionNotes to "No extractable financial data found"
   - If only partial data is found, note what was found and what was missing
   - Mention any data quality issues or ambiguities encountered
   - Note the detected currency
   - If revenue is found, note that profit should be calculated as revenue - costs

IMPORTANT RULES:
- CRITICAL: Strip ALL currency symbols ($, £, €, etc.) AND thousand separators (commas) from ALL numeric values in amounts
- CRITICAL: Do NOT group costs together - extract each plot/development cost as a separate line item
- CRITICAL: PRESERVE the ACTUAL cost names from the spreadsheet in the "type" field (e.g., "Site Purchase Price", "Engineers", "Build Cost", "Selling Agents Fee") - do NOT replace them with category names
- CRITICAL: The "category" field is SEPARATE from the "type" field - add the category but keep the original cost name
- EXCLUDE all items with zero values (0, $0, £0, blank, null, "N/A", etc.)
- EXCLUDE subtotals and totals - only extract individual line items
- DO NOT duplicate the same data point multiple times
- Preserve original terminology for cost types/names - use the exact names as they appear in the spreadsheet
- Normalize numeric values (strip currency symbols and separators) but preserve all text/names exactly
- Be thorough and accurate - extract ALL relevant items that have actual values
- Detect and return the primary currency used in the document

IMPORTANT: Respond with COMPLETE, valid JSON only. Do not truncate your response.

Respond with a JSON object in this EXACT format:
{
  "costs": [
    {
      "type": "Site Purchase Price",
      "amount": 500000,
      "currency": "GBP",
      "category": "Site Costs"
    },
    {
      "type": "Build Cost",
      "amount": 1200000,
      "currency": "GBP",
      "category": "Net Construction Costs"
    },
    {
      "type": "Engineers",
      "amount": 9800,
      "currency": "GBP",
      "category": "Professional Fees"
    },
    {
      "type": "Loan Cost",
      "amount": 127615,
      "currency": "GBP",
      "category": "Financing/Legal Fees"
    }
  ],
  "costCategories": {
    "siteCosts": {
      "items": [
        {"type": "Site Purchase Price", "amount": 500000, "currency": "GBP"}
      ],
      "subtotal": 500000,
      "currency": "GBP"
    },
    "netConstructionCosts": {
      "items": [
        {"type": "Build Cost", "amount": 1200000, "currency": "GBP"}
      ],
      "subtotal": 1200000,
      "currency": "GBP"
    },
    "professionalFees": {
      "items": [
        {"type": "Engineers", "amount": 9800, "currency": "GBP"}
      ],
      "subtotal": 9800,
      "currency": "GBP"
    },
    "financingLegalFees": {
      "items": [
        {"type": "Loan Cost", "amount": 127615, "currency": "GBP"}
      ],
      "subtotal": 127615,
      "currency": "GBP"
    }
  },
  "plots": [
    {
      "name": "Plot A",
      "cost": 300000,
      "squareFeet": 1200,
      "pricePerSquareFoot": 250,
      "currency": "GBP"
    },
    {
      "name": "Plot B",
      "cost": 400000,
      "squareFeet": 1500,
      "pricePerSquareFoot": 266.67,
      "currency": "GBP"
    }
  ],
  "profit": {
    "total": 150000,
    "percentage": 15.5,
    "currency": "GBP"
  },
  "financing": {
    "loanAmount": 2000000,
    "interestRate": 0.045,
    "interestPercentage": 4.5,
    "currency": "GBP"
  },
  "averageInterest": {
    "rate": 0.045,
    "percentage": 4.5
  },
  "units": {
    "type": "units",
    "count": 25,
    "costPerUnit": 28000,
    "currency": "GBP"
  },
  "miscellaneous": [
    {
      "type": "Marketing",
      "amount": 25000,
      "currency": "GBP"
    }
  ],
  "detectedCurrency": "GBP",
  "extractionNotes": "Successfully extracted all financial data. Currency detected: GBP",
  "confidence": 0.95
}

If no data is found, return:
{
  "costs": null,
  "plots": null,
  "profit": null,
  "financing": null,
  "averageInterest": null,
  "units": null,
  "miscellaneous": null,
  "revenue": null,
  "detectedCurrency": null,
  "extractionNotes": "No extractable financial data found",
  "confidence": 0.0
}`;

  try {
    console.log('[Data Extraction] Making API request to:', TOGETHER_API_URL);
    const requestBody = {
      model: MODEL_NAME,
      messages: [
        {
          role: 'system',
          content: 'You are a financial data extraction specialist. Always respond with COMPLETE, valid JSON only. Do not truncate your response. Extract structured financial data from markdown tables, normalizing terminology and handling various layouts.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2, // Lower temperature for more consistent extraction
      max_tokens: 15000, // Increased to handle large extractions and prevent truncation
    };
    console.log('[Data Extraction] Request body size:', JSON.stringify(requestBody).length, 'bytes');
    
    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const elapsedTime = Date.now() - startTime;
    console.log('[Data Extraction] API response received in:', elapsedTime, 'ms');
    console.log('[Data Extraction] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Data Extraction] API error response:', errorText);
      
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
        // If parsing fails, use the raw error text
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
    
    console.log('[Data Extraction] Content length:', content?.length || 0);
    console.log('[Data Extraction] Tokens used:', usage?.total_tokens || 0);

    if (!content) {
      throw new Error('No response content from Together.ai API');
    }

    // Extract JSON from response (handle cases where model adds markdown code blocks)
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    }

    // Check if JSON appears truncated (common issue with large responses)
    if (!jsonContent.endsWith('}')) {
      console.warn('[Data Extraction] JSON response may be truncated, attempting to fix...');
      // Try to find the last complete JSON object
      const lastBrace = jsonContent.lastIndexOf('}');
      if (lastBrace > 0) {
        jsonContent = jsonContent.substring(0, lastBrace + 1);
        console.log('[Data Extraction] Truncated JSON to last complete object');
      } else {
        throw new Error('JSON response appears to be incomplete or truncated');
      }
    }

    let result: ExtractedData;
    try {
      result = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('[Data Extraction] JSON parse error:', parseError);
      console.error('[Data Extraction] JSON content length:', jsonContent.length);
      console.error('[Data Extraction] JSON content preview:', jsonContent.substring(0, 500));
      throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Response may be truncated.`);
    }
    
    const totalTime = Date.now() - startTime;
    console.log('[Data Extraction] Extraction complete in:', totalTime, 'ms');
    console.log('[Data Extraction] Confidence:', result.confidence);
    console.log('[Data Extraction] Extraction notes:', result.extractionNotes);
    console.log('[Data Extraction] Detected currency:', result.detectedCurrency);
    
    // Calculate totals for each category
    const detectedCurrency = result.detectedCurrency || 'GBP'; // Default to GBP if not detected
    
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
    
    // Calculate plots total
    let plotsTotal: { amount: number; currency: string } | undefined = undefined;
    if (result.plots && Array.isArray(result.plots) && result.plots.length > 0) {
      const validPlots = result.plots.filter(p => p && typeof p.cost === 'number' && !isNaN(p.cost));
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
      extractedData: {
        costs: result.costs && Array.isArray(result.costs) && result.costs.length > 0 ? result.costs.filter(c => c !== null) : undefined,
        costCategories: result.costCategories || undefined,
        costsTotal,
        profit: result.profit && typeof result.profit === 'object' ? {
          ...result.profit,
          currency: result.profit.currency || detectedCurrency,
        } : undefined,
        financing: result.financing && typeof result.financing === 'object' ? {
          ...result.financing,
          currency: result.financing.currency || detectedCurrency,
        } : undefined,
        averageInterest: result.averageInterest && typeof result.averageInterest === 'object' ? result.averageInterest : undefined,
        units: result.units && typeof result.units === 'object' && result.units.count !== null && result.units.count !== undefined ? {
          ...result.units,
          currency: result.units.currency || detectedCurrency,
        } : undefined,
        plots: result.plots && Array.isArray(result.plots) && result.plots.length > 0 ? result.plots.filter(p => p !== null) : undefined,
        plotsTotal,
        miscellaneous: result.miscellaneous && Array.isArray(result.miscellaneous) && result.miscellaneous.length > 0 ? result.miscellaneous.filter(m => m !== null) : undefined,
        miscellaneousTotal,
        revenue: result.revenue && typeof result.revenue === 'object' ? {
          ...result.revenue,
          currency: result.revenue.currency || detectedCurrency,
        } : undefined,
        detectedCurrency: result.detectedCurrency || detectedCurrency,
        extractionNotes: result.extractionNotes || undefined,
        confidence: result.confidence !== null && result.confidence !== undefined ? result.confidence : 0.0,
        tokensUsed: usage?.total_tokens || 0,
      },
      tokensUsed: usage?.total_tokens || 0,
      confidence: result.confidence !== null && result.confidence !== undefined ? result.confidence : 0.0,
    };
  } catch (error) {
    console.error('[Data Extraction] Error during extraction:', error);
    // Don't fail the request - return null extractedData
    return {
      extractedData: {
        extractionNotes: 'Data extraction failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
        confidence: 0.0,
        tokensUsed: 0,
      },
      tokensUsed: 0,
      confidence: 0.0,
    };
  }
}

