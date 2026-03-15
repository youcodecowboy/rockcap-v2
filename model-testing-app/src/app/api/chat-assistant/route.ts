import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { executeTool } from '@/lib/tools';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { buildSystemPromptBlocks } from '@/lib/chat/systemPrompt';
import { runAgenticLoop } from '@/lib/chat/agenticLoop';
import { parseMentions, stripMentionMarkup } from '@/lib/chat/mentionParser';
import { formatClientReference, formatProjectReference, KnowledgeItem } from '@/lib/chat/references';

const MODEL = 'claude-haiku-4-5-20251001';

export const runtime = 'nodejs';
export const maxDuration = 60;

// =============================================================================
// POST HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const convexClient = await getAuthenticatedConvexClient();
    let currentUser: any;
    try {
      currentUser = await requireAuth(convexClient);
    } catch {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const body = await request.json();
    const {
      sessionId,
      message,
      clientId,
      projectId,
      conversationHistory = [],
      executeAction = false,
      actionId,
      fileMetadata,
      mentions, // NEW: Array<{ type, name, id }> from frontend
    } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // 2. Handle action execution (existing flow preserved)
    if (executeAction && actionId) {
      return handleActionExecution(convexClient, actionId);
    }

    if (!message && !fileMetadata) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 3. Parse @ mentions from message (markup format first, then bare @Name fallback)
    let parsedMentions = mentions?.length ? mentions : (message ? parseMentions(message) : []);

    // Fallback: resolve bare @Name mentions by searching clients/projects
    if (parsedMentions.length === 0 && message) {
      const bareMatches = message.match(/@(\w[\w\s]*\w|\w+)/g);
      if (bareMatches) {
        const allClients = await convexClient.query(api.clients.list, {});
        const allProjects = await convexClient.query(api.projects.list, {});
        for (const match of bareMatches) {
          const name = match.slice(1).trim(); // remove @
          const nameLC = name.toLowerCase();
          const client = (allClients || []).find((c: any) => c.name?.toLowerCase() === nameLC);
          if (client) {
            parsedMentions.push({ type: 'client', name: client.name, id: client._id });
            continue;
          }
          const project = (allProjects || []).find((p: any) => p.name?.toLowerCase() === nameLC);
          if (project) {
            parsedMentions.push({ type: 'project', name: project.name, id: project._id });
          }
        }
      }
    }

    console.log('[chat-assistant] Message:', message?.slice(0, 100));
    console.log('[chat-assistant] Mentions from frontend:', JSON.stringify(mentions));
    console.log('[chat-assistant] Resolved mentions:', JSON.stringify(parsedMentions));

    const cleanMessage = message ? stripMentionMarkup(message) : '';

    // 4. Build references from mentions + page context
    //    Uses knowledge items as primary data source (source of truth for intelligence UI)
    const references: string[] = [];
    for (const mention of parsedMentions) {
      if (mention.type === 'client') {
        const client = await convexClient.query(api.clients.get, { id: mention.id as Id<"clients"> });
        const intel = await convexClient.query(api.intelligence.getClientIntelligence, { clientId: mention.id as Id<"clients"> });
        const knowledgeItems = await convexClient.query(api.knowledgeLibrary.getKnowledgeItemsByClient, { clientId: mention.id as Id<"clients"> }) as KnowledgeItem[];
        references.push(formatClientReference(
          { name: client?.name || mention.name, status: client?.status || 'unknown', type: client?.type || 'unknown' },
          intel,
          knowledgeItems
        ));
      } else if (mention.type === 'project') {
        const project = await convexClient.query(api.projects.get, { id: mention.id as Id<"projects"> });
        const intel = await convexClient.query(api.intelligence.getProjectIntelligence, { projectId: mention.id as Id<"projects"> });
        const knowledgeItems = await convexClient.query(api.knowledgeLibrary.getKnowledgeItemsByProject, { projectId: mention.id as Id<"projects"> }) as KnowledgeItem[];
        references.push(formatProjectReference(
          { name: project?.name || mention.name, status: project?.status || 'unknown' },
          intel,
          knowledgeItems
        ));
        // Also load parent client reference for project mentions
        if (project?.clientId) {
          const parentClient = await convexClient.query(api.clients.get, { id: project.clientId });
          const parentIntel = await convexClient.query(api.intelligence.getClientIntelligence, { clientId: project.clientId });
          const parentKnowledgeItems = await convexClient.query(api.knowledgeLibrary.getKnowledgeItemsByClient, { clientId: project.clientId }) as KnowledgeItem[];
          if (parentClient) {
            references.push(formatClientReference(
              { name: parentClient.name, status: parentClient.status, type: parentClient.type },
              parentIntel,
              parentKnowledgeItems
            ));
          }
        }
      }
    }

    // If no mentions, inject page context reference
    if (references.length === 0 && (clientId || projectId)) {
      if (projectId) {
        const project = await convexClient.query(api.projects.get, { id: projectId as Id<"projects"> });
        const intel = await convexClient.query(api.intelligence.getProjectIntelligence, { projectId: projectId as Id<"projects"> });
        const knowledgeItems = await convexClient.query(api.knowledgeLibrary.getKnowledgeItemsByProject, { projectId: projectId as Id<"projects"> }) as KnowledgeItem[];
        if (project) {
          references.push(formatProjectReference(
            { name: project.name, status: project.status },
            intel,
            knowledgeItems
          ));
        }
        if (project?.clientId) {
          const client = await convexClient.query(api.clients.get, { id: project.clientId });
          const clientIntel = await convexClient.query(api.intelligence.getClientIntelligence, { clientId: project.clientId });
          const clientKI = await convexClient.query(api.knowledgeLibrary.getKnowledgeItemsByClient, { clientId: project.clientId }) as KnowledgeItem[];
          if (client) {
            references.push(formatClientReference(
              { name: client.name, status: client.status, type: client.type },
              clientIntel,
              clientKI
            ));
          }
        }
      } else if (clientId) {
        const client = await convexClient.query(api.clients.get, { id: clientId as Id<"clients"> });
        const intel = await convexClient.query(api.intelligence.getClientIntelligence, { clientId: clientId as Id<"clients"> });
        const knowledgeItems = await convexClient.query(api.knowledgeLibrary.getKnowledgeItemsByClient, { clientId: clientId as Id<"clients"> }) as KnowledgeItem[];
        if (client) {
          references.push(formatClientReference(
            { name: client.name, status: client.status, type: client.type },
            intel,
            knowledgeItems
          ));
        }
      }
    }

    console.log('[chat-assistant] References built:', references.length, 'blocks');
    if (references.length > 0) {
      console.log('[chat-assistant] Reference preview:', references[0].slice(0, 500));
    }

    // 5. Build system prompt
    const systemBlocks = buildSystemPromptBlocks({
      pageContext: clientId || projectId
        ? {
            type: projectId ? 'project' : 'client',
            clientId,
            projectId,
            clientName: clientId ? (await convexClient.query(api.clients.get, { id: clientId as Id<"clients"> }))?.name : undefined,
            projectName: projectId ? (await convexClient.query(api.projects.get, { id: projectId as Id<"projects"> }))?.name : undefined,
          }
        : undefined,
      references,
      currentDate: new Date().toISOString().split('T')[0],
    });

    // 6. Build messages array
    const messages: Anthropic.MessageParam[] = [];
    if (conversationHistory) {
      for (const msg of conversationHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add file context to message if present
    let userContent = cleanMessage || '';
    if (fileMetadata) {
      userContent = `[File uploaded: ${fileMetadata.fileName} (${fileMetadata.fileType}, ${Math.round(fileMetadata.fileSize / 1024)}KB, storageId: ${fileMetadata.fileStorageId})]\n\n${userContent || `Please analyze and file ${fileMetadata.fileName}.`}`;
    }
    if (userContent) {
      messages.push({ role: 'user', content: userContent });
    }

    // 7. Derive effective context IDs: page context takes priority, then first mention
    let effectiveClientId = clientId;
    let effectiveProjectId = projectId;
    if (!effectiveClientId && !effectiveProjectId && parsedMentions.length > 0) {
      for (const mention of parsedMentions) {
        if (mention.type === 'client' && !effectiveClientId) {
          effectiveClientId = mention.id;
        } else if (mention.type === 'project' && !effectiveProjectId) {
          effectiveProjectId = mention.id;
        }
      }
    }

    // 8. Run the agentic loop
    const loopResult = await runAgenticLoop({
      sessionId,
      clientId: effectiveClientId,
      projectId: effectiveProjectId,
      systemBlocks,
      messages,
      convexClient,
    });

    // 9. Generate title for first message
    if (conversationHistory?.length === 0 || !conversationHistory) {
      const anthropicClient = new Anthropic();
      generateChatTitle(anthropicClient, sessionId, cleanMessage, convexClient).catch(() => {});
    }

    // 10. Return response
    return NextResponse.json({
      content: loopResult.content,
      toolCalls: loopResult.toolCalls,
      activityLog: loopResult.activityLog,
      pendingActions: loopResult.pendingActions,
      tokensUsed: loopResult.tokensUsed,
      cacheMetrics: {
        ...loopResult.cacheMetrics,
        cacheHitRate: loopResult.cacheMetrics.cacheReadTokens > 0
          ? (loopResult.cacheMetrics.cacheReadTokens / (loopResult.cacheMetrics.cacheReadTokens + loopResult.cacheMetrics.uncachedInputTokens)) * 100
          : 0,
      },
      loadedSkills: loopResult.loadedSkills,
    });
  } catch (error) {
    console.error('[chat-assistant] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================================================
// ACTION EXECUTION (preserved from original)
// =============================================================================

async function handleActionExecution(
  client: any,
  actionId: string
): Promise<NextResponse> {
  let action: any = null;

  try {
    action = await client.query(api.chatActions.get, {
      id: actionId as Id<"chatActions">,
    });

    if (!action) {
      throw new Error('Action not found');
    }

    if (action.status === 'executed') {
      return NextResponse.json({
        success: true,
        result: action.result,
        message: `Action already executed: ${action.actionType}`,
        itemId: action.result,
      });
    }

    if (action.status === 'cancelled') {
      throw new Error('Action was cancelled');
    }

    if (action.status === 'failed') {
      throw new Error(action.error || 'Action previously failed');
    }

    // Execute using the tool executor
    const result = await executeTool(action.actionType, action.actionData, client);

    // Mark action as executed
    await client.mutation(api.chatActions.markExecuted, {
      id: actionId as Id<"chatActions">,
      result: result,
    });

    // Determine item type and ID for navigation
    let itemId: string | undefined;
    let itemType: string | undefined;
    let resultClientId: string | undefined;

    if (result) {
      const typeMap: Record<string, string> = {
        createNote: 'note',
        updateNote: 'note',
        createClient: 'client',
        updateClient: 'client',
        createProject: 'project',
        updateProject: 'project',
        createContact: 'contact',
        createReminder: 'reminder',
        createTask: 'task',
        createEvent: 'event',
        createKnowledgeBankEntry: 'knowledgeBankEntry',
        saveChatDocument: 'document',
      };

      itemType = typeMap[action.actionType];
      if (itemType) {
        itemId = result as string;
      }

      if (action.actionType === 'createKnowledgeBankEntry' && action.actionData.clientId) {
        resultClientId = action.actionData.clientId;
      }
    }

    return NextResponse.json({
      success: true,
      result,
      message: `Successfully executed ${action.actionType}`,
      itemId,
      itemType,
      clientId: resultClientId,
    });
  } catch (error) {
    console.error('Error executing action:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (actionId) {
      try {
        await client.mutation(api.chatActions.markFailed, {
          id: actionId as Id<"chatActions">,
          error: errorMessage,
        });
      } catch (markFailedError) {
        console.error('Failed to mark action as failed:', markFailedError);
      }
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// =============================================================================
// TITLE GENERATION (preserved from original)
// =============================================================================

async function generateChatTitle(
  anthropic: Anthropic,
  sessionId: string,
  message: string,
  convexClient: any
): Promise<void> {
  try {
    const titleResponse = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 20,
      messages: [
        {
          role: 'user',
          content: `Generate a short, concise title (3-5 words maximum) for this conversation. Return ONLY the title, nothing else.\n\nUser message: "${message}"`,
        },
      ],
    });

    const generatedTitle = titleResponse.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length < 100) {
      await convexClient.mutation(api.chatSessions.update, {
        id: sessionId as Id<"chatSessions">,
        title: generatedTitle,
      });
    }
  } catch (error) {
    console.error('Error generating chat title:', error);
  }
}
