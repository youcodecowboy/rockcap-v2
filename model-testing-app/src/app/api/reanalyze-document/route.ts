/**
 * @deprecated This route uses the V3 Together.ai pipeline.
 * FileDetailPanel now uses /api/v4-analyze instead.
 * No active callers remain — safe to remove in next cleanup pass.
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile } from '@/lib/fileProcessor';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { TOGETHER_API_URL, MODEL_CONFIG } from '@/lib/modelConfig';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Retry configuration for transient API errors
const RETRY_CONFIG = {
  maxRetries: 5,
  initialDelayMs: 1500,
  maxDelayMs: 15000,
  retryableStatuses: [429, 500, 502, 503, 504],
  jitterMs: 500,
};

// Helper function to retry API calls with exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  context: string
): Promise<Response> {
  let lastError: Error | null = null;
  let delay = RETRY_CONFIG.initialDelayMs;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok) {
        return response;
      }

      if (RETRY_CONFIG.retryableStatuses.includes(response.status)) {
        if (attempt < RETRY_CONFIG.maxRetries) {
          const jitter = Math.random() * RETRY_CONFIG.jitterMs;
          const actualDelay = delay + jitter;
          console.warn(
            `[${context}] API returned ${response.status}, retrying in ${Math.round(actualDelay)}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`
          );
          await new Promise(resolve => setTimeout(resolve, actualDelay));
          delay = Math.min(delay * 2, RETRY_CONFIG.maxDelayMs);
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < RETRY_CONFIG.maxRetries) {
        const jitter = Math.random() * RETRY_CONFIG.jitterMs;
        const actualDelay = delay + jitter;
        console.warn(
          `[${context}] Network error: ${lastError.message}, retrying in ${Math.round(actualDelay)}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`
        );
        await new Promise(resolve => setTimeout(resolve, actualDelay));
        delay = Math.min(delay * 2, RETRY_CONFIG.maxDelayMs);
      }
    }
  }

  throw lastError || new Error(`[${context}] All retry attempts failed`);
}

// DocumentSummary interface matching the bulk-analyze route
interface DocumentSummary {
  documentDescription: string;
  documentPurpose: string;
  entities: {
    people: string[];
    companies: string[];
    locations: string[];
    projects: string[];
  };
  keyTerms: string[];
  keyDates: string[];
  keyAmounts: string[];
  executiveSummary: string;
  detailedSummary: string;
  sectionBreakdown?: string[];
  documentCharacteristics: {
    isFinancial: boolean;
    isLegal: boolean;
    isIdentity: boolean;
    isReport: boolean;
    isDesign: boolean;
    isCorrespondence: boolean;
    hasMultipleProjects: boolean;
    isInternal: boolean;
  };
  rawContentType: string;
  confidenceInAnalysis: number;
}

async function runSummaryAgent(
  textContent: string,
  fileName: string,
  apiKey: string
): Promise<DocumentSummary> {
  const maxContentLength = 40000;
  const truncatedContent = textContent.slice(0, maxContentLength);

  const summaryPrompt = `You are a document analysis specialist. Your ONLY job is to ANALYZE and SUMMARIZE this document.
You must NOT classify or categorize - just extract information and describe what you see.

## DOCUMENT TO ANALYZE

**Filename:** ${fileName}

**Content:**
${truncatedContent}${textContent.length > maxContentLength ? '\n\n[Content truncated for analysis...]' : ''}

## YOUR TASK

Analyze this document thoroughly and extract all relevant information. Focus on UNDERSTANDING the document, not categorizing it.

Answer these questions in your analysis:
1. **WHAT** is this document? Describe it in your own words.
2. **WHO** is involved? Extract all names (people, companies, organizations).
3. **WHERE** is mentioned? Extract locations, addresses, properties.
4. **WHAT PROJECT(S)** are discussed? Extract project names.
5. **WHAT ARE THE KEY TERMS** used? (technical terms, industry jargon, important concepts)
6. **WHAT KEY DATES** are mentioned? ALWAYS include context for each date (e.g., "Report Date: Jan 2024", "Completion Date: Q4 2025", "Valuation Date: 15 March 2024")
7. **WHAT FINANCIAL FIGURES** or measurements are present? ALWAYS include context for each amount (e.g., "GDV: £5.2m", "Loan Amount: £3m", "Site Area: 2.5 acres")
8. **WHAT IS THE PURPOSE** of this document? Why does it exist?
9. **WHAT CHARACTERISTICS** does it have? (is it financial? legal? design? etc.)

## RESPONSE FORMAT

Respond with ONLY a JSON object:
{
  "documentDescription": "What this document IS in plain language (e.g., 'a design presentation for a residential development project')",
  "documentPurpose": "What this document is FOR (e.g., 'to present the architectural scheme to potential investors')",
  "entities": {
    "people": ["Name 1", "Name 2"],
    "companies": ["Company A", "Company B"],
    "locations": ["123 Main St, London", "Manchester"],
    "projects": ["Woodside Lofts", "Project X"]
  },
  "keyTerms": ["PBSA", "co-living", "GDV", "planning permission"],
  "keyDates": ["Report Date: March 2024", "Practical Completion: Q4 2025", "Planning Granted: Jan 2023"],
  "keyAmounts": ["GDV: £12.5m", "Loan Amount: £8m", "Total Units: 150", "Site Area: 45,000 sqft"],
  "executiveSummary": "2-3 sentence high-level summary of the document",
  "detailedSummary": "A full paragraph providing comprehensive summary of the document contents",
  "sectionBreakdown": ["Section 1: Introduction", "Section 2: Design Concept"],
  "documentCharacteristics": {
    "isFinancial": false,
    "isLegal": false,
    "isIdentity": false,
    "isReport": false,
    "isDesign": true,
    "isCorrespondence": false,
    "hasMultipleProjects": false,
    "isInternal": false
  },
  "rawContentType": "Your best description of the document type without using our taxonomy",
  "confidenceInAnalysis": 0.85
}

IMPORTANT:
- Be THOROUGH in extraction - capture all relevant information
- For rawContentType, use YOUR OWN WORDS to describe what this is (e.g., "developer portfolio showing past project experience", "passport biodata page", "building valuation report")
- If you're unsure about something, still include it with lower confidence
- Don't leave arrays empty if there IS relevant content - extract what you can`;

  const response = await fetchWithRetry(
    TOGETHER_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_CONFIG.analysis.model,
        messages: [{ role: 'user', content: summaryPrompt }],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    },
    'Summary Agent'
  );

  if (!response.ok) {
    throw new Error(`Summary Agent API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (content) {
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    }

    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        documentDescription: parsed.documentDescription || 'Unable to determine',
        documentPurpose: parsed.documentPurpose || 'Unable to determine',
        entities: {
          people: Array.isArray(parsed.entities?.people) ? parsed.entities.people : [],
          companies: Array.isArray(parsed.entities?.companies) ? parsed.entities.companies : [],
          locations: Array.isArray(parsed.entities?.locations) ? parsed.entities.locations : [],
          projects: Array.isArray(parsed.entities?.projects) ? parsed.entities.projects : [],
        },
        keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : [],
        keyDates: Array.isArray(parsed.keyDates) ? parsed.keyDates : [],
        keyAmounts: Array.isArray(parsed.keyAmounts) ? parsed.keyAmounts : [],
        executiveSummary: parsed.executiveSummary || 'No summary available',
        detailedSummary: parsed.detailedSummary || 'No detailed summary available',
        sectionBreakdown: Array.isArray(parsed.sectionBreakdown) ? parsed.sectionBreakdown : undefined,
        documentCharacteristics: {
          isFinancial: !!parsed.documentCharacteristics?.isFinancial,
          isLegal: !!parsed.documentCharacteristics?.isLegal,
          isIdentity: !!parsed.documentCharacteristics?.isIdentity,
          isReport: !!parsed.documentCharacteristics?.isReport,
          isDesign: !!parsed.documentCharacteristics?.isDesign,
          isCorrespondence: !!parsed.documentCharacteristics?.isCorrespondence,
          hasMultipleProjects: !!parsed.documentCharacteristics?.hasMultipleProjects,
          isInternal: !!parsed.documentCharacteristics?.isInternal,
        },
        rawContentType: parsed.rawContentType || 'Unknown document type',
        confidenceInAnalysis: typeof parsed.confidenceInAnalysis === 'number' ? parsed.confidenceInAnalysis : 0.5,
      };
    }
  }

  throw new Error('Failed to parse Summary Agent response');
}

export async function POST(request: NextRequest) {
  console.warn('[DEPRECATED] /api/reanalyze-document is deprecated. Use /api/v4-analyze instead.');

  try {
    // Authenticate
    const convex = await getAuthenticatedConvexClient();
    await requireAuth(convex);

    // Get API key
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // Parse request
    const body = await request.json();
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json(
        { error: 'documentId is required' },
        { status: 400 }
      );
    }

    // Get the document
    // @ts-ignore - Convex type inference issue
    const document = await convex.query(api.documents.get, {
      id: documentId as Id<"documents">
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    if (!document.fileStorageId) {
      return NextResponse.json(
        { error: 'Document has no file attached' },
        { status: 400 }
      );
    }

    // Get the file URL
    // @ts-ignore - Convex type inference issue
    const fileUrl = await convex.query(api.documents.getFileUrl, {
      storageId: document.fileStorageId
    });

    if (!fileUrl) {
      return NextResponse.json(
        { error: 'Could not retrieve file URL' },
        { status: 500 }
      );
    }

    // Fetch the file content
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      return NextResponse.json(
        { error: 'Could not download file' },
        { status: 500 }
      );
    }

    // Convert to File object for text extraction
    const blob = await fileResponse.blob();
    const file = new File([blob], document.fileName, { type: document.fileType });

    // Extract text from file
    let textContent: string;
    try {
      textContent = await extractTextFromFile(file);
    } catch (extractError) {
      console.error('Text extraction error:', extractError);
      return NextResponse.json(
        { error: 'Could not extract text from file. The file may be corrupted or in an unsupported format.' },
        { status: 400 }
      );
    }

    if (!textContent || textContent.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text content could be extracted from this document' },
        { status: 400 }
      );
    }

    // Run the summary agent
    const documentAnalysis = await runSummaryAgent(textContent, document.fileName, apiKey);

    // Update the document with the analysis
    // @ts-ignore - Convex type inference issue
    await convex.mutation(api.documents.update, {
      id: documentId as Id<"documents">,
      documentAnalysis,
      summary: documentAnalysis.executiveSummary,
    });

    return NextResponse.json({
      success: true,
      documentAnalysis,
    });

  } catch (error) {
    console.error('Reanalyze error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
