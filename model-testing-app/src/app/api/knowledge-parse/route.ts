import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { TOGETHER_API_URL, MODEL_CONFIG } from '@/lib/modelConfig';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ParsedRequirement {
  name: string;
  category: string;
  description?: string;
  priority: 'required' | 'nice_to_have' | 'optional';
}

interface ExistingChecklistItem {
  name: string;
  category: string;
  description?: string;
  status: string;
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const client = await getAuthenticatedConvexClient();
    try {
      await requireAuth(client);
    } catch (authError) {
      return NextResponse.json(
        { error: 'Unauthenticated' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { text, existingItems } = body as { text: string; existingItems?: ExistingChecklistItem[] };

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: 'Text description is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY environment variable is not set');
    }

    // Build existing items context for the prompt
    let existingItemsContext = '';
    if (existingItems && existingItems.length > 0) {
      const itemsByCategory = existingItems.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
      }, {} as Record<string, ExistingChecklistItem[]>);

      existingItemsContext = `
EXISTING CHECKLIST ITEMS (for context - user may want to duplicate or modify these):
${Object.entries(itemsByCategory).map(([category, items]) => `
${category}:
${items.map(item => `  - ${item.name}${item.description ? ` (${item.description})` : ''} [${item.status}]`).join('\n')}`).join('\n')}

IMPORTANT: If the user asks to "duplicate", "copy", "add similar", or create items "like" existing ones (especially for a new location, office, or project):
- Create NEW requirements based on the existing items in the relevant category
- Modify names to reflect the new context (e.g., "KYC Documents for Dubai Office", "Personal Bank Statements - Dubai Office")
- Keep the same category and priority as the originals
- Generate ALL relevant items from the category, not just one summary item
`;
    }

    const prompt = `You are an AI assistant helping to parse document requirements for a real estate financing company's Knowledge Library.

CONTEXT:
- RockCap is a real estate financing company
- The Knowledge Library tracks required documents from clients (borrowers, lenders, developers)
- Users need to add custom document requirements beyond the standard templates
- Categories typically include: KYC, Project Information, Project Plans, Professional Reports, Legal Documents, Financial Documents
${existingItemsContext}
USER INPUT:
"${text}"

TASK:
Parse the user's natural language description and extract structured document requirements. The user may describe one or multiple documents they need from their client.

PARSING RULES:
1. Extract each distinct document requirement mentioned
2. For each requirement, determine:
   - name: A clear, professional document name
   - category: Best fitting category from: KYC, Project Information, Project Plans, Professional Reports, Legal Documents, Financial Documents, Due Diligence, or create a suitable one
   - description: Brief description of what this document should contain (if inferable)
   - priority: "required" if explicitly stated as needed/must have, "nice_to_have" if mentioned as useful/helpful, "optional" otherwise
3. Be generous in parsing - if the user mentions a document type, extract it
4. Combine similar items but keep distinct document types separate
5. If the user mentions general categories (e.g., "due diligence documents"), break them into specific document types
6. **CRITICAL**: If the user asks to duplicate or copy existing items for a new location/office/project, create INDIVIDUAL requirements for EACH existing item in that category with modified names

EXAMPLES:
- "I need project plans for the new site" → Extract "Site Project Plans" 
- "We'll need an environmental survey and a traffic study" → Extract 2 requirements
- "Some additional evaluation reports would be helpful" → Extract "Evaluation Report" as nice_to_have
- "Duplicate KYC for Dubai office" (with 5 KYC items existing) → Extract 5 NEW requirements, each prefixed with "Dubai Office - "

Respond with a JSON object in this EXACT format:
{
  "requirements": [
    {
      "name": "Clear document name",
      "category": "Category name",
      "description": "Brief description or null",
      "priority": "required" | "nice_to_have" | "optional"
    }
  ]
}

If no valid requirements can be extracted, return:
{
  "requirements": [],
  "error": "Could not extract any document requirements from the text"
}

IMPORTANT: Always respond with valid JSON only, no additional text.`;

    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_CONFIG.analysis.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that parses document requirement descriptions for a real estate financing company. Always respond with valid JSON only. Be thorough in extracting all mentioned document types.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent parsing
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Together.ai API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response content from Together.ai API');
    }

    // Extract JSON from response
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    }

    let result;
    try {
      result = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('Failed to parse LLM response:', jsonContent);
      throw new Error('Failed to parse AI response');
    }

    // Validate and sanitize the result
    if (!result.requirements || !Array.isArray(result.requirements)) {
      return NextResponse.json({
        requirements: [],
        error: result.error || 'No requirements could be extracted',
      });
    }

    // Validate each requirement
    const validRequirements: ParsedRequirement[] = result.requirements
      .filter((req: any) => req.name && req.category)
      .map((req: any) => ({
        name: String(req.name).trim(),
        category: String(req.category).trim(),
        description: req.description ? String(req.description).trim() : undefined,
        priority: ['required', 'nice_to_have', 'optional'].includes(req.priority) 
          ? req.priority 
          : 'required',
      }));

    return NextResponse.json({
      requirements: validRequirements,
      parsed: validRequirements.length,
    });
  } catch (error) {
    console.error('Error parsing knowledge requirements:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse requirements' },
      { status: 500 }
    );
  }
}
