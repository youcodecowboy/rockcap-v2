/**
 * @deprecated This route uses the V3 Together.ai pipeline for notes AI assistant.
 * The primary chat system now uses /api/chat-assistant with Anthropic Claude Haiku 4.5.
 * This route is still referenced by AIAssistantBlock in the notes editor.
 * TODO: Migrate AIAssistantBlock + NotesEditor to use /api/chat-assistant, then remove this route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { gatherContextForNote, formatContextForLLM, estimateTokens } from '@/lib/aiNotesContext';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { TOGETHER_API_URL, MODEL_CONFIG } from '@/lib/modelConfig';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  console.warn('[DEPRECATED] /api/ai-assistant called — should migrate to /api/chat-assistant');
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
    const { prompt, noteId, clientId, projectId, updateMode, existingContent } = body;

    if (!prompt || !prompt.trim()) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Gather context
    const context = await gatherContextForNote(
      noteId,
      clientId || null,
      projectId || null,
      prompt
    );

    // Format context for LLM
    let contextString = formatContextForLLM(context, prompt, updateMode, existingContent);
    
    // Log context for debugging
    console.log('Context gathered:', {
      client: context.client?.name,
      project: context.project?.name,
      knowledgeBankEntries: context.knowledgeBankEntries.length,
      documents: context.documents.length,
      contextLength: contextString.length,
    });

    // Check token limits (50k+ tokens allowed, but let's be reasonable)
    const contextTokens = estimateTokens(contextString);
    const promptTokens = estimateTokens(prompt);
    const totalInputTokens = contextTokens + promptTokens;

    if (totalInputTokens > 50000) {
      // Truncate context if too long - prioritize keeping extracted data
      const maxContextTokens = 45000 - promptTokens;
      const maxContextLength = maxContextTokens * 4; // Rough char estimate
      contextString = contextString.substring(0, maxContextLength) + '\n\n[Context truncated due to length - some information may be missing]';
    }

    // Call Together AI
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY environment variable is not set');
    }

    let systemPrompt = `You are an AI assistant helping users create well-formatted notes for a real estate financing company.

CRITICAL INSTRUCTIONS:
1. YOU MUST USE THE PROVIDED CONTEXT DATA - The context below contains real information from the knowledge bank, documents, and extracted data. Use the actual numbers, expenses, client names, project details, and other specific information from the context.

2. DO NOT MAKE UP INFORMATION - If information is not in the context, say so. Only use data that appears in the provided context.

3. EXTRACT AND USE SPECIFIC DATA:
   - Use exact numbers, amounts, expenses, and financial data from the "Extracted Data" sections
   - Reference specific client names, project names, and document names from the context
   - Include dates, timelines, and status information from knowledge bank entries
   - Use key points and summaries from knowledge bank entries`;

    if (updateMode) {
      systemPrompt += `

4. UPDATE MODE - You are REVISING an existing note:
   - Read the "CURRENT NOTE CONTENT" carefully
   - Understand what the user wants to change/add/update
   - Preserve relevant information that doesn't conflict with the update request
   - Enhance, expand, or modify sections as requested
   - Maintain professional formatting and structure
   - If the user asks to add information, integrate it naturally into the existing content
   - If the user asks to update information, replace the old information with the new
   - If the user asks to remove information, omit it from your response`;
    } else {
      systemPrompt += `

4. CREATE MODE - You are creating a new note section:
   - Generate comprehensive content based on the user's prompt
   - Use information from the knowledge bank and documents
   - Structure the content logically`;
    }

    systemPrompt += `

5. Format your response professionally using:
   - Headings (H1, H2, H3) for major sections
   - Bullet lists and numbered lists for items
   - Tables for structured data (especially for expenses, numbers, comparisons)
   - Dividers (---) to separate sections
   - Blockquotes for important quotes or highlights
   - Clear, professional language
   - **bold** for emphasis (use **text** syntax)
   - *italic* for subtle emphasis (use *text* syntax)

6. When mentioning clients, projects, or files, use their EXACT names from the context so they can be linked:
   - Client names: Use the exact client name from context
   - Project names: Use the exact project name from context
   - File names: Use the exact file/document name from context

7. Structure your response logically with clear sections
8. Reference specific knowledge bank entries or documents when relevant
9. Include specific numbers, dates, and details from the extracted data

Return your response in plain text format. Use markdown-style formatting indicators:
- # for H1, ## for H2, ### for H3
- - or * for bullet lists
- 1. for numbered lists
- | for tables
- > for blockquotes
- --- for dividers
- **text** for bold
- *text* for italic`;

    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_CONFIG.chat.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: contextString,
          },
        ],
        temperature: MODEL_CONFIG.chat.temperature,
        max_tokens: MODEL_CONFIG.chat.maxTokens,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Together AI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content || '';

    if (!aiResponse) {
      throw new Error('No response from AI');
    }

    // Generate a suggested title based on the response
    // Extract first heading or first sentence, or generate a concise summary
    let suggestedTitle = '';
    const lines = aiResponse.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Check for H1 heading
      if (trimmed.startsWith('# ')) {
        suggestedTitle = trimmed.substring(2).trim();
        break;
      }
      // Check for H2 heading
      if (!suggestedTitle && trimmed.startsWith('## ')) {
        suggestedTitle = trimmed.substring(3).trim();
        break;
      }
      // Check for first meaningful paragraph
      if (!suggestedTitle && trimmed.length > 10 && trimmed.length < 100 && !trimmed.startsWith('#')) {
        suggestedTitle = trimmed.substring(0, 60).trim();
        if (suggestedTitle.endsWith('...') || suggestedTitle.length > 60) {
          suggestedTitle = suggestedTitle.substring(0, 57) + '...';
        }
        break;
      }
    }
    
    // Clean markdown formatting from title
    if (suggestedTitle) {
      suggestedTitle = suggestedTitle
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove **bold**
        .replace(/\*(.+?)\*/g, '$1') // Remove *italic*
        .replace(/__(.+?)__/g, '$1') // Remove __bold__
        .replace(/_(.+?)_/g, '$1') // Remove _italic_
        .replace(/`(.+?)`/g, '$1') // Remove `code`
        .trim();
    }
    
    // If no good title found, generate one using AI
    if (!suggestedTitle || suggestedTitle.length < 5) {
      try {
        const titleResponse = await fetch(TOGETHER_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: MODEL_CONFIG.chat.model,
            messages: [
              {
                role: 'system',
                content: 'You are a title generator. Generate a concise, professional title (5-10 words) based on the content provided. Return ONLY the title, no quotes, no explanation.',
              },
              {
                role: 'user',
                content: `Generate a title for this note content:\n\n${aiResponse.substring(0, 500)}`,
              },
            ],
            temperature: 0.7,
            max_tokens: 30,
          }),
        });

        if (titleResponse.ok) {
          const titleData = await titleResponse.json();
          const titleText = titleData.choices[0]?.message?.content || '';
          if (titleText.trim()) {
            suggestedTitle = titleText.trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
          }
        }
      } catch (error) {
        console.error('Error generating title:', error);
        // Fallback to first sentence or default
        const firstSentence = aiResponse.split(/[.!?]/)[0].trim();
        suggestedTitle = firstSentence.length > 60 ? firstSentence.substring(0, 57) + '...' : firstSentence;
      }
    }
    
    // Fallback if still no title
    if (!suggestedTitle || suggestedTitle.length < 3) {
      suggestedTitle = 'AI Generated Note';
    }

    // Detect mentions (will be processed by formatter)
    const mentions = {
      clients: [] as string[],
      projects: [] as string[],
      files: [] as string[],
    };

    // Enhanced mention detection
    if (context.client) {
      const clientName = context.client.name;
      // Check for exact name match or partial match
      if (aiResponse.toLowerCase().includes(clientName.toLowerCase())) {
        mentions.clients.push(context.client._id);
      }
    }
    if (context.project) {
      const projectName = context.project.name;
      if (aiResponse.toLowerCase().includes(projectName.toLowerCase())) {
        mentions.projects.push(context.project._id);
      }
    }
    context.documents.forEach((doc: any) => {
      const docName = doc.fileName || doc.name;
      if (docName && aiResponse.toLowerCase().includes(docName.toLowerCase())) {
        mentions.files.push(doc._id);
      }
    });

    // Extract suggested tags from knowledge bank entries and documents
    const suggestedTags = new Set<string>();
    
    // Add tags from knowledge bank entries
    context.knowledgeBankEntries.forEach((entry: any) => {
      if (entry.tags && Array.isArray(entry.tags)) {
        entry.tags.forEach((tag: string) => {
          if (tag && tag.trim()) {
            suggestedTags.add(tag.trim());
          }
        });
      }
    });
    
    // Add document categories/types as tags
    context.documents.forEach((doc: any) => {
      if (doc.category) {
        suggestedTags.add(doc.category);
      }
      if (doc.fileTypeDetected) {
        suggestedTags.add(doc.fileTypeDetected);
      }
    });
    
    // Add entry types as tags
    context.knowledgeBankEntries.forEach((entry: any) => {
      if (entry.entryType) {
        suggestedTags.add(entry.entryType.replace(/_/g, ' '));
      }
    });

    // Return raw response - formatting will happen client-side
    return NextResponse.json({
      content: aiResponse,
      suggestedTitle,
      suggestedTags: Array.from(suggestedTags).slice(0, 10), // Limit to 10 tags
      suggestedClientId: clientId || null,
      suggestedProjectId: projectId || null,
      mentions,
      clients: context.client ? [context.client] : [],
      projects: context.project ? [context.project] : [],
      documents: context.documents,
      tokensUsed: data.usage?.total_tokens || 0,
    });
  } catch (error) {
    console.error('AI Assistant API error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate AI response',
      },
      { status: 500 }
    );
  }
}

