import { NextRequest, NextResponse } from 'next/server';
import { TOGETHER_API_URL, MODEL_CONFIG } from '@/lib/modelConfig';

export const runtime = 'nodejs';
export const maxDuration = 60;

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o';

/**
 * DEBUG ENDPOINT: Traces the entire bulk-analyze pipeline
 *
 * This endpoint simulates the document analysis flow and logs
 * the input/output of each agent stage for debugging.
 *
 * POST /api/bulk-analyze-debug
 * Body: { mockSummary: string, mockFileName: string }
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.TOGETHER_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'TOGETHER_API_KEY not configured' }, { status: 500 });
  }

  const body = await request.json();
  const mockSummary = body.mockSummary ||
    "This document is a portfolio of project experiences by Axiom detailing their role in managing various student accommodation developments across different locations including project descriptions and methodologies, outcomes and key data.";
  const mockFileName = body.mockFileName || "Axiom_20-_20Student_Accommodation_Portfolio.pdf";
  const mockContent = body.mockContent || mockSummary; // Use summary as mock content

  const trace: any = {
    timestamp: new Date().toISOString(),
    input: { mockFileName, mockSummary },
    stages: [],
  };

  // Mock data for testing
  const FILE_TYPES = [
    'Appraisal', 'RedBook Valuation', 'Cashflow',
    'Floor Plans', 'Elevations', 'Sections', 'Site Plans', 'Location Plans',
    'Initial Monitoring Report', 'Interim Monitoring Report', 'Planning Documentation',
    'Contract Sum Analysis', 'Comparables', 'Building Survey', 'Report on Title',
    'Legal Opinion', 'Environmental Report', 'Local Authority Search',
    'Passport', 'Driving License', 'Utility Bill', 'Bank Statement',
    'Application Form', 'Assets & Liabilities Statement', 'Track Record',
    'Certificate of Incorporation', 'Company Search', 'Tax Return',
    'Indicative Terms', 'Credit Backed Terms',
    'Facility Letter', 'Personal Guarantee', 'Corporate Guarantee',
    'Terms & Conditions', 'Shareholders Agreement', 'Share Charge',
    'Debenture', 'Corporate Authorisations', 'Building Contract',
    'Professional Appointment', 'Collateral Warranty', 'Title Deed', 'Lease',
    'Accommodation Schedule', 'Build Programme',
    'Loan Statement', 'Redemption Statement', 'Completion Statement',
    'Invoice', 'Receipt', 'Insurance Policy', 'Insurance Certificate',
    'Email/Correspondence', 'Meeting Minutes', 'NHBC Warranty',
    'Latent Defects Insurance', 'Site Photographs',
    'Other',
  ];

  const CATEGORIES = [
    'Appraisals', 'Plans', 'Inspections', 'Professional Reports',
    'KYC', 'Loan Terms', 'Legal Documents', 'Project Documents',
    'Financial Documents', 'Insurance', 'Communications', 'Warranties',
    'Photographs', 'Other',
  ];

  const availableFolders = [
    { folderKey: 'background', name: 'Background', level: 'project' },
    { folderKey: 'terms_comparison', name: 'Terms Comparison', level: 'project' },
    { folderKey: 'credit_submission', name: 'Credit Submission', level: 'project' },
    { folderKey: 'appraisals', name: 'Appraisals', level: 'project' },
    { folderKey: 'operational_model', name: 'Operational Model', level: 'project' },
    { folderKey: 'kyc', name: 'KYC', level: 'client' },
    { folderKey: 'miscellaneous', name: 'Miscellaneous', level: 'client' },
  ];

  // Mock checklist items
  const checklistItems = [
    { _id: 'checklist_1', name: 'Proof of ID', category: 'KYC', status: 'missing', matchingDocumentTypes: ['Passport', 'Driving License'] },
    { _id: 'checklist_2', name: 'Track Record', category: 'KYC', status: 'missing', matchingDocumentTypes: ['Track Record', 'CV'] },
    { _id: 'checklist_3', name: 'Appraisal', category: 'Appraisals', status: 'missing', matchingDocumentTypes: ['Appraisal', 'RedBook Valuation'] },
  ];

  // ========================================
  // STAGE 1: Initial Classification Agent
  // ========================================
  const stage1SystemPrompt = `You are a document classification assistant for a real estate lending firm. Your task is to classify documents accurately.

CRITICAL INSTRUCTION - USE YOUR UNDERSTANDING:
Your summary describes what the document IS. Your fileType, category, and folder MUST align with that understanding.
- If your summary says "passport" or "biodata page" → fileType: "Passport", category: "KYC", folder: "kyc"
- If your summary says "bank statement" → fileType: "Bank Statement", category: "KYC", folder: "kyc"
- If your summary says "valuation report" → fileType: "RedBook Valuation", category: "Appraisals", folder: "appraisals"
- If your summary says "track record", "portfolio", "experience", "CV" → fileType: "Track Record", category: "KYC", folder: "kyc"
- Do NOT return "Other" if you can identify what the document is from content, filename, or context

AVAILABLE FILE TYPES (you MUST choose the most specific match):
${FILE_TYPES.join(', ')}

AVAILABLE CATEGORIES (you MUST choose one):
${CATEGORIES.join(', ')}

AVAILABLE FOLDERS (you MUST choose from this list):
${availableFolders.map(f => `- ${f.folderKey}: "${f.name}" (${f.level} level)`).join('\n')}

CHECKLIST ITEMS TO CONSIDER:
${checklistItems.map(c => `- [${c._id}] ${c.name} (${c.category}) - Matches: ${c.matchingDocumentTypes?.join(', ')}`).join('\n')}

Respond in JSON format only:
{
  "summary": "Brief 2-3 sentence summary of what this document contains - BE SPECIFIC about document type",
  "fileType": "MUST match what you identified in your summary",
  "category": "MUST be one of the available categories",
  "suggestedFolder": "MUST be one of the available folder keys",
  "confidence": 0.85,
  "suggestedChecklistItems": [
    { "itemId": "checklist_id", "confidence": 0.8, "reasoning": "why this matches" }
  ]
}`;

  const stage1UserPrompt = `Analyze this document and classify it.

File name: ${mockFileName}

Document content:
${mockContent}`;

  trace.stages.push({
    stage: 1,
    name: 'Initial Classification Agent',
    model: MODEL_CONFIG.analysis.model,
    input: {
      systemPrompt: stage1SystemPrompt,
      userPrompt: stage1UserPrompt,
      systemPromptLength: stage1SystemPrompt.length,
      userPromptLength: stage1UserPrompt.length,
    },
    output: null,
    error: null,
  });

  let stage1Result: any = null;
  try {
    const response1 = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_CONFIG.analysis.model,
        messages: [
          { role: 'system', content: stage1SystemPrompt },
          { role: 'user', content: stage1UserPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    const data1 = await response1.json();
    const content1 = data1.choices?.[0]?.message?.content;

    // Parse JSON from response
    let parsed1 = null;
    if (content1) {
      let jsonContent = content1.trim();
      if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
      }
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed1 = JSON.parse(jsonMatch[0]);
      }
    }

    stage1Result = {
      rawResponse: content1,
      parsed: parsed1,
      fileTypeInList: parsed1?.fileType ? FILE_TYPES.includes(parsed1.fileType) : false,
      categoryInList: parsed1?.category ? CATEGORIES.includes(parsed1.category) : false,
    };

    trace.stages[0].output = stage1Result;
  } catch (error: any) {
    trace.stages[0].error = error.message;
  }

  // ========================================
  // STAGE 2: Validation & Mapping
  // ========================================
  let validatedResult: any = null;
  if (stage1Result?.parsed) {
    const aiType = stage1Result.parsed.fileType || 'Other';
    const aiCategory = stage1Result.parsed.category || 'Other';

    // Check if types are in list
    const typeInList = FILE_TYPES.includes(aiType);
    const categoryInList = CATEGORIES.includes(aiCategory);

    // Simple fallback matching (current logic)
    let finalType = aiType;
    let finalCategory = aiCategory;

    if (!typeInList) {
      const typeLower = aiType.toLowerCase();
      const match = FILE_TYPES.find(t =>
        typeLower.includes(t.toLowerCase()) || t.toLowerCase().includes(typeLower)
      );
      finalType = match || 'Other';
    }

    if (!categoryInList) {
      const catLower = aiCategory.toLowerCase();
      const match = CATEGORIES.find(c =>
        catLower.includes(c.toLowerCase()) || c.toLowerCase().includes(catLower)
      );
      finalCategory = match || 'Other';
    }

    validatedResult = {
      aiReturnedType: aiType,
      aiReturnedCategory: aiCategory,
      typeWasInList: typeInList,
      categoryWasInList: categoryInList,
      afterValidation: {
        fileType: finalType,
        category: finalCategory,
        wasChanged: finalType !== aiType || finalCategory !== aiCategory,
      },
    };

    trace.stages.push({
      stage: 2,
      name: 'Validation & Mapping',
      input: {
        aiReturnedType: aiType,
        aiReturnedCategory: aiCategory,
        availableTypes: FILE_TYPES.length,
        availableCategories: CATEGORIES.length,
      },
      output: validatedResult,
      analysis: {
        problem: !typeInList ? `AI returned "${aiType}" which is NOT in FILE_TYPES list` : null,
        mappedTo: !typeInList ? finalType : null,
        lostInformation: !typeInList && finalType === 'Other' ?
          `AI understood document as "${aiType}" but we lost this because it's not in our list` : null,
      },
    });
  }

  // ========================================
  // STAGE 3: Critic Agent
  // ========================================
  if (openaiApiKey && stage1Result?.parsed) {
    const criticInput = {
      fileName: mockFileName,
      summary: stage1Result.parsed.summary,
      initialClassification: {
        fileType: validatedResult?.afterValidation?.fileType || 'Other',
        category: validatedResult?.afterValidation?.category || 'Other',
        suggestedFolder: stage1Result.parsed.suggestedFolder || 'miscellaneous',
        confidence: stage1Result.parsed.confidence || 0.5,
      },
      filenameHint: null, // Would be populated from filename analysis
      checklistMatches: stage1Result.parsed.suggestedChecklistItems || [],
    };

    const criticPrompt = `You are the FINAL DECISION MAKER for document classification. Review all signals and make a coherent, reasoned final decision.

## INPUT DATA

**Filename:** ${criticInput.fileName}

**Summary from Analysis:**
${criticInput.summary}

**Initial Classification:**
- File Type: ${criticInput.initialClassification.fileType}
- Category: ${criticInput.initialClassification.category}
- Folder: ${criticInput.initialClassification.suggestedFolder}
- Confidence: ${(criticInput.initialClassification.confidence * 100).toFixed(0)}%

**Current Checklist Matches:**
${criticInput.checklistMatches.length > 0
  ? criticInput.checklistMatches.map((m: any) => `- ${m.itemId} (${(m.confidence * 100).toFixed(0)}%): ${m.reasoning || 'No reason'}`).join('\n')
  : 'No matches suggested'}

**Available File Types:** ${FILE_TYPES.slice(0, 30).join(', ')}...

**Available Checklist Items:**
${checklistItems.map(i => `- [${i._id}] ${i.name} (${i.category}) - Matches: ${i.matchingDocumentTypes?.join(', ')}`).join('\n')}

## YOUR TASK

1. **CONSISTENCY CHECK**: Does the summary describe a document type that differs from the initial classification?
   - If summary mentions "portfolio", "project experience", "track record", "CV" → fileType should be "Track Record"

2. **FIX "Other" CLASSIFICATIONS**: If initial classification is "Other" but the summary clearly identifies a document type, CORRECT IT.

Respond with ONLY a JSON object:
{
  "fileType": "Final file type",
  "category": "Final category",
  "suggestedFolder": "folder_key",
  "confidence": 0.85,
  "reasoning": "2-3 sentence explanation",
  "checklistMatches": [
    { "itemId": "exact_id", "confidence": 0.90, "reasoning": "Why this matches" }
  ]
}`;

    trace.stages.push({
      stage: 3,
      name: 'Critic Agent',
      model: OPENAI_MODEL,
      input: {
        criticInput: criticInput,
        promptLength: criticPrompt.length,
        summaryPassedToCritic: criticInput.summary,
        classificationPassedToCritic: criticInput.initialClassification,
        issue: criticInput.initialClassification.fileType === 'Other' ?
          'Critic received "Other" - summary may have been ignored in classification' : null,
      },
      output: null,
      error: null,
    });

    try {
      const response3 = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [{ role: 'user', content: criticPrompt }],
          temperature: 0.2,
          max_tokens: 500,
        }),
      });

      const data3 = await response3.json();
      const content3 = data3.choices?.[0]?.message?.content;

      let parsed3 = null;
      if (content3) {
        let jsonContent = content3.trim();
        if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
        }
        const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed3 = JSON.parse(jsonMatch[0]);
        }
      }

      trace.stages[2].output = {
        rawResponse: content3,
        parsed: parsed3,
        criticDecision: parsed3 ? {
          fileType: parsed3.fileType,
          category: parsed3.category,
          reasoning: parsed3.reasoning,
          didCriticFixIt: parsed3.fileType !== criticInput.initialClassification.fileType,
        } : null,
      };
    } catch (error: any) {
      trace.stages[2].error = error.message;
    }
  }

  // ========================================
  // ANALYSIS: Identify the Problem
  // ========================================
  const analysis: any = {
    dataFlowIssues: [],
    recommendations: [],
  };

  // Check if summary was useful but classification failed
  if (stage1Result?.parsed?.summary && validatedResult?.afterValidation?.fileType === 'Other') {
    analysis.dataFlowIssues.push({
      issue: 'Summary generated correctly but classification defaulted to Other',
      summary: stage1Result.parsed.summary,
      aiTriedToReturn: stage1Result.parsed.fileType,
      butItWasntInList: !stage1Result.fileTypeInList,
      recommendation: `Add "${stage1Result.parsed.fileType}" to FILE_TYPES list or improve semantic matching`,
    });
  }

  // Check if critic received degraded data
  if (trace.stages[2]?.input?.classificationPassedToCritic?.fileType === 'Other') {
    analysis.dataFlowIssues.push({
      issue: 'Critic Agent received "Other" instead of AI\'s original classification',
      originalAiClassification: stage1Result?.parsed?.fileType,
      whatCriticReceived: 'Other',
      informationLost: true,
      recommendation: 'Pass original AI response to Critic before validation, let Critic decide',
    });
  }

  trace.analysis = analysis;

  return NextResponse.json(trace, { status: 200 });
}
