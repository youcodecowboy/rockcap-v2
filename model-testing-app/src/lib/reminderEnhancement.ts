const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const MODEL_NAME = 'openai/gpt-oss-20b'; // GPT-OSS-20B via Together.ai

export interface ReminderEnhancementResult {
  enhancedDescription: string;
  suggestedClientName: string | null;
  suggestedProjectName: string | null;
  context: string[];
  confidence: number;
  tokensUsed: number;
}

interface ClientWithProjects {
  id: string;
  name: string;
  projects: Array<{ id: string; name: string }>;
}

/**
 * Enhance reminder text with LLM-powered context extraction and suggestions
 */
export async function enhanceReminderText(
  reminderText: string,
  clientsWithProjects: ClientWithProjects[] = []
): Promise<ReminderEnhancementResult> {
  const apiKey = process.env.TOGETHER_API_KEY;
  
  if (!apiKey) {
    throw new Error('TOGETHER_API_KEY environment variable is not set');
  }

  // Build client and project list for prompt
  const clientProjectList = clientsWithProjects.map(client => {
    const projects = client.projects.length > 0 
      ? ` (Projects: ${client.projects.map(p => p.name).join(', ')})`
      : '';
    return `${client.name}${projects}`;
  }).join('\n') || 'None available';

  const prompt = `You are an AI assistant helping users create well-structured reminders for a real estate financing company.

CONTEXT:
- This is a real estate financing company
- Reminders can be associated with clients and their projects
- Projects are property-specific (e.g., addresses, property names, loan numbers)

AVAILABLE CLIENTS AND THEIR PROJECTS:
${clientProjectList}

REMINDER TEXT:
${reminderText}

ENHANCEMENT REQUIREMENTS:
1. Extract and enhance the reminder description:
   - Clarify any ambiguous language
   - Add relevant context that might be implied
   - Make the description more actionable and specific
   - Keep it concise but informative

2. Identify potential client:
   - If the reminder text mentions a client name from the available clients list, suggest that exact name
   - If no exact match but a potential client name is mentioned, suggest it
   - Only suggest if there's reasonable confidence (>= 0.7)

3. Identify potential project:
   - Look for property addresses, loan numbers, property names, or project identifiers
   - If a project matches from the available projects, suggest that exact name
   - If no exact match but property information is mentioned, suggest it
   - Only suggest if there's reasonable confidence (>= 0.7)

4. Extract key context points:
   - Identify 3-5 key points or important details from the reminder text
   - These should be useful for understanding the reminder's purpose
   - Format as an array of strings

5. Provide confidence score (0.0 to 1.0) for the enhancement quality

Respond with a JSON object in this EXACT format:
{
  "enhancedDescription": "Enhanced and clarified description of the reminder",
  "suggestedClientName": "exact client name from list if found, or null",
  "suggestedProjectName": "exact project name if found, or null",
  "context": ["key point 1", "key point 2", "key point 3"],
  "confidence": 0.85
}

CRITICAL INSTRUCTIONS:
- Use exact client/project names from the available list when possible
- Only suggest names if there's reasonable confidence
- Keep enhanced description concise but informative
- Extract actionable context points
- Always respond with valid JSON only`;

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
            content: 'You are a helpful assistant that enhances reminder text for a real estate financing company. Always respond with valid JSON only. Be precise with client and project names - use exact matches when available.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
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

    // Extract JSON from response (handle cases where model adds markdown code blocks)
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    }

    const result = JSON.parse(jsonContent);
    
    return {
      enhancedDescription: result.enhancedDescription || reminderText,
      suggestedClientName: result.suggestedClientName || null,
      suggestedProjectName: result.suggestedProjectName || null,
      context: result.context || [],
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

