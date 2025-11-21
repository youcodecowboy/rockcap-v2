import { ModelResponse } from '@/types';
import { FILE_CATEGORIES } from './categories';
import { getRelevantFileTypeHints } from './fileTypeDefinitions';

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const MODEL_NAME = 'openai/gpt-oss-20b'; // GPT-OSS-20B via Together.ai

interface ClientWithProjects {
  id: string;
  name: string;
  projects: Array<{ id: string; name: string }>;
}

export async function analyzeFileContent(
  textContent: string,
  fileName: string,
  clientsWithProjects: ClientWithProjects[],
  customInstructions: string | null = null
): Promise<ModelResponse & { tokensUsed: number }> {
  const apiKey = process.env.TOGETHER_API_KEY;
  
  if (!apiKey) {
    throw new Error('TOGETHER_API_KEY environment variable is not set');
  }

  const startTime = Date.now();

  // Build client and project list for prompt
  const clientProjectList = clientsWithProjects.map(client => {
    const projects = client.projects.length > 0 
      ? ` (Projects: ${client.projects.map(p => p.name).join(', ')})`
      : '';
    return `${client.name}${projects}`;
  }).join('\n') || 'None available';

  const categoriesList = FILE_CATEGORIES.join(', ');

  // Get relevant file type hints based on content and filename
  const fileTypeHints = getRelevantFileTypeHints(textContent, fileName);
  const fileTypeGuidance = fileTypeHints.length > 0
    ? `\n\nFILE TYPE GUIDANCE (CRITICAL - USE THESE IF CONTENT MATCHES):\nThe following file types are DEFINITELY relevant based on the content and filename:\n\n${fileTypeHints.join('\n\n')}\n\nCRITICAL INSTRUCTIONS:\n- If the content matches ANY of the file types above, you MUST use that exact file type name\n- Use the category specified in the FILE TYPE GUIDANCE above (do NOT use a different category)\n- If "Initial Monitoring Report" is listed above, use fileType: "Initial Monitoring Report" and category: "Inspections"\n- If "Interim Monitoring Report" is listed above, use fileType: "Interim Monitoring Report" and category: "Inspections"\n- If "RedBook Valuation" is listed above, use fileType: "RedBook Valuation" and category: "Appraisals"\n- If "Plans" is listed above, use fileType: "Plans" and category: "Property Documents"\n- If "Legal Documents" is listed above, use fileType: "Legal Documents" or "Legal Documents - [Subcategory]" and category: "Legal Documents"\n- If "Indicative Terms" is listed above, use fileType: "Indicative Terms" and category: "Loan Terms"\n- Do NOT use generic file types like "Appraisal Report" if a specific file type definition matches\n- The FILE TYPE GUIDANCE takes absolute precedence over general assumptions`
    : '';

  // Build custom instructions section if provided
  
  const customInstructionsSection = customInstructions && customInstructions.trim()
    ? `\n\n═══════════════════════════════════════════════════════════════
⚠️ CRITICAL: USER PROVIDED CUSTOM INSTRUCTIONS - THESE TAKE ABSOLUTE PRIORITY ⚠️
═══════════════════════════════════════════════════════════════

USER INSTRUCTIONS:
${customInstructions.trim()}

CRITICAL RULES FOR CUSTOM INSTRUCTIONS:
1. THE USER IS ALWAYS RIGHT - These instructions override any information found in the file content
2. If the user specifies a client name, use that exact client name (even if it's not in the available clients list - suggest it)
3. If the user specifies a project name, use that exact project name (even if it's not in the available projects list - suggest it)
4. If the user specifies a document type, use that exact document type
5. If the user specifies a category, use that exact category
6. These instructions provide context that may not be evident from the file content alone
7. Trust the user's instructions over your own analysis when there's a conflict
8. The user knows their files better than the AI - follow their guidance precisely

═══════════════════════════════════════════════════════════════`
    : '';
  
  if (customInstructionsSection) {
    console.log('[Together.ai] Custom instructions section added to prompt');
  }

  const prompt = `You are a file organization assistant for a real estate financing company. Analyze the following file content and provide a comprehensive analysis.

${customInstructionsSection ? customInstructionsSection + '\n\n' : ''}CONTEXT:
- This is a real estate financing company
- Files can be associated with clients and their projects
- Projects are property-specific (e.g., addresses, property names, loan numbers)

AVAILABLE CLIENTS AND THEIR PROJECTS:
${clientProjectList}

AVAILABLE CATEGORIES (choose ONE that best fits):
${categoriesList}
${fileTypeGuidance}

FILE INFORMATION:
File name: ${fileName}

File content:
${textContent.substring(0, 12000)}${textContent.length > 12000 ? '\n\n[... content truncated for analysis ...]' : ''}

ANALYSIS REQUIREMENTS:
${customInstructionsSection ? `⚠️ PRIORITY: If CUSTOM INSTRUCTIONS were provided above, they take ABSOLUTE PRIORITY over all other analysis. Follow them precisely.\n\n` : ''}1. Provide a brief summary (2-3 sentences) of what this file contains
2. Determine the file type:
   - CRITICAL: If FILE TYPE GUIDANCE is provided above, you MUST use the exact file type name from that guidance
   - For example, if "Initial Monitoring Report" is listed, use fileType: "Initial Monitoring Report" (NOT "Appraisal Report" or "Monitoring Report")
   - For example, if "Interim Monitoring Report" is listed, use fileType: "Interim Monitoring Report" (NOT "Progress Report")
   - For example, if "RedBook Valuation" is listed, use fileType: "RedBook Valuation" (NOT "Appraisal Report")
   - For example, if "Plans" is listed, use fileType: "Plans" (NOT "Site Plan" or "Drawing")
   - For "Legal Documents": If a specific subcategory can be identified, use format "Legal Documents - [Subcategory]" (e.g., "Legal Documents - Facility Letter", "Legal Documents - Contract", "Legal Documents - Board Minutes"). Available subcategories: Contracts, Resolutions, Facility Letters, Requests, Board Minutes, Shareholder Agreements, Banking Details, Mandates, Sale and Purchase Agreements, Notices, Evictions, Terms and Conditions, Amendments, Offer Letters, Guarantees. If no specific subcategory is clear, use "Legal Documents"
   - For example, if "Indicative Terms" is listed, use fileType: "Indicative Terms" (NOT "Loan Application", "Loan Offer", or "Finance Terms")
   - The FILE TYPE GUIDANCE takes precedence over general file type assumptions
   - Only use general file types (e.g., Loan Application, Property Deed, Email, Contract, etc.) if NO FILE TYPE GUIDANCE is provided
   - Be specific and accurate in your file type identification - use the exact names from FILE TYPE GUIDANCE when available
3. Identify the client:
   ${customInstructionsSection ? '   - ⚠️ CRITICAL: If CUSTOM INSTRUCTIONS specify a client name, use that EXACT name. The user is always right.\n   - ' : ''}  - CRITICAL: ALWAYS try to identify a client from the file content
   - If you find a matching client from the list, use their exact name in "clientName"
   - If no client matches but you can identify a potential client name from the content, ALWAYS suggest it in "suggestedClientName"
   ${customInstructionsSection ? '   - If CUSTOM INSTRUCTIONS specify a client, prioritize that over file content analysis\n   - ' : ''}  - Look for: company names, organization names, client names, business names, individual names
   - Even if uncertain, provide a suggestion if you can identify any potential client name
   - Only set both to null if there is absolutely no client information in the file
4. Identify the project (property/loan) - THIS IS IMPORTANT:
   ${customInstructionsSection ? '   - ⚠️ CRITICAL: If CUSTOM INSTRUCTIONS specify a project name, use that EXACT name. The user is always right.\n   - ' : ''}  - CRITICAL: ALWAYS try to identify a project from the file content
   - Look for: property addresses, street addresses, loan numbers, loan IDs, property names, building names, parcel numbers, APN numbers, or any property identifiers
   - If you find a matching project for the identified client, use the exact project name in "projectName"
   - If no project matches but you can identify ANY property address, loan number, property identifier, or project name from the content, ALWAYS suggest it in "suggestedProjectName"
   ${customInstructionsSection ? '   - If CUSTOM INSTRUCTIONS specify a project, prioritize that over file content analysis\n   - ' : ''}  - Projects are typically: property addresses (e.g., "123 Main Street"), loan numbers (e.g., "Loan #12345"), property names (e.g., "Downtown Office Complex"), or parcel IDs
   - Even if the client is "General" or null, still try to suggest a project if you can identify property information
   - Only set both to null if there is absolutely no property, address, loan, or project information in the file
5. Categorize the file using ONE of the available categories
   ${customInstructionsSection ? '   - ⚠️ CRITICAL: If CUSTOM INSTRUCTIONS specify a category, use that EXACT category. The user is always right.\n   ' : ''}
6. Provide detailed reasoning explaining your analysis
7. Provide a confidence score (0.0 to 1.0)
8. Extract enrichment information (PRIORITY - ALWAYS extract contact information when found):
   - CRITICAL: Prioritize extracting contact information that can update client profiles:
     * Email addresses (primary contact email, company email, support email)
     * Phone numbers (main phone, mobile, office phone, fax)
     * Contact names (decision makers, primary contacts, key personnel with their roles)
     * Physical addresses (company address, office location, mailing address)
     * Company information (website URL, company size, industry details)
   - For each piece of information found, create an enrichment suggestion
   - Field mapping for client profile updates:
     * "email" → client.email
     * "phone" → client.phone
     * "address" → client.address (if field exists)
     * "website" → client.website (if field exists)
     * "contactName" → store as contact information
   - Include confidence scores for each suggestion (0.0 to 1.0)
   - Provide context about where the information was found (e.g., "Found in email signature", "Found in header", "Found in contact section", "Found in letterhead")
   - For contact names, include their role/title if mentioned (e.g., "John Smith - CEO", "Sarah Jones - Finance Director")
   - Extract ALL contact information found - don't limit to just one email or phone number

Respond with a JSON object in this EXACT format:
{
  "summary": "Brief 2-3 sentence summary of the file content",
  "fileType": "specific file type (e.g., 'Loan Application', 'Appraisal Report', 'Email', etc.)",
  "clientName": "exact client name from list if found, or null",
  "suggestedClientName": "suggested client name if not in list but identifiable, or null",
  "projectName": "exact project name from client's projects if found, or null",
  "suggestedProjectName": "suggested project name (property address, loan number, etc.) if not in list but identifiable, or null",
  "category": "ONE of the available categories: ${categoriesList}",
  "reasoning": "detailed explanation of your analysis, including why you chose this client, project, category, and file type",
  "confidence": 0.95,
  "enrichmentSuggestions": [
    {
      "type": "email",
      "field": "email",
      "value": "contact@example.com",
      "confidence": 0.9,
      "context": "Found in email signature"
    },
    {
      "type": "phone",
      "field": "phone",
      "value": "+1-555-123-4567",
      "confidence": 0.85,
      "context": "Found in contact section"
    },
    {
      "type": "contactName",
      "field": "contactName",
      "value": "John Smith - CEO",
      "confidence": 0.9,
      "context": "Found in document header"
    },
    {
      "type": "address",
      "field": "address",
      "value": "123 Main Street, London, UK",
      "confidence": 0.8,
      "context": "Found in letterhead"
    },
    {
      "type": "website",
      "field": "website",
      "value": "https://www.example.com",
      "confidence": 0.95,
      "context": "Found in email signature"
    }
  ]
}

CRITICAL: Always extract contact information (emails, phone numbers, contact names, addresses) when found in the document. This information is essential for enriching client profiles and should be prioritized. Include enrichmentSuggestions array even if it only contains contact information.`;

  try {
    console.log('[Together.ai] Making API request to:', TOGETHER_API_URL);
    const requestBody = {
      model: MODEL_NAME,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that analyzes files for a real estate financing company. Always respond with valid JSON only. Be precise with client and project names - use exact matches when available.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    };
    console.log('[Together.ai] Request body size:', JSON.stringify(requestBody).length, 'bytes');
    
    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const elapsedTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Together.ai] API error response:', errorText);
      
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

    if (!content) {
      throw new Error('No response content from Together.ai API');
    }

    // Extract JSON from response (handle cases where model adds markdown code blocks)
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    }

    const result: ModelResponse = JSON.parse(jsonContent);
    
    return {
      summary: result.summary || 'No summary provided',
      fileType: result.fileType || 'Other',
      clientName: result.clientName || null,
      suggestedClientName: result.suggestedClientName || null,
      projectName: result.projectName || null,
      suggestedProjectName: result.suggestedProjectName || null,
      category: result.category || 'General',
      reasoning: result.reasoning || 'No reasoning provided',
      confidence: result.confidence || 0.5,
      tokensUsed: usage?.total_tokens || 0,
      enrichmentSuggestions: result.enrichmentSuggestions || [],
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse JSON response from model: ${error.message}`);
    }
    throw error;
  }
}

export async function extractProspectingContext(
  textContent: string,
  fileName: string,
  clientName: string | null,
  projectName: string | null,
  clientHistory?: string
): Promise<{
  keyPoints: string[];
  painPoints: string[];
  opportunities: string[];
  decisionMakers: Array<{ name: string; role?: string; context?: string }>;
  businessContext: {
    industry?: string;
    companySize?: string;
    growthIndicators?: string[];
    challenges?: string[];
    goals?: string[];
  };
  financialContext?: {
    budgetMentioned?: boolean;
    budgetRange?: string;
    investmentLevel?: string;
    timeline?: string;
  };
  relationshipContext?: {
    currentStage?: string;
    relationshipStrength?: string;
    lastInteraction?: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
  };
  competitiveMentions?: Array<{ competitor?: string; context?: string }>;
  timeline?: {
    urgency?: 'high' | 'medium' | 'low';
    deadlines?: string[];
    milestones?: string[];
  };
  templateSnippets?: {
    opening?: string;
    valueProposition?: string;
    callToAction?: string;
  };
  confidence: number;
  tokensUsed: number;
}> {
  const apiKey = process.env.TOGETHER_API_KEY;
  
  if (!apiKey) {
    throw new Error('TOGETHER_API_KEY environment variable is not set');
  }

  const prompt = `You are a prospecting intelligence assistant for a real estate financing company. Analyze the following document to extract information that would be useful for personalized outreach and prospecting.

CONTEXT:
- Client: ${clientName || 'Unknown'}
- Project: ${projectName || 'None'}
${clientHistory ? `- Client History: ${clientHistory}` : ''}

DOCUMENT INFORMATION:
File name: ${fileName}

Document content:
${textContent.substring(0, 12000)}${textContent.length > 12000 ? '\n\n[... content truncated for analysis ...]' : ''}

EXTRACTION REQUIREMENTS:
Extract the following information that would be useful for personalized prospecting emails and communications:

1. Key Points: Main talking points or important information from the document (3-5 points)
2. Pain Points: Problems, challenges, or pain points mentioned (if any)
3. Opportunities: Business opportunities, needs, or potential areas for assistance (if any)
4. Decision Makers: People mentioned who might be decision makers (name, role, context)
   - Include their full name, title/role, and context about where they were mentioned
   - Note any contact information if available (but this will be extracted separately via enrichment)
5. Business Context: Industry, company size, growth indicators, challenges, goals
6. Financial Context: Budget mentions, investment level, timeline (if relevant)
7. Relationship Context: Current relationship stage, strength, sentiment, last interaction
8. Competitive Mentions: Any competitors mentioned and context
9. Timeline: Urgency level, deadlines, milestones
10. Template Snippets: Useful snippets for email templates (opening line, value proposition, call to action)

Respond with a JSON object in this EXACT format:
{
  "keyPoints": ["point 1", "point 2", ...],
  "painPoints": ["pain point 1", ...],
  "opportunities": ["opportunity 1", ...],
  "decisionMakers": [
    {
      "name": "John Doe",
      "role": "CEO",
      "context": "Mentioned in email signature"
    }
  ],
  "businessContext": {
    "industry": "Real Estate Development",
    "companySize": "Mid-size",
    "growthIndicators": ["Expanding portfolio", "New projects"],
    "challenges": ["Financing constraints"],
    "goals": ["Complete development project"]
  },
  "financialContext": {
    "budgetMentioned": true,
    "budgetRange": "£5M - £10M",
    "investmentLevel": "High",
    "timeline": "Q2 2024"
  },
  "relationshipContext": {
    "currentStage": "existing client",
    "relationshipStrength": "strong",
    "lastInteraction": "Recent project completion",
    "sentiment": "positive"
  },
  "competitiveMentions": [
    {
      "competitor": "Bank XYZ",
      "context": "Previously worked with them"
    }
  ],
  "timeline": {
    "urgency": "medium",
    "deadlines": ["Q2 2024"],
    "milestones": ["Planning phase"]
  },
  "templateSnippets": {
    "opening": "Based on your recent project completion...",
    "valueProposition": "We can help with financing for your next development",
    "callToAction": "Let's schedule a call to discuss your financing needs"
  },
  "confidence": 0.85
}

Note: Only include fields where you found relevant information. Use empty arrays/objects if no information found.`;

  try {
    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that extracts prospecting intelligence from documents. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Together.ai API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const usage = data.usage;

    if (!content) {
      throw new Error('No response content from Together.ai API');
    }

    // Extract JSON from response
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    }

    const result = JSON.parse(jsonContent);
    
    return {
      keyPoints: result.keyPoints || [],
      painPoints: result.painPoints || [],
      opportunities: result.opportunities || [],
      decisionMakers: result.decisionMakers || [],
      businessContext: result.businessContext || {},
      financialContext: result.financialContext,
      relationshipContext: result.relationshipContext,
      competitiveMentions: result.competitiveMentions,
      timeline: result.timeline,
      templateSnippets: result.templateSnippets,
      confidence: result.confidence || 0.5,
      tokensUsed: usage?.total_tokens || 0,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse JSON response from model: ${error.message}`);
    }
    throw error;
  }
}

