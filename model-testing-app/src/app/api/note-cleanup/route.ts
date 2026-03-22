import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a note cleanup assistant for a property finance team. The user has dictated or quickly typed raw notes. Your job is to enhance — not rewrite.

Do:
- Fix grammar, spelling, and punctuation
- Add formatting (paragraphs, bullet points) where it improves readability
- Add clarity where meaning is ambiguous
- Add substance where context is implied but not stated

Do not:
- Change the meaning or tone of what was written
- Remove or replace specific figures, names, dates, or technical terms
- Add information that wasn't implied by the original
- Make it sound overly formal or corporate — keep the user's voice

Return only the cleaned text. No explanations.`;

export async function POST(request: NextRequest) {
  try {
    const { text, mode } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    if (!mode || !['selection', 'full'].includes(mode)) {
      return NextResponse.json({ error: "mode must be 'selection' or 'full'" }, { status: 400 });
    }

    const userPrompt =
      mode === 'selection'
        ? `Clean up this selected text from a note:\n\n${text}`
        : `Clean up this entire note:\n\n${text}`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const cleaned =
      response.content[0].type === 'text' ? response.content[0].text : '';

    return NextResponse.json({ cleaned });
  } catch (error) {
    console.error('Note cleanup error:', error);
    return NextResponse.json(
      { error: 'Failed to clean up note' },
      { status: 500 }
    );
  }
}
