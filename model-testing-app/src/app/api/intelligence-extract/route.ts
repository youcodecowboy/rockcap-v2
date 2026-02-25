import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedConvexClient } from '@/lib/auth';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import {
  CLIENT_CANONICAL_FIELDS,
  PROJECT_CANONICAL_FIELDS,
  normalizeExtractedFields,
  getFieldHintsForDocument,
  generateFieldDescriptions,
  getFieldLabel,
  getCategoryFromPath,
  getFieldConfig,
  FieldType,
} from '@/lib/canonicalFields';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes for extraction

// V4: Use Anthropic Claude for extraction (replaces Together.ai + OpenAI)
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

interface ExtractedField {
  fieldPath: string;  // This will be the label from extraction, normalized later
  value: any;
  confidence: number;
  sourceText?: string;
  pageNumber?: number;
}

interface ExtractedAttribute {
  key: string;
  value: any;
  confidence: number;
  sourceText?: string;
}

interface ExtractionResult {
  fields: ExtractedField[];
  attributes: ExtractedAttribute[];
  insights: {
    keyFindings?: string[];
    risks?: Array<{ risk: string; severity?: string }>;
  };
}

interface NormalizedField {
  originalLabel: string;
  fieldPath: string;
  isCanonical: boolean;
  value: any;
  sourceText?: string;
  confidence: number;
  matchedAlias?: string;
  category: string;
  label: string;
}

/**
 * Infer the valueType for a field based on its canonical config or the value itself
 */
function inferValueType(
  fieldPath: string,
  value: any,
  targetType: 'client' | 'project'
): FieldType {
  // First check if we have a canonical field config
  const config = getFieldConfig(fieldPath, targetType);
  if (config) {
    return config.type;
  }

  // Infer from value type
  if (value === null || value === undefined) return 'string';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') {
    // Check field path for hints
    const pathLower = fieldPath.toLowerCase();
    if (pathLower.includes('cost') || pathLower.includes('value') ||
        pathLower.includes('price') || pathLower.includes('amount') ||
        pathLower.includes('gdv') || pathLower.includes('loan') ||
        pathLower.includes('worth') || pathLower.includes('assets')) {
      return 'currency';
    }
    if (pathLower.includes('ltv') || pathLower.includes('ltc') ||
        pathLower.includes('margin') || pathLower.includes('rate') ||
        pathLower.includes('percentage')) {
      return 'percentage';
    }
    return 'number';
  }
  if (typeof value === 'string') {
    // Check if it looks like a date
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    // Check if it's long text
    if (value.length > 200) return 'text';
    return 'string';
  }
  return 'string';
}

/**
 * Intelligence Extraction Agent
 * Extracts structured intelligence from document content using canonical field hints
 */
