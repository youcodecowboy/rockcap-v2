/**
 * Smart Pass Codification Engine
 * 
 * This module handles the second pass of codification using LLM (OSS-120B via Together.ai).
 * It runs when the Data Library is opened and there are items marked as "pending_review".
 * 
 * Key characteristics:
 * - Uses OSS-120B model for intelligent matching
 * - Only processes items not matched by Fast Pass
 * - Suggests existing codes or new code creation
 * - Returns confidence scores for each suggestion
 */

import { CodifiedItem } from './fastPassCodification';
import { TOGETHER_API_URL, MODEL_CONFIG } from '@/lib/modelConfig';

// Types for Smart Pass
export interface ItemCode {
  _id: string;
  code: string;
  displayName: string;
  category: string;
  dataType: string;
}

export interface ItemCodeAlias {
  alias: string;
  aliasNormalized: string;
  canonicalCode: string;
  canonicalCodeId: string;
}

export interface CategoryInfo {
  name: string;
  normalizedName: string;
  description: string;
  examples: string[];
}

// Project library item for consistency checking
export interface ProjectLibraryItem {
  itemCode: string;
  category: string;
  originalName: string;
}

export interface SmartPassSuggestion {
  itemId: string;
  originalName: string;
  suggestedCode: string;
  suggestedCodeId?: string;
  suggestedDisplayName: string;
  suggestedCategory: string;
  suggestedDataType: string;
  confidence: number;
  isNewCode: boolean;
  reasoning: string;
}

export interface SmartPassResult {
  suggestions: SmartPassSuggestion[];
  newCodeSuggestions: Array<{
    code: string;
    displayName: string;
    category: string;
    dataType: string;
    forItems: string[]; // Item IDs that would use this code
  }>;
  tokensUsed: number;
}

/**
 * Format item code in angle bracket format
 */
function formatCodeFromName(name: string): string {
  return `<${name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '.')}>`;
}

/**
 * Build the prompt for the LLM
 * Now uses dynamic categories from the database
 * Also considers existing project library items for consistency
 */
