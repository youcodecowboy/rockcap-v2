import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a note cleanup assistant for a property finance team. The user has dictated or quickly typed raw notes. Your job is to LIGHTLY polish — not rewrite, not summarise, not condense.

CRITICAL RULES:
- NEVER delete content. Every sentence, bullet point, and list item the user wrote MUST appear in your output.
- NEVER merge or combine separate points into one sentence.
- NEVER summarise or condense. If the user wrote 10 lines, output at least 10 lines.
- NEVER remove lists, bullet points, or items from lists. Keep every single item.
- Keep the user's exact words wherever possible. Only change words when fixing clear grammar/spelling errors.

What you MAY do:
- Fix obvious spelling and grammar mistakes
- Fix punctuation
- Turn a raw list into a properly formatted bullet list (keeping ALL items)
- Add a line break between paragraphs if they run together
- Capitalise sentence starts

What you MUST NOT do:
- Delete, remove, or skip any content
- Rewrite sentences in your own words
- Merge multiple points into fewer points
- Change technical terms, names, figures, or dates
- Add new information or commentary
- Change the tone or formality level

Return only the cleaned text. No explanations. The output must contain ALL the same information as the input.`;

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
