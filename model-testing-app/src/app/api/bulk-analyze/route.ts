import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromFile, validateFile } from '@/lib/fileProcessor';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { ErrorResponses } from '@/lib/api/errorResponse';
import { TOGETHER_API_URL, MODEL_CONFIG } from '@/lib/modelConfig';
import { getTypeAbbreviation } from '@/lib/documentNaming';
import { api } from '../../../../convex/_generated/api';

export const runtime = 'nodejs';
export const maxDuration = 30; // 30 seconds max - faster than full analysis

// Simplified analysis result for bulk uploads
interface BulkAnalysisResult {
  summary: string;
  fileType: string;
  category: string;
  confidence: number;
  suggestedFolder: string;
  targetLevel?: 'client' | 'project';
}

// Category to folder mapping
const CATEGORY_TO_FOLDER: Record<string, string> = {
  "appraisal": "appraisals",
  "valuation": "appraisals",
  "term sheet": "terms_comparison",
  "loan terms": "terms_comparison",
  "credit": "credit_submission",
  "operating": "operational_model",
  "financial model": "operational_model",
  "note": "notes",
  "memo": "notes",
  "kyc": "kyc",
  "background": "background",
  "contract": "background",
  "agreement": "background",
};

function getSuggestedFolder(category: string): string {
  const categoryLower = category.toLowerCase();
  
  for (const [key, folder] of Object.entries(CATEGORY_TO_FOLDER)) {
    if (categoryLower.includes(key)) {
      return folder;
    }
  }
  
  return "miscellaneous";
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const client = await getAuthenticatedConvexClient();
    try {
      await requireAuth(client);
    } catch (authError) {
      return ErrorResponses.unauthenticated();
    }

    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      return ErrorResponses.internalError('TOGETHER_API_KEY not configured');
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const instructions = formData.get('instructions') as string | null;
    const clientType = (formData.get('clientType') as string | null) || 'borrower';

    if (!file) {
      return ErrorResponses.badRequest('No file provided');
    }

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return ErrorResponses.badRequest(validation.error || 'Invalid file');
    }

    // Check if it's an image file - can't extract text from images without OCR
    const isImageFile = file.type.startsWith('image/');
    if (isImageFile) {
      // Return a default classification for images
      const typeAbbreviation = getTypeAbbreviation('Other');
      return NextResponse.json({
        success: true,
        result: {
          summary: `Image file: ${file.name}`,
          fileType: 'Image',
          documentType: 'Image',
          category: 'Other',
          confidence: 0.5,
          suggestedFolder: 'miscellaneous',
          targetLevel: 'project' as const,
          typeAbbreviation,
          originalFileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
      });
    }

    // Extract text from file
    let textContent: string;
    try {
      textContent = await extractTextFromFile(file);
      if (!textContent || textContent.trim().length === 0) {
        return ErrorResponses.badRequest('File appears to be empty or could not extract text');
      }
    } catch (error) {
      return ErrorResponses.badRequest(
        error instanceof Error ? error.message : 'Failed to extract text from file'
      );
    }

    // Truncate text to save tokens - we only need enough for summary
    const maxTextLength = 8000; // ~2000 tokens
    const truncatedText = textContent.length > maxTextLength 
      ? textContent.slice(0, maxTextLength) + '\n\n[Content truncated for analysis...]'
      : textContent;

    // Valid options for the AI to choose from
    const FILE_TYPES = [
      'Red Book Valuation',
      'RICS Valuation', 
      'Term Sheet',
      'Credit Memo',
      'Operating Statement',
      'Financial Model',
      'Contract',
      'Agreement',
      'Invoice',
      'Correspondence',
      'KYC Document',
      'Note',
      'Report',
      'Other',
    ];

    const CATEGORIES = [
      'Appraisals',
      'Terms',
      'Credit',
      'Financial',
      'Legal',
      'Correspondence',
      'KYC',
      'Notes',
      'Other',
    ];

    const PROJECT_FOLDERS = [
      'background',
      'terms_comparison',
      'terms_request',
      'credit_submission',
      'post_completion',
      'appraisals',
      'notes',
      'operational_model',
    ];

    const CLIENT_FOLDERS = [
      'kyc',
      'background_docs',
      'miscellaneous',
    ];

    // Build the prompt for summary-only analysis
    const systemPrompt = `You are a document classification assistant for a real estate lending firm. Your task is to classify documents accurately.

AVAILABLE FILE TYPES (you MUST choose one):
${FILE_TYPES.join(', ')}

AVAILABLE CATEGORIES (you MUST choose one):
${CATEGORIES.join(', ')}

AVAILABLE PROJECT FOLDERS (choose the best fit):
${PROJECT_FOLDERS.join(', ')}

AVAILABLE CLIENT FOLDERS (use if no project):
${CLIENT_FOLDERS.join(', ')}

FOLDER MAPPING GUIDANCE:
- Valuations/Appraisals → "appraisals"
- Term Sheets/Loan Terms → "terms_comparison" or "terms_request"
- Credit documents → "credit_submission"
- Operating statements/Financial models → "operational_model"
- Notes/Memos → "notes"
- KYC/Identity docs → "kyc"
- Contracts/Legal → "background" or "background_docs"
- Post-completion items → "post_completion"
- Unknown/Other → "miscellaneous"

Respond in JSON format only:
{
  "summary": "Brief 2-3 sentence summary of what this document contains",
  "fileType": "MUST be one of the available file types listed above",
  "category": "MUST be one of the available categories listed above",
  "suggestedFolder": "MUST be one of the available folders listed above",
  "confidence": 0.85
}`;

    const userPrompt = `Analyze this document and classify it.

File name: ${file.name}
${instructions ? `\nAdditional context from user: ${instructions}` : ''}

Document content:
${truncatedText}`;

    // Call Together AI using the standard fetch pattern
    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_CONFIG.analysis.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Bulk Analyze] API error:', errorText);
      return ErrorResponses.internalError(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      return ErrorResponses.internalError('No response from AI');
    }

    // Parse the JSON response
    let analysisResult: BulkAnalysisResult;
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonContent = content.trim();
      if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
      }
      
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate fileType against our list (use closest match or default)
      let detectedType = parsed.fileType || 'Other';
      if (!FILE_TYPES.includes(detectedType)) {
        // Try to find a close match
        const typeLower = detectedType.toLowerCase();
        const match = FILE_TYPES.find(t => 
          typeLower.includes(t.toLowerCase()) || t.toLowerCase().includes(typeLower)
        );
        detectedType = match || 'Other';
      }

      // Validate category against our list
      let detectedCategory = parsed.category || 'Other';
      if (!CATEGORIES.includes(detectedCategory)) {
        const catLower = detectedCategory.toLowerCase();
        const match = CATEGORIES.find(c => 
          catLower.includes(c.toLowerCase()) || c.toLowerCase().includes(catLower)
        );
        detectedCategory = match || 'Other';
      }

      // Use AI's folder suggestion if valid, otherwise derive from category
      const allFolders = [...PROJECT_FOLDERS, ...CLIENT_FOLDERS];
      let folder = parsed.suggestedFolder || '';
      let targetLevel: 'client' | 'project' = 'project'; // default
      
      if (!allFolders.includes(folder)) {
        folder = getSuggestedFolder(detectedCategory);
      }
      
      analysisResult = {
        summary: parsed.summary || 'No summary available',
        fileType: detectedType,
        category: detectedCategory,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        suggestedFolder: folder,
        targetLevel,
      };
    } catch (parseError) {
      console.error('[Bulk Analyze] Failed to parse AI response:', content);
      // Fallback response
      analysisResult = {
        summary: 'Unable to analyze document content.',
        fileType: 'Other',
        category: 'Other',
        confidence: 0.3,
        suggestedFolder: 'miscellaneous',
        targetLevel: 'client',
      };
    }

    // Try to look up placement rule from database for better folder suggestion
    try {
      const placementRule = await client.query(api.placementRules.findPlacementRule, {
        clientType: clientType.toLowerCase(),
        documentType: analysisResult.fileType,
        category: analysisResult.category,
      });
      
      if (placementRule) {
        analysisResult.suggestedFolder = placementRule.targetFolderKey;
        analysisResult.targetLevel = placementRule.targetLevel;
      }
    } catch (error) {
      // If placement rule lookup fails, use the AI-suggested folder
      console.warn('[Bulk Analyze] Failed to lookup placement rule:', error);
    }

    // Get type abbreviation for document naming
    const typeAbbreviation = getTypeAbbreviation(analysisResult.category);

    return NextResponse.json({
      success: true,
      result: {
        ...analysisResult,
        typeAbbreviation,
        originalFileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      },
    });
  } catch (error) {
    console.error('[Bulk Analyze] Error:', error);
    return ErrorResponses.internalError(
      error instanceof Error ? error.message : 'Analysis failed'
    );
  }
}