function buildCodificationPrompt(
  pendingItems: CodifiedItem[],
  existingCodes: ItemCode[],
  existingAliases: ItemCodeAlias[],
  categories?: CategoryInfo[],
  projectLibraryItems?: ProjectLibraryItem[]
): string {
  // Group existing codes by category for better context
  const codesByCategory: Record<string, ItemCode[]> = {};
  existingCodes.forEach(code => {
    if (!codesByCategory[code.category]) {
      codesByCategory[code.category] = [];
    }
    codesByCategory[code.category].push(code);
  });
  
  // Build existing codes section
  let existingCodesText = '';
  if (existingCodes.length > 0) {
    existingCodesText = `
EXISTING CODES IN THE SYSTEM:
${Object.entries(codesByCategory).map(([category, codes]) => `
${category}:
${codes.map(c => `  - ${c.code} (${c.displayName}) [${c.dataType}]`).join('\n')}`).join('\n')}
`;
  } else {
    existingCodesText = `
NO EXISTING CODES IN THE SYSTEM YET.
This is a cold start - you should suggest creating new codes for all items.
`;
  }
  
  // Build aliases section (for context on what terms map to what)
  let aliasesText = '';
  if (existingAliases.length > 0) {
    // Group aliases by canonical code
    const aliasByCode: Record<string, string[]> = {};
    existingAliases.forEach(a => {
      if (!aliasByCode[a.canonicalCode]) {
        aliasByCode[a.canonicalCode] = [];
      }
      aliasByCode[a.canonicalCode].push(a.alias);
    });
    
    aliasesText = `
KNOWN ALIASES (terms that map to codes):
${Object.entries(aliasByCode).map(([code, aliases]) => 
  `  ${code}: ${aliases.slice(0, 5).join(', ')}${aliases.length > 5 ? '...' : ''}`
).join('\n')}
`;
  }
  
  // Build dynamic category guidelines from database
  let categoryGuidelinesText = '';
  if (categories && categories.length > 0) {
    categoryGuidelinesText = `
CATEGORY GUIDELINES (use these to categorize items correctly):
${categories.map(cat => `
- "${cat.name}" (normalized: ${cat.normalizedName}):
  ${cat.description}
  Examples: ${cat.examples.join(', ')}`).join('\n')}
`;
  } else {
    // Fallback to hardcoded categories if none provided
    categoryGuidelinesText = `
CATEGORY GUIDELINES:
- "Site Costs" or "Purchase Costs": Land acquisition, stamp duty, finders fees
- "Professional Fees": Engineers, architects, solicitors, building regulations, S106/CIL
- "Construction Costs": Build costs, groundworks, retaining works
- "Financing Costs": Interest, loan costs, arrangement fees
- "Disposal Costs": Agents fees, legal fees, marketing
- "Plots": Individual unit/plot data
- "Revenue": Sales, GDV, income
`;
  }
  
  // Build project library section (codes already in use for THIS project)
  let projectLibraryText = '';
  if (projectLibraryItems && projectLibraryItems.length > 0) {
    // Group by category
    const byCategory: Record<string, ProjectLibraryItem[]> = {};
    projectLibraryItems.forEach(item => {
      if (!byCategory[item.category]) {
        byCategory[item.category] = [];
      }
      byCategory[item.category].push(item);
    });
    
    projectLibraryText = `
CODES ALREADY IN USE FOR THIS PROJECT (prefer these for consistency):
${Object.entries(byCategory).map(([category, items]) => `
${category}:
${items.map(i => `  - ${i.itemCode} ("${i.originalName}")`).join('\n')}`).join('\n')}

IMPORTANT: If the item you're codifying is semantically similar to an item already in this project's library,
use the SAME code to maintain consistency. This is critical for accurate aggregation.
`;
  }
  
  // Build items to codify section
  const itemsText = pendingItems.map((item, index) => 
    `${index + 1}. "${item.originalName}" (value: ${item.value}, category: ${item.category})`
  ).join('\n');

  return `You are a financial data codification specialist. Your task is to map extracted financial items to standardized codes for a real estate financial modeling system.

${existingCodesText}
${aliasesText}
${projectLibraryText}
ITEMS TO CODIFY:
${itemsText}

TASK:
For each item above, either:
1. Map it to an existing code (if one is semantically equivalent)
2. Suggest a new code (if no existing code matches)

CODE FORMAT RULES:
- Codes use angle brackets: <category.item> or <item>
- Use lowercase with dots for hierarchy
- Examples: <stamp.duty>, <site.costs>, <engineers>, <build.cost>, <interest.rate>
- Keep codes short and descriptive

${categoryGuidelinesText}

DATA TYPE RULES:
- currency: Monetary values (costs, prices, fees)
- number: Counts, quantities
- percentage: Rates (interest rate, profit margin)
- string: Text values

Respond with a JSON array containing one object per item:
[
  {
    "itemIndex": 1,
    "originalName": "Site Purchase Price",
    "suggestedCode": "<site.costs>",
    "suggestedDisplayName": "Site Costs",
    "suggestedCategory": "Site Costs",
    "suggestedDataType": "currency",
    "isNewCode": false,
    "confidence": 0.95,
    "reasoning": "Maps to existing site costs code for land acquisition"
  },
  {
    "itemIndex": 2,
    "originalName": "SDLT",
    "suggestedCode": "<stamp.duty>",
    "suggestedDisplayName": "Stamp Duty",
    "suggestedCategory": "Purchase Costs",
    "suggestedDataType": "currency",
    "isNewCode": true,
    "confidence": 0.98,
    "reasoning": "SDLT is Stamp Duty Land Tax - creating new code"
  }
]

IMPORTANT:
- Be consistent with existing codes when mapping
- Suggest new codes only when no existing code is semantically equivalent
- Use high confidence (0.9+) for clear matches
- Use lower confidence (0.7-0.8) for ambiguous matches
- Always provide reasoning
- Use the CATEGORY GUIDELINES above to select the correct category

Respond with ONLY the JSON array, no other text.`;
}

/**
 * Parse the LLM response
 */