async function runIntelligenceExtraction(
  documentContent: string,
  documentType: string,
  documentCategory: string,
  targetType: 'project' | 'client',
  _apiKey: string, // Kept for signature compat; Anthropic key read from env
  isTextInput: boolean = false,
  fieldHints?: string[]
): Promise<ExtractionResult> {
  // Get field descriptions for the prompt
  // If we have field hints (from document category), prioritize those
  // Otherwise, show all fields
  const fieldDescriptions = fieldHints && fieldHints.length > 0
    ? generateFieldDescriptions(targetType, fieldHints)
    : generateFieldDescriptions(targetType);

  // Use a more flexible prompt for text input mode (meeting notes, emails, etc.)
  const systemPrompt = isTextInput
    ? `You are an expert intelligence extraction agent for a real estate finance platform.
Your task is to extract useful information from meeting notes, emails, call summaries, or casual text input.

IMPORTANT: Be FLEXIBLE in your extraction. This is conversational/notes text, not a formal document.
Use NATURAL LANGUAGE for field labels - the system will normalize them automatically.

EXTRACTION GUIDELINES:
1. Look for ANY mentions of relevant data, even if informal (e.g., "John mentioned they need about 2 million" → extract as "Loan Amount" or "Loan Required")
2. Extract names, phone numbers, email addresses, company names, addresses
3. Extract ANY financial figures mentioned (amounts, rates, percentages, values)
4. Look for preferences, requirements, timelines mentioned in conversation
5. Be generous with confidence scores for conversational text - if something is mentioned, extract it

LABEL GUIDELINES - Use natural language labels like:
- "Company Name", "Email", "Phone Number", "Address"
- "Loan Amount", "Purchase Price", "GDV", "Net Worth"
- "Project Type", "Unit Count", "Completion Date"
The system will automatically normalize these to canonical field paths.

CONFIDENCE FOR TEXT INPUT:
- 0.8-1.0: Clear statement ("The loan amount is £2M", "Contact: john@email.com")
- 0.6-0.8: Mentioned in conversation ("they're looking for around £2M", "John said...")
- 0.5-0.6: Implied or approximate ("roughly 2 million range")

For monetary values, convert to GBP numbers. For dates, use ISO format.
You MUST respond in valid JSON format only.`
    : `You are an expert intelligence extraction agent for a real estate finance platform.
Your task is to extract structured data from documents to populate a knowledge base.

IMPORTANT RULES:
1. Only extract data that is EXPLICITLY stated in the document - never infer or guess
2. Use NATURAL LANGUAGE for field labels - the system will normalize them automatically
3. Provide confidence scores (0.0 to 1.0) based on how clearly the data is stated
4. Include the exact source text that supports each extraction (quote from document)
5. For dates, use ISO format (YYYY-MM-DD)
6. For monetary values, convert to numbers in GBP (remove currency symbols, commas)
7. For percentages used as ratios (LTV, LTC, profit margin), store as numbers (e.g., 75% = 75)

LABEL GUIDELINES - Use natural language labels like:
- "Company Name", "Registration Number", "Email", "Phone"
- "Loan Amount", "Purchase Price", "GDV", "Construction Cost"
- "Project Type", "Site Address", "Completion Date"
The system will automatically normalize these to canonical field paths.

CONFIDENCE GUIDELINES:
- 0.9-1.0: Clearly labeled data, exact match (e.g., "Loan Amount: £2,500,000")
- 0.7-0.9: Data clearly present but requires minor interpretation
- 0.5-0.7: Data can be inferred from context but not explicitly labeled
- Below 0.5: Don't extract - too uncertain

You MUST respond in valid JSON format only.`;

  const userPrompt = isTextInput
    ? `Extract all relevant intelligence from this text input (meeting notes/email/call summary).

${fieldHints && fieldHints.length > 0 ? `PRIORITY FIELDS TO LOOK FOR (this text likely contains):
${fieldDescriptions}

` : ''}ALL AVAILABLE FIELDS:
${generateFieldDescriptions(targetType)}

TEXT INPUT:
---
${documentContent.substring(0, 15000)}
---

EXTRACT EVERYTHING USEFUL. Be thorough! Look for:
- Any person names, roles, contact info
- Any company/business names
- Any addresses or locations mentioned
- Any financial figures (amounts, rates, values, costs)
- Any dates or timelines
- Any preferences, requirements, or needs expressed
- Key points, decisions, or action items

Respond with JSON:
{
  "fields": [
    {
      "fieldPath": "natural language label like 'Company Name' or 'Loan Amount'",
      "value": "extracted value",
      "confidence": 0.5-1.0,
      "sourceText": "the relevant text"
    }
  ],
  "attributes": [
    {
      "key": "custom_key_for_any_other_useful_data",
      "value": "the value",
      "confidence": 0.5-1.0,
      "sourceText": "relevant text"
    }
  ],
  "insights": {
    "keyFindings": ["summary point 1", "summary point 2", "etc"],
    "risks": [{"risk": "any concern or risk noted", "severity": "low|medium|high"}]
  }
}

IMPORTANT: Extract something! If there's any useful information in this text, capture it.`
    : `Extract intelligence from this ${documentType} (Category: ${documentCategory}).

${fieldHints && fieldHints.length > 0 ? `PRIORITY FIELDS (this document type typically contains):
${fieldDescriptions}

` : ''}ALL TARGET FIELDS TO EXTRACT (${targetType} intelligence):
${generateFieldDescriptions(targetType)}

DOCUMENT CONTENT:
---
${documentContent.substring(0, 15000)}
---

Respond with a JSON object in this exact format:
{
  "fields": [
    {
      "fieldPath": "natural language label like 'Company Name' or 'Purchase Price'",
      "value": "the extracted value (string, number, or date as appropriate)",
      "confidence": 0.0-1.0,
      "sourceText": "exact quote from document that supports this extraction"
    }
  ],
  "attributes": [
    {
      "key": "string - custom attribute name for data not in standard fields (e.g., 's106_contribution', 'cil_amount', 'build_contract_value')",
      "value": "the extracted value",
      "confidence": 0.0-1.0,
      "sourceText": "exact quote from document"
    }
  ],
  "insights": {
    "keyFindings": ["important finding 1", "important finding 2"],
    "risks": [
      {"risk": "description of risk identified", "severity": "low|medium|high"}
    ]
  }
}

Only include fields and attributes where you have confidence >= 0.5.
For insights, identify 2-5 key findings and any risks mentioned in the document.`;

  try {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log(`[Intelligence Extraction] Using Anthropic Claude (${ANTHROPIC_MODEL})`);

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      temperature: 0.1,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt + '\n\nIMPORTANT: Respond with ONLY valid JSON, no markdown or explanation.' },
      ],
    });

    const content = response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');

    // Strip markdown code blocks if present
    let cleaned = content.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    // Parse the JSON response
    const parsed = JSON.parse(cleaned);

    return {
      fields: (parsed.fields || []).filter((f: ExtractedField) => f.confidence >= 0.5),
      attributes: (parsed.attributes || []).filter((a: ExtractedAttribute) => a.confidence >= 0.5),
      insights: parsed.insights || {},
    };
  } catch (error) {
    console.error('[Intelligence Extraction] Error:', error);
    throw error;
  }
}

