import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Together AI configuration
const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const TOGETHER_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

interface InsightsRequest {
  clientId?: string;
  projectId?: string;
  context: string;
  type: 'client' | 'project';
}

interface InsightsResponse {
  executiveSummary?: string;
  keyFacts?: string[];
  risks?: string[];
}

/**
 * POST /api/generate-insights
 * Generate AI insights for a client or project based on available data
 */
export async function POST(request: NextRequest) {
  try {
    const body: InsightsRequest = await request.json();
    const { context, type } = body;

    if (!context || context.trim().length === 0) {
      return NextResponse.json(
        { error: 'Context is required to generate insights' },
        { status: 400 }
      );
    }

    const togetherApiKey = process.env.TOGETHER_API_KEY;
    if (!togetherApiKey) {
      return NextResponse.json(
        { error: 'TOGETHER_API_KEY not configured' },
        { status: 500 }
      );
    }

    const systemPrompt = type === 'client'
      ? `You are an expert real estate finance analyst. Generate a concise executive summary and key facts about a client based on the provided data.

Your response MUST be valid JSON with this exact structure:
{
  "executiveSummary": "A 2-3 sentence executive summary highlighting the client's profile, experience, and relevance for real estate lending",
  "keyFacts": ["Key fact 1", "Key fact 2", "Key fact 3"]
}

Guidelines:
- Be concise and professional
- Focus on lending-relevant information
- Highlight strengths and any notable characteristics
- Generate 3-5 key facts
- Do not make up information - only use what is provided`
      : `You are an expert real estate finance analyst. Generate a concise executive summary, key facts, and risk assessment for a development project.

Your response MUST be valid JSON with this exact structure:
{
  "executiveSummary": "A 2-3 sentence executive summary of the project covering type, scale, and key financials",
  "keyFacts": ["Key fact 1", "Key fact 2", "Key fact 3"],
  "risks": ["Risk 1", "Risk 2"]
}

Guidelines:
- Be concise and professional
- Highlight key metrics (GDV, TDC, profit margin, units)
- Identify genuine risks based on the data (planning, financial, timeline)
- Generate 3-5 key facts and 2-4 risks
- Do not make up information - only use what is provided`;

    const userPrompt = `Based on the following ${type} data, generate insights:

${context}

Respond ONLY with valid JSON, no additional text.`;

    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${togetherApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: TOGETHER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Generate Insights] API error:', errorText);
      throw new Error(`Together AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    let insights: InsightsResponse;
    try {
      insights = JSON.parse(content);
    } catch {
      console.error('[Generate Insights] Failed to parse response:', content);
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      );
    }

    return NextResponse.json(insights);
  } catch (error) {
    console.error('[Generate Insights] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate insights' },
      { status: 500 }
    );
  }
}