function parseLLMResponse(
  response: string,
  pendingItems: CodifiedItem[],
  existingCodes: ItemCode[]
): SmartPassResult {
  // Extract JSON from response (handle markdown code blocks)
  let jsonContent = response.trim();
  if (jsonContent.startsWith('```')) {
    jsonContent = jsonContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
  }
  
  let parsed: Array<{
    itemIndex: number;
    originalName: string;
    suggestedCode: string;
    suggestedDisplayName: string;
    suggestedCategory: string;
    suggestedDataType: string;
    isNewCode: boolean;
    confidence: number;
    reasoning: string;
  }>;
  
  try {
    parsed = JSON.parse(jsonContent);
  } catch (error) {
    console.error('[SmartPass] Failed to parse LLM response:', error);
    console.error('[SmartPass] Raw response:', response);
    console.error('[SmartPass] Cleaned content:', jsonContent.substring(0, 500));
    
    // Try to recover partial results from truncated JSON
    // Find all complete JSON objects in the array
    const recoveredItems: typeof parsed = [];
    const objectPattern = /\{\s*"itemIndex":\s*\d+[\s\S]*?"reasoning":\s*"[^"]*"\s*\}/g;
    let match;
    
    while ((match = objectPattern.exec(response)) !== null) {
      try {
        const item = JSON.parse(match[0]);
        recoveredItems.push(item);
      } catch {
        // Skip malformed objects
      }
    }
    
    if (recoveredItems.length > 0) {
      console.log('[SmartPass] Recovered', recoveredItems.length, 'items from truncated response');
      parsed = recoveredItems;
    } else {
      // Last resort: try to extract JSON array
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
          console.log('[SmartPass] Recovered JSON from response');
        } catch {
          console.warn('[SmartPass] Could not recover any items, returning empty');
          parsed = [];
        }
      } else {
        console.warn('[SmartPass] No recoverable items found, returning empty');
        parsed = [];
      }
    }
  }
  
  // Handle case where LLM returns object wrapper instead of array
  if (!Array.isArray(parsed)) {
    console.warn('[SmartPass] Response was not an array, attempting to extract array');
    if (parsed && typeof parsed === 'object') {
      // Try common wrapper keys
      const possibleArrays = ['items', 'suggestions', 'results', 'data'];
      for (const key of possibleArrays) {
        if (Array.isArray((parsed as any)[key])) {
          parsed = (parsed as any)[key];
          console.log('[SmartPass] Found array in', key);
          break;
        }
      }
    }
    if (!Array.isArray(parsed)) {
      console.error('[SmartPass] Could not find array in response');
      parsed = []; // Fallback to empty array
    }
  }
  
  const suggestions: SmartPassSuggestion[] = [];
  const newCodeMap = new Map<string, {
    code: string;
    displayName: string;
    category: string;
    dataType: string;
    forItems: string[];
  }>();
  
  // Build code lookup
  const codeByCode = new Map(existingCodes.map(c => [c.code, c]));
  
  for (const item of parsed) {
    const pendingItem = pendingItems[item.itemIndex - 1];
    if (!pendingItem) continue;
    
    // Check if this maps to an existing code
    const existingCode = codeByCode.get(item.suggestedCode);
    
    const suggestion: SmartPassSuggestion = {
      itemId: pendingItem.id,
      originalName: pendingItem.originalName,
      suggestedCode: item.suggestedCode,
      suggestedCodeId: existingCode?._id,
      suggestedDisplayName: item.suggestedDisplayName,
      suggestedCategory: item.suggestedCategory,
      suggestedDataType: item.suggestedDataType,
      confidence: item.confidence,
      isNewCode: item.isNewCode && !existingCode,
      reasoning: item.reasoning,
    };
    
    suggestions.push(suggestion);
    
    // Track new codes that need to be created
    if (suggestion.isNewCode) {
      if (!newCodeMap.has(item.suggestedCode)) {
        newCodeMap.set(item.suggestedCode, {
          code: item.suggestedCode,
          displayName: item.suggestedDisplayName,
          category: item.suggestedCategory,
          dataType: item.suggestedDataType,
          forItems: [],
        });
      }
      newCodeMap.get(item.suggestedCode)!.forItems.push(pendingItem.id);
    }
  }
  
  return {
    suggestions,
    newCodeSuggestions: Array.from(newCodeMap.values()),
    tokensUsed: 0, // Will be updated from API response
  };
}

/**
 * Run Smart Pass codification using LLM
 * 
 * @param pendingItems - Items that need codification (from Fast Pass)
 * @param existingCodes - All existing codes in the system
 * @param existingAliases - All existing aliases
 * @param categories - Dynamic categories from database (optional, falls back to hardcoded)
 * @param projectLibraryItems - Items already in this project's data library (for consistency)
 * @returns SmartPassResult with suggestions
 */
