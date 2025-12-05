import { ExtractedData } from '@/types';
import { TOGETHER_API_URL, MODEL_CONFIG } from '@/lib/modelConfig';

export async function normalizeExtractedData(
  extractedData: ExtractedData,
  markdownContent: string,
  fileName: string
): Promise<ExtractedData> {
  const apiKey = process.env.TOGETHER_API_KEY;
  
  if (!apiKey) {
    throw new Error('TOGETHER_API_KEY environment variable is not set');
  }

  console.log('[Data Normalization] Starting normalization for file:', fileName);
  console.log('[Data Normalization] Markdown content length:', markdownContent.length);
  const startTime = Date.now();

  // Prepare extracted data summary for the prompt
  const extractedSummary = {
    costs: extractedData.costs?.map(c => `${c.type}: ${c.amount}`).join(', ') || 'None',
    plots: extractedData.plots?.map(p => `${p.name}: ${p.cost}`).join(', ') || 'None',
    profit: extractedData.profit ? `Total: ${extractedData.profit.total}, Percentage: ${extractedData.profit.percentage}` : 'None',
    financing: extractedData.financing ? `Loan: ${extractedData.financing.loanAmount}, Interest: ${extractedData.financing.interestPercentage}%` : 'None',
    units: extractedData.units ? `${extractedData.units.count} ${extractedData.units.type}` : 'None',
    miscellaneous: extractedData.miscellaneous?.map(m => `${m.type}: ${m.amount}`).join(', ') || 'None',
    revenue: extractedData.revenue ? `Total Sales: ${extractedData.revenue.totalSales}` : 'None',
  };

  const prompt = `You are a financial data normalization specialist. Your task is to clean and normalize extracted financial data by removing duplicates, subtotals, and ensuring completeness.

ORIGINAL MARKDOWN TABLE CONTENT (for reference):
${markdownContent.substring(0, 20000)}${markdownContent.length > 20000 ? '\n\n[... content truncated ...]' : ''}

EXTRACTED DATA TO NORMALIZE:
Costs: ${extractedSummary.costs}
Plots: ${extractedSummary.plots}
Profit: ${extractedSummary.profit}
Financing: ${extractedSummary.financing}
Units: ${extractedSummary.units}
Miscellaneous: ${extractedSummary.miscellaneous}
Revenue: ${extractedSummary.revenue}

NORMALIZATION TASKS:

CRITICAL: PRESERVE ALL COST NAMES
- You MUST preserve the ACTUAL cost names/types exactly as they appear in the extracted data
- Do NOT replace cost names with category names (e.g., keep "Site Purchase Price" NOT "Purchase", keep "Engineers" NOT "Professional")
- The "type" field should contain the original cost name from the spreadsheet
- The "category" field is SEPARATE - it categorizes the cost but does NOT replace the name
- Only change cost names if they are clearly subtotals or duplicates

1. REMOVE SUBTOTALS AND TOTALS (CRITICAL):
   - Identify which cost items are actually subtotals or category totals of other items
   - CRITICAL: Check for category names in cost types:
     * If a cost type contains ONLY a category name like "Site Costs", "Disposal Fees", "Professional Fees", "Net Construction Costs", "Financing/Legal Fees" with no additional detail, it's likely a SUBTOTAL
     * Compare that cost's amount to the sum of other costs in the same category
     * If the amount matches the sum of other items, it's a SUBTOTAL - REMOVE IT
   - For example:
     * If "Site Costs: £1,135,000" appears and equals the sum of "Site Purchase Price: £1,100,000" + "Site Stamp Duty: £35,000", remove "Site Costs"
     * If "Disposal Fees: £86,812.5" appears and equals the sum of "Selling Agents Fee: £78,812.5" + "Selling Legal Fees: £4,500" + "Site Set Up Legals: £3,500", remove "Disposal Fees"
   - Remove any items that are explicit totals (e.g., "Total Costs", "Total Development Costs", "Net Construction Cost", "Total", "Subtotal")
   - Keep only the individual line items that make up those totals
   - Algorithm to detect subtotals:
     * For each cost in a category, check if its type is just the category name
     * Calculate the sum of all other costs in that category (excluding this one)
     * If this cost's amount equals or is very close to (within 1%) that sum, it's a subtotal - REMOVE IT

2. REMOVE DUPLICATES:
   - If the same cost appears multiple times with the same or similar name and amount, keep only one instance
   - If a plot appears multiple times, keep only one instance
   - CRITICAL: Remove revenue/sales items from costs and miscellaneous (e.g., "Total Sales", "Sales Value", "Revenue" should NOT be in costs)
   - CRITICAL: If you find a cost that is a category subtotal (e.g., "Disposal Fees") alongside the individual items that make up that category (e.g., "Selling Agents Fee", "Selling Legal Fees"), REMOVE the category subtotal

3. SEPARATE REVENUE FROM COSTS (CRITICAL):
   - Revenue/Sales items (like "Total Sales", "Sales Value", "Projected Sales") are NOT costs
   - These represent money coming IN, not going OUT
   - Move any revenue items from costs/miscellaneous to the revenue section
   - Revenue should be separate: { totalSales, salesPerUnit, currency }
   - Profit = Revenue - Costs, so revenue must be kept separate

4. ENSURE ALL PLOTS ARE FOUND:
   - Review the markdown table content carefully
   - Extract ALL individual plots/developments (should be 4 plots in this case)
   - Each plot should have its own entry with name, cost, square feet (if available), and calculated price per square foot
   - Look for patterns like "Plot A", "Plot B", "Plot 1", "Plot 2", "Development A", etc.
   - Extract square footage for each plot if available in the markdown tables

5. VALIDATE AND CLEAN:
   - Ensure all amounts are numbers (no currency symbols or separators)
   - Remove any items with zero or null values
   - Ensure currency is consistent (should be GBP for this document)
   - Calculate price per square foot for plots: cost / squareFeet (if both are available)

6. COST CATEGORY VALIDATION (CRITICAL):
   - Review the markdown tables to find cost category subtotals and their exact values:
     * Look for rows like "Site Costs: £X", "Prof Fees: £Y", "Net Construction Cost: £Z"
     * Note the exact amounts for each category subtotal from the markdown
   - CRITICAL: Validate using SPREADSHEET'S category subtotals, not calculated sums
     * Compare extracted category subtotals to the ACTUAL subtotals in the markdown table
     * The spreadsheet's "Prof Fees: £208,477" is the SOURCE OF TRUTH
     * If extracted Professional Fees = £104,027 but markdown shows "Prof Fees: £208,477", there's a £104,450 discrepancy
   - For each category, ensure items are correctly grouped based on SPREADSHEET STRUCTURE:
     * Items should be categorized based on which subtotal row appears AFTER them in the table
     * NOT based on item names or assumptions
     * If "Lender Legals" appears before "Prof Fees" subtotal, it belongs to Professional Fees
   - If a category subtotal doesn't match the markdown table's subtotal:
     * Identify which items are in the wrong category
     * Move items to the correct category based on their position in the markdown table
     * Recalculate category subtotals
     * Ensure category subtotals match the markdown table's subtotal rows EXACTLY
   - Calculate the sum of all category subtotals
   - Find "Total Development Costs" in the markdown table
   - Verify: Sum of category subtotals = Total Development Costs
   - If NO MATCH:
     * Review which categories have incorrect subtotals
     * Re-categorize items based on markdown table structure
     * Ensure all costs are in the correct category
     * Make category subtotals match markdown EXACTLY

7. MATH VALIDATION (CRITICAL):
   - Calculate the sum of ALL extracted costs (individual line items only, excluding any totals/subtotals)
   - Find the "Total Costs", "Total Development Costs", or similar total rows in the markdown tables
   - Extract the actual total value from the markdown table
   - Compare: Does extracted costs sum match the actual total from markdown?
   - If NO MATCH:
     * Calculate the exact difference
     * Systematically review the markdown table to find missing cost items
     * Identify which items are MISSING (in markdown total but not in extracted costs)
     * Identify which items are INCORRECTLY INCLUDED (subtotals, duplicates, revenue items)
     * Add missing items or remove incorrect items to make totals match EXACTLY
   - The extracted costs total MUST equal the actual "Total Development Costs" from markdown tables EXACTLY
   - Do the same validation for plots total and miscellaneous total
   - If totals still don't match after corrections, note this in extractionNotes

8. UNIT INTERPRETATION VALIDATION:
   - Check if units were extracted (e.g., "Total Units: 12,000")
   - Review the markdown table context around that value
   - Look for adjacent cells mentioning "sq ft", "square feet", "ft²", or similar
   - If "Total Units" value appears to be square footage based on context:
     * Correct the units extraction
     * Set units.count to the actual number of units (if you can find it elsewhere)
     * Note the correction in extractionNotes
   - Common pattern: "Total Units" column with square footage values = it's total square feet, not unit count

9. FINAL VALIDATION CHECK:
   - Ensure revenue items (Total Sales, Sales Value) are NOT included in cost totals
   - Verify profit calculation: Revenue - Costs = Profit (if both revenue and costs are available)
   - Ensure all extracted data matches the source markdown tables

10. ORGANIZE BY CATEGORY:
   - Keep costs separate from plots
   - Ensure plots are individual entries, not grouped

Return the cleaned and normalized data in the SAME JSON format as the extracted data, but with:
- Subtotals/totals removed
- Duplicates removed
- All plots found and listed individually
- Clean, normalized structure

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
    }
  ],
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
  "revenue": {
    "totalSales": 2740000,
    "salesPerUnit": 685000,
    "currency": "GBP"
  },
  "detectedCurrency": "GBP",
  "extractionNotes": "Normalized: Removed X subtotals, found Y plots, removed Z duplicates",
  "confidence": 0.95
}`;

  try {
    console.log('[Data Normalization] Making API request to:', TOGETHER_API_URL);
    const requestBody = {
      model: MODEL_CONFIG.normalization.model,
      messages: [
        {
          role: 'system',
          content: 'You are a financial data normalization specialist. Always respond with COMPLETE, valid JSON only. Clean extracted financial data by removing subtotals, duplicates, and ensuring completeness. Use the markdown table content to validate totals and identify discrepancies.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: MODEL_CONFIG.normalization.temperature,
      max_tokens: MODEL_CONFIG.normalization.maxTokens,
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
    console.log('[Data Normalization] API response received in:', elapsedTime, 'ms');
    console.log('[Data Normalization] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Data Normalization] API error response:', errorText);
      
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
    
    console.log('[Data Normalization] Content length:', content?.length || 0);
    console.log('[Data Normalization] Tokens used:', usage?.total_tokens || 0);

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
      console.warn('[Data Normalization] JSON response may be truncated, attempting to fix...');
      const lastBrace = jsonContent.lastIndexOf('}');
      if (lastBrace > 0) {
        jsonContent = jsonContent.substring(0, lastBrace + 1);
        console.log('[Data Normalization] Truncated JSON to last complete object');
      } else {
        throw new Error('JSON response appears to be incomplete or truncated');
      }
    }

    let result: ExtractedData;
    try {
      result = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('[Data Normalization] JSON parse error:', parseError);
      console.error('[Data Normalization] JSON content preview:', jsonContent.substring(0, 500));
      throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }
    
    const totalTime = Date.now() - startTime;
    console.log('[Data Normalization] Normalization complete in:', totalTime, 'ms');
    console.log('[Data Normalization] Normalized costs count:', result.costs?.length || 0);
    console.log('[Data Normalization] Normalized plots count:', result.plots?.length || 0);
    
    // Calculate totals for normalized data
    const detectedCurrency = result.detectedCurrency || extractedData.detectedCurrency || 'GBP';
    
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
      costs: result.costs && Array.isArray(result.costs) && result.costs.length > 0 ? result.costs.filter(c => c !== null) : undefined,
      costCategories: result.costCategories || extractedData.costCategories || undefined,
      costsTotal,
      profit: result.profit && typeof result.profit === 'object' ? {
        ...result.profit,
        currency: result.profit.currency || detectedCurrency,
      } : extractedData.profit,
      financing: result.financing && typeof result.financing === 'object' ? {
        ...result.financing,
        currency: result.financing.currency || detectedCurrency,
      } : extractedData.financing,
      averageInterest: result.averageInterest && typeof result.averageInterest === 'object' ? result.averageInterest : extractedData.averageInterest,
      units: result.units && typeof result.units === 'object' && result.units.count !== null && result.units.count !== undefined ? {
        ...result.units,
        currency: result.units.currency || detectedCurrency,
      } : extractedData.units,
      plots: result.plots && Array.isArray(result.plots) && result.plots.length > 0 ? result.plots.map(plot => {
        // Ensure price per square foot is calculated if square feet is available
        if (plot && typeof plot.cost === 'number' && typeof plot.squareFeet === 'number' && plot.squareFeet > 0) {
          if (!plot.pricePerSquareFoot || plot.pricePerSquareFoot === 0) {
            plot.pricePerSquareFoot = plot.cost / plot.squareFeet;
          }
        }
        return plot;
      }).filter(p => p !== null) : extractedData.plots,
      plotsTotal,
      miscellaneous: result.miscellaneous && Array.isArray(result.miscellaneous) && result.miscellaneous.length > 0 ? result.miscellaneous.filter(m => m !== null) : extractedData.miscellaneous,
      miscellaneousTotal,
      revenue: result.revenue && typeof result.revenue === 'object' ? {
        ...result.revenue,
        currency: result.revenue.currency || detectedCurrency,
      } : extractedData.revenue,
      detectedCurrency: result.detectedCurrency || detectedCurrency,
      extractionNotes: result.extractionNotes || extractedData.extractionNotes || undefined,
      confidence: result.confidence !== null && result.confidence !== undefined ? result.confidence : extractedData.confidence || 0.0,
      tokensUsed: (extractedData.tokensUsed || 0) + (usage?.total_tokens || 0),
    };
  } catch (error) {
    console.error('[Data Normalization] Error during normalization:', error);
    // Return original data if normalization fails
    console.log('[Data Normalization] Returning original extracted data due to normalization error');
    return extractedData;
  }
}