/**
 * Normalize extracted fields to canonical paths
 */
function normalizeAndEnrichFields(
  extraction: ExtractionResult,
  targetType: 'client' | 'project'
): NormalizedField[] {
  // Convert fields to the format expected by normalizeExtractedFields
  const fieldsToNormalize = extraction.fields.map(f => ({
    label: f.fieldPath, // The AI returns natural language labels in fieldPath
    value: f.value,
    sourceText: f.sourceText,
  }));

  // Also normalize attributes as potential canonical fields
  const attributesToNormalize = extraction.attributes.map(a => ({
    label: a.key,
    value: a.value,
    sourceText: a.sourceText,
  }));

  // Combine and normalize
  const allFields = [...fieldsToNormalize, ...attributesToNormalize];
  const normalized = normalizeExtractedFields(allFields, targetType);

  // Enrich with category and human-readable label
  return normalized.map(field => ({
    ...field,
    category: getCategoryFromPath(field.fieldPath),
    label: getFieldLabel(field.fieldPath, targetType),
  }));
}

/**
 * POST /api/intelligence-extract
 * Process a document and extract intelligence with normalization
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let documentId: string | undefined;
    let projectId: string | undefined;
    let clientId: string | undefined;
    let documentContent: string = '';
    let documentName: string = 'Unknown';
    let documentType: string = 'Document';
    let documentCategory: string = 'Uncategorized';

    // Handle JSON body (from filing pipeline)
    if (contentType.includes('application/json')) {
      const body = await request.json();
      documentId = body.documentId;
      projectId = body.projectId;
      clientId = body.clientId;
      documentContent = body.documentContent || '';
      documentName = body.documentName || 'Unknown';
      documentType = body.documentType || 'Document';
      documentCategory = body.documentCategory || 'Uncategorized';
    }
    // Handle FormData (from UI)
    else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();

      clientId = formData.get('clientId') as string | null || undefined;
      projectId = formData.get('projectId') as string | null || undefined;
      documentId = formData.get('documentId') as string | null || undefined;
      const inputMode = formData.get('inputMode') as string;
      const textInput = formData.get('textInput') as string | null;
      const file = formData.get('file') as File | null;

      if (inputMode === 'text') {
        documentContent = textInput || '';
        documentType = 'Text Input';
        documentCategory = 'Meeting Notes / Manual Entry';
      } else if (inputMode === 'document' && file) {
        documentContent = await file.text();
        documentName = file.name;
      }
    }

    if (!documentContent || documentContent.trim().length === 0) {
      return NextResponse.json(
        { error: 'Document content is required' },
        { status: 400 }
      );
    }

    if (!clientId && !projectId) {
      return NextResponse.json(
        { error: 'Either clientId or projectId is required' },
        { status: 400 }
      );
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }

    const client = await getAuthenticatedConvexClient();

    // Determine target type
    const targetType: 'project' | 'client' = projectId ? 'project' : 'client';

    // Determine if this is text input mode (more flexible extraction)
    const isTextInput = documentType === 'Text Input' || documentCategory === 'Meeting Notes / Manual Entry';

    // Get field hints based on document category
    const fieldHints = getFieldHintsForDocument(documentCategory);

    console.log(`[Intelligence Extraction] Starting extraction for ${documentName} (${targetType}, textMode=${isTextInput}, hints=${fieldHints.length})`);

    // Run extraction with field hints (V4: uses Anthropic Claude)
    const extraction = await runIntelligenceExtraction(
      documentContent,
      documentType,
      documentCategory,
      targetType,
      anthropicApiKey,
      isTextInput,
      fieldHints
    );

    console.log(`[Intelligence Extraction] Extracted ${extraction.fields.length} fields, ${extraction.attributes.length} attributes`);

    // Normalize extracted fields to canonical paths
    const normalizedFields = normalizeAndEnrichFields(extraction, targetType);

    // Log normalization results
    const canonicalCount = normalizedFields.filter(f => f.isCanonical).length;
    const customCount = normalizedFields.filter(f => !f.isCanonical).length;
    console.log(`[Intelligence Extraction] Normalized: ${canonicalCount} canonical, ${customCount} custom fields`);

    // If we have a documentId, use the new merge function with evidence tracking
    if (documentId) {
      // Convert normalized fields back to extraction format for the merge function
      const mergeFields = normalizedFields.map(f => ({
        fieldPath: f.fieldPath,
        value: f.value,
        confidence: f.confidence,
        sourceText: f.sourceText,
      }));

      // @ts-ignore - Convex type instantiation is excessively deep
      const mergeResult = await client.mutation(api.intelligence.mergeExtractedIntelligence, {
        projectId: projectId ? (projectId as Id<"projects">) : undefined,
        clientId: clientId ? (clientId as Id<"clients">) : undefined,
        documentId: documentId as Id<"documents">,
        documentName: documentName,
        extractedFields: mergeFields,
        extractedAttributes: [], // Attributes are now normalized into fields
        aiInsights: extraction.insights,
      });

      console.log('[Intelligence Extraction] Merge result:', mergeResult);

      // Also write to new knowledgeItems table (Sprint 3)
      if (normalizedFields.length > 0) {
        const knowledgeItems = normalizedFields.map(f => ({
          fieldPath: f.fieldPath,
          isCanonical: f.isCanonical,
          category: f.category,
          label: f.label,
          value: f.value,
          valueType: inferValueType(f.fieldPath, f.value, targetType) as
            'string' | 'number' | 'currency' | 'date' | 'percentage' | 'array' | 'text' | 'boolean',
          sourceType: 'ai_extraction' as const,
          sourceDocumentId: documentId as Id<"documents">,
          sourceDocumentName: documentName,
          sourceText: f.sourceText,
          originalLabel: f.originalLabel,
          matchedAlias: f.matchedAlias,
          normalizationConfidence: f.confidence,
        }));

        try {
          const knowledgeResult = await client.mutation(api.knowledgeLibrary.bulkAddKnowledgeItems, {
            clientId: clientId ? (clientId as Id<"clients">) : undefined,
            projectId: projectId ? (projectId as Id<"projects">) : undefined,
            items: knowledgeItems,
            addedBy: 'ai-extraction',
          });
          console.log('[Intelligence Extraction] Knowledge items result:', knowledgeResult);
        } catch (knowledgeError) {
          // Log but don't fail - legacy intelligence was already saved
          console.error('[Intelligence Extraction] Failed to save knowledge items:', knowledgeError);
        }
      }

      return NextResponse.json({
        success: true,
        extraction: {
          fieldsExtracted: normalizedFields.length,
          canonicalFields: canonicalCount,
          customFields: customCount,
          keyFindings: extraction.insights.keyFindings?.length || 0,
          risksIdentified: extraction.insights.risks?.length || 0,
        },
        merge: mergeResult,
        fields: normalizedFields,
        insights: extraction.insights,
      });
    }

    // Legacy mode: use old update functions (for manual extraction without document)
    // If no fields were extracted, provide helpful feedback
    if (normalizedFields.length === 0) {
      // Still save any insights if we have them
      const hasInsights = (extraction.insights.keyFindings?.length || 0) + (extraction.insights.risks?.length || 0) > 0;

      if (hasInsights) {
        // Save just the insights
        if (clientId) {
          await client.mutation(api.intelligence.updateClientIntelligence, {
            clientId: clientId as Id<"clients">,
            updatedBy: 'ai-extraction',
            aiSummary: {
              keyFacts: extraction.insights.keyFindings || [],
            },
          });
        }
        if (projectId) {
          await client.mutation(api.intelligence.updateProjectIntelligence, {
            projectId: projectId as Id<"projects">,
            updatedBy: 'ai-extraction',
            aiSummary: {
              keyFacts: extraction.insights.keyFindings || [],
              risks: (extraction.insights.risks || []).map(r => r.risk),
            },
          });
        }
      }

      return NextResponse.json({
        success: true,
        fieldsUpdated: [],
        extraction: {
          fieldsExtracted: 0,
          canonicalFields: 0,
          customFields: 0,
          keyFindings: extraction.insights.keyFindings?.length || 0,
          risksIdentified: extraction.insights.risks?.length || 0,
        },
        fields: [],
        insights: extraction.insights,
        message: hasInsights
          ? 'No structured data extracted, but saved key findings and insights.'
          : 'No extractable data found. Try including specific details like names, addresses, financial figures, or dates.',
      });
    }

    // Build legacy update from normalized fields
    if (clientId) {
      const updateData: any = {
        clientId: clientId as Id<"clients">,
        updatedBy: 'ai-extraction',
      };

      // Group fields by category (first part of path)
      const sections: Record<string, Record<string, any>> = {};
      for (const field of normalizedFields) {
        const parts = field.fieldPath.split('.');
        if (parts.length >= 2) {
          const section = parts[0];
          const key = parts.slice(1).join('.');
          if (!sections[section]) sections[section] = {};
          sections[section][key] = field.value;
        }
      }

      // Map canonical categories to legacy schema
      if (sections.contact) {
        updateData.primaryContact = {
          name: sections.contact.primaryName,
          email: sections.contact.email,
          phone: sections.contact.phone,
          role: sections.contact.role,
        };
      }
      if (sections.company) {
        updateData.identity = {
          legalName: sections.company.name,
          tradingName: sections.company.tradingName,
          companyNumber: sections.company.registrationNumber,
          vatNumber: sections.company.vatNumber,
          incorporationDate: sections.company.incorporationDate,
        };
        updateData.addresses = {
          registered: sections.company.registeredAddress,
        };
      }
      if (sections.financial) {
        updateData.borrowerProfile = {
          netWorth: sections.financial.netWorth,
          liquidAssets: sections.financial.liquidAssets,
        };
        if (sections.financial.bankName) {
          updateData.banking = { bankName: sections.financial.bankName };
        }
      }

      // Add AI summary from insights
      if (extraction.insights.keyFindings || extraction.insights.risks) {
        updateData.aiSummary = {
          keyFacts: extraction.insights.keyFindings || [],
        };
      }

      await client.mutation(api.intelligence.updateClientIntelligence, updateData);
    }

    if (projectId) {
      const updateData: any = {
        projectId: projectId as Id<"projects">,
        updatedBy: 'ai-extraction',
      };

      // Group fields by category
      const sections: Record<string, Record<string, any>> = {};
      for (const field of normalizedFields) {
        const parts = field.fieldPath.split('.');
        if (parts.length >= 2) {
          const section = parts[0];
          const key = parts.slice(1).join('.');
          if (!sections[section]) sections[section] = {};
          sections[section][key] = field.value;
        }
      }

      // Map canonical categories to legacy schema
      if (sections.overview) {
        updateData.overview = {
          projectType: sections.overview.projectType,
          assetClass: sections.overview.assetClass,
          description: sections.overview.description,
        };
        if (sections.overview.unitCount) {
          updateData.development = { totalUnits: sections.overview.unitCount };
        }
      }
      if (sections.location) {
        updateData.location = {
          siteAddress: sections.location.siteAddress,
          postcode: sections.location.postcode,
          localAuthority: sections.location.localAuthority,
        };
      }
      if (sections.financials) {
        updateData.financials = {
          purchasePrice: sections.financials.purchasePrice,
          totalDevelopmentCost: sections.financials.totalDevelopmentCost,
          grossDevelopmentValue: sections.financials.gdv,
          loanAmount: sections.financials.loanAmount,
          ltv: sections.financials.ltv,
          ltgdv: sections.financials.ltc,
          profitMargin: sections.financials.profitMargin,
        };
      }
      if (sections.timeline) {
        updateData.timeline = {
          acquisitionDate: sections.timeline.acquisitionDate,
          constructionStartDate: sections.timeline.constructionStart,
          practicalCompletionDate: sections.timeline.practicalCompletion,
        };
        if (sections.timeline.planningStatus) {
          if (!updateData.development) updateData.development = {};
          updateData.development.planningStatus = sections.timeline.planningStatus;
        }
      }

      // Add AI summary from insights
      if (extraction.insights) {
        updateData.aiSummary = {
          keyFacts: extraction.insights.keyFindings || [],
          risks: (extraction.insights.risks || []).map(r => r.risk),
        };
      }

      await client.mutation(api.intelligence.updateProjectIntelligence, updateData);
    }

    // Also write to new knowledgeItems table (Sprint 3) - legacy mode without documentId
    if (normalizedFields.length > 0) {
      const knowledgeItems = normalizedFields.map(f => ({
        fieldPath: f.fieldPath,
        isCanonical: f.isCanonical,
        category: f.category,
        label: f.label,
        value: f.value,
        valueType: inferValueType(f.fieldPath, f.value, targetType) as
          'string' | 'number' | 'currency' | 'date' | 'percentage' | 'array' | 'text' | 'boolean',
        sourceType: 'manual' as const, // No document, so manual entry
        originalLabel: f.originalLabel,
        matchedAlias: f.matchedAlias,
        normalizationConfidence: f.confidence,
      }));

      try {
        const knowledgeResult = await client.mutation(api.knowledgeLibrary.bulkAddKnowledgeItems, {
          clientId: clientId ? (clientId as Id<"clients">) : undefined,
          projectId: projectId ? (projectId as Id<"projects">) : undefined,
          items: knowledgeItems,
          addedBy: 'ai-extraction',
        });
        console.log('[Intelligence Extraction] Knowledge items result (legacy):', knowledgeResult);
      } catch (knowledgeError) {
        console.error('[Intelligence Extraction] Failed to save knowledge items (legacy):', knowledgeError);
      }
    }

    const fieldsUpdated = normalizedFields.map(f => f.fieldPath);

    return NextResponse.json({
      success: true,
      fieldsUpdated,
      extraction: {
        fieldsExtracted: normalizedFields.length,
        canonicalFields: canonicalCount,
        customFields: customCount,
        keyFindings: extraction.insights.keyFindings?.length || 0,
        risksIdentified: extraction.insights.risks?.length || 0,
      },
      fields: normalizedFields,
      insights: extraction.insights,
      summary: extraction.insights.keyFindings?.[0] || 'Intelligence extracted and normalized successfully',
    });

  } catch (error) {
    console.error('[Intelligence Extraction] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extraction failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/intelligence-extract
 * Get intelligence extraction job status
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const projectId = searchParams.get('projectId');
    const clientId = searchParams.get('clientId');
    const limit = searchParams.get('limit');

    const client = await getAuthenticatedConvexClient();

    // @ts-ignore - Convex type instantiation is excessively deep
    const jobs = await client.query(api.intelligence.listIntelligenceExtractionJobs, {
      status: status || undefined,
      projectId: projectId ? (projectId as Id<"projects">) : undefined,
      clientId: clientId ? (clientId as Id<"clients">) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('[Intelligence Extraction] Error fetching jobs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}