export async function runSmartPass(
  pendingItems: CodifiedItem[],
  existingCodes: ItemCode[],
  existingAliases: ItemCodeAlias[],
  categories?: CategoryInfo[],
  projectLibraryItems?: ProjectLibraryItem[]
): Promise<SmartPassResult> {
  const apiKey = process.env.TOGETHER_API_KEY;
  
  if (!apiKey) {
    throw new Error('TOGETHER_API_KEY environment variable is not set');
  }
  
  if (pendingItems.length === 0) {
    return {
      suggestions: [],
      newCodeSuggestions: [],
      tokensUsed: 0,
    };
  }
  
  console.log('[SmartPass] Starting codification for', pendingItems.length, 'items');
  if (categories) {
    console.log('[SmartPass] Using', categories.length, 'dynamic categories');
  }
  if (projectLibraryItems && projectLibraryItems.length > 0) {
    console.log('[SmartPass] Using', projectLibraryItems.length, 'existing project library items for consistency');
  }
  const startTime = Date.now();
  
  const prompt = buildCodificationPrompt(pendingItems, existingCodes, existingAliases, categories, projectLibraryItems);
  
  try {
    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_CONFIG.codification.model,
        messages: [
          {
            role: 'system',
            content: 'You are a financial data codification specialist. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: MODEL_CONFIG.codification.temperature,
        max_tokens: MODEL_CONFIG.codification.maxTokens,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SmartPass] API error:', response.status, errorText);
      throw new Error(`Together.ai API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('[SmartPass] API response structure:', JSON.stringify(data).substring(0, 500));
    
    const content = data.choices?.[0]?.message?.content;
    const finishReason = data.choices?.[0]?.finish_reason;
    const tokensUsed = data.usage?.total_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    
    const elapsed = Date.now() - startTime;
    console.log('[SmartPass] Completed in', elapsed, 'ms');
    console.log('[SmartPass] Tokens - total:', tokensUsed, 'completion:', completionTokens, 'finish_reason:', finishReason);
    
    if (!content) {
      console.error('[SmartPass] Full response:', JSON.stringify(data));
      throw new Error(`No response content from LLM. Response: ${JSON.stringify(data).substring(0, 300)}`);
    }
    
    const result = parseLLMResponse(content, pendingItems, existingCodes);
    result.tokensUsed = tokensUsed;
    
    console.log('[SmartPass] Generated', result.suggestions.length, 'suggestions');
    console.log('[SmartPass] New codes suggested:', result.newCodeSuggestions.length);
    
    return result;
  } catch (error) {
    console.error('[SmartPass] Error during codification:', error);
    throw error;
  }
}

/**
 * Apply Smart Pass suggestions to codified items
 */
export function applySmartPassSuggestions(
  items: CodifiedItem[],
  suggestions: SmartPassSuggestion[]
): CodifiedItem[] {
  const suggestionMap = new Map(suggestions.map(s => [s.itemId, s]));
  
  return items.map(item => {
    const suggestion = suggestionMap.get(item.id);
    
    if (!suggestion) {
      return item;
    }
    
    return {
      ...item,
      suggestedCode: suggestion.suggestedCode,
      suggestedCodeId: suggestion.suggestedCodeId,
      mappingStatus: 'suggested' as const,
      confidence: suggestion.confidence,
    };
  });
}

/**
 * Generate a suggested code from item name (fallback if LLM fails)
 */
export function generateFallbackCode(itemName: string, category: string): {
  code: string;
  displayName: string;
  category: string;
  dataType: 'currency' | 'number' | 'percentage' | 'string';
} {
  const code = formatCodeFromName(itemName);
  
  // Detect data type from category
  let dataType: 'currency' | 'number' | 'percentage' | 'string' = 'currency';
  const lowerName = itemName.toLowerCase();
  
  if (lowerName.includes('rate') || lowerName.includes('percentage') || lowerName.includes('%')) {
    dataType = 'percentage';
  } else if (lowerName.includes('count') || lowerName.includes('number') || lowerName.includes('units')) {
    dataType = 'number';
  }
  
  return {
    code,
    displayName: itemName,
    category,
    dataType,
  };
}

