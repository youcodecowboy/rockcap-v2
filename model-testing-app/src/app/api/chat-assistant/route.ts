import { NextRequest, NextResponse } from 'next/server';
import { CHAT_TOOLS, executeTool } from '@/lib/chatTools';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const MODEL_NAME = 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Gather context for the chat based on session context
 */
async function gatherChatContext(
  client: any,
  sessionId: string,
  clientId?: string,
  projectId?: string
): Promise<string> {
  let context = '';

  try {
    // Get client info if available
    if (clientId) {
      const clientData = await client.query(api.clients.get, {
        id: clientId as Id<"clients">,
      });
      if (clientData) {
        context += `\n\nCLIENT CONTEXT:\n`;
        context += `Name: ${clientData.name}\n`;
        if (clientData.type) context += `Type: ${clientData.type}\n`;
        if (clientData.status) context += `Status: ${clientData.status}\n`;
        if (clientData.email) context += `Email: ${clientData.email}\n`;
        if (clientData.phone) context += `Phone: ${clientData.phone}\n`;
        if (clientData.notes) context += `Notes: ${clientData.notes}\n`;
      }

      // Get knowledge bank entries for this client
      const knowledgeEntries = await client.query(api.knowledgeBank.getByClient, {
        clientId: clientId as Id<"clients">,
      });
      if (knowledgeEntries && knowledgeEntries.length > 0) {
        context += `\n\nKNOWLEDGE BANK (Recent ${Math.min(5, knowledgeEntries.length)} entries):\n`;
        knowledgeEntries.slice(0, 5).forEach((entry: any) => {
          context += `- ${entry.title}: ${entry.content.substring(0, 200)}...\n`;
        });
      }
    }

    // Get project info if available
    if (projectId) {
      const projectData = await client.query(api.projects.get, {
        id: projectId as Id<"projects">,
      });
      if (projectData) {
        context += `\n\nPROJECT CONTEXT:\n`;
        context += `Name: ${projectData.name}\n`;
        if (projectData.description) context += `Description: ${projectData.description}\n`;
        if (projectData.status) context += `Status: ${projectData.status}\n`;
        if (projectData.address) context += `Address: ${projectData.address}\n`;
        if (projectData.loanAmount) context += `Loan Amount: ${projectData.loanAmount}\n`;
        if (projectData.loanNumber) context += `Loan Number: ${projectData.loanNumber}\n`;
      }
    }
  } catch (error) {
    console.error('Error gathering context:', error);
  }

  return context;
}

/**
 * Parse tool calls from LLM response
 */
function parseToolCalls(content: string): Array<{ id: string; name: string; arguments: string }> | null {
  try {
    // Look for tool calls in the format: <TOOL_CALL>{...}</TOOL_CALL>
    const toolCallRegex = /<TOOL_CALL>\s*([\s\S]*?)\s*<\/TOOL_CALL>/g;
    const matches = Array.from(content.matchAll(toolCallRegex));
    
    if (!matches || matches.length === 0) return null;
    
    const toolCalls = matches.map((match, index) => {
      const jsonStr = match[1].trim();
      const parsed = JSON.parse(jsonStr);
      return {
        id: `tool_${Date.now()}_${index}`,
        name: parsed.name,
        arguments: JSON.stringify(parsed.arguments || {}),
      };
    });
    
    return toolCalls.length > 0 ? toolCalls : null;
  } catch (error) {
    console.error('Error parsing tool calls:', error);
    console.error('Content:', content);
    return null;
  }
}

/**
 * Format tool results in a human-readable way
 */
function formatToolResult(toolName: string, result: any): string {
  if (!result) return 'No results found.';
  
  if (Array.isArray(result)) {
    if (result.length === 0) return 'No results found.';
    
    // Format arrays as lists
    return `Found ${result.length} result(s):\n${result.map((item, i) => 
      `${i + 1}. ${item.name || item.title || JSON.stringify(item)}`
    ).join('\n')}`;
  }
  
  if (typeof result === 'object') {
    // Format objects with key-value pairs
    return Object.entries(result)
      .filter(([key, value]) => value !== undefined && value !== null && !key.startsWith('_'))
      .map(([key, value]) => `- **${key}**: ${value}`)
      .join('\n');
  }
  
  return String(result);
}

/**
 * Get user-friendly activity message for tool execution
 */
function getActivityMessage(toolName: string, params: any): string {
  const messages: Record<string, (p: any) => string> = {
    searchClients: (p) => p.status ? `🔍 Searching for ${p.status} clients...` : '🔍 Searching for clients...',
    getClient: () => '📋 Retrieving client details...',
    searchProjects: (p) => p.clientId ? '🏗️ Searching for projects...' : '🏗️ Searching all projects...',
    getProject: () => '📋 Retrieving project details...',
    searchDocuments: (p) => p.projectId ? '📄 Searching project documents...' : '📄 Searching documents...',
    getKnowledgeBank: () => '🧠 Retrieving knowledge bank entries...',
    getNotes: () => '📝 Retrieving notes...',
    getFileSummary: () => '📊 Analyzing file...',
  };
  
  return messages[toolName]?.(params) || `⚙️ Executing ${toolName}...`;
}

export async function POST(request: NextRequest) {
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
    const {
      sessionId,
      message,
      clientId,
      projectId,
      conversationHistory = [],
      executeAction = false,
      actionId,
    } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY environment variable is not set');
    }

    // If this is an action execution request
    if (executeAction && actionId) {
      try {
        // Get the action details
        const action = await client.query(api.chatActions.get, {
          id: actionId as Id<"chatActions">,
        });

        if (!action) {
          throw new Error('Action not found');
        }

        // Execute the tool with authenticated client
        const result = await executeTool(action.actionType, action.actionData, client);

        // Mark action as executed
        await client.mutation(api.chatActions.markExecuted, {
          id: actionId as Id<"chatActions">,
          result: result,
        });

        return NextResponse.json({
          success: true,
          result,
          message: `Successfully executed ${action.actionType}`,
        });
      } catch (error) {
        // Mark action as failed
        if (actionId) {
          await client.mutation(api.chatActions.markFailed, {
            id: actionId as Id<"chatActions">,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }

        return NextResponse.json(
          {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to execute action',
          },
          { status: 500 }
        );
      }
    }

    // Regular chat request - get AI response
    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Gather context
    const context = await gatherChatContext(client, sessionId, clientId, projectId);

    // Build system prompt with tools
    const systemPrompt = `You are an AI assistant for a real estate financing application. You help users manage clients, projects, documents, knowledge bank entries, and notes.

CRITICAL: You have access to tools that let you actually retrieve and modify data. You MUST use these tools to answer user questions - don't just say you will do something, actually DO IT by calling the appropriate tool.

TOOL CALLING FORMAT:
When you need to use a tool, you MUST include this EXACT format in your response:
<TOOL_CALL>
{
  "name": "toolName",
  "arguments": {
    "arg1": "value1",
    "arg2": "value2"
  }
}
</TOOL_CALL>

EXAMPLE CONVERSATIONS:

User: "Show me all active clients"
Assistant: Let me search for active clients for you.
<TOOL_CALL>
{
  "name": "searchClients",
  "arguments": {
    "status": "active"
  }
}
</TOOL_CALL>

User: "What projects does ABC Company have?"
Assistant: I'll search for projects for ABC Company. First, let me find the client.
<TOOL_CALL>
{
  "name": "searchClients",
  "arguments": {
    "searchTerm": "ABC Company"
  }
}
</TOOL_CALL>

User: "Create a new client named XYZ Corp"
Assistant: I'll create a new client named XYZ Corp for you. Please confirm the following details:
<TOOL_CALL>
{
  "name": "createClient",
  "arguments": {
    "name": "XYZ Corp"
  }
}
</TOOL_CALL>

AVAILABLE TOOLS:
${CHAT_TOOLS.map(tool => `
- ${tool.name}: ${tool.description}
  Parameters: ${JSON.stringify(tool.parameters.properties, null, 2)}
  Required: ${JSON.stringify(tool.parameters.required)}
  Requires Confirmation: ${tool.requiresConfirmation}
`).join('\n')}

IMPORTANT RULES:
1. ALWAYS use tools when users ask for information or actions - don't just describe what you would do
2. When a tool requires confirmation (requiresConfirmation: true), explain what will happen and the tool call will create a confirmation prompt
3. For read-only tools (requiresConfirmation: false), call them immediately to get real data
4. Include the <TOOL_CALL> tags EXACTLY as shown in examples
5. You can provide conversational text before or after the tool call
6. Always use the context provided to give personalized assistance

${context}`;

    // Build messages array
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: message,
      },
    ];

    // Call Together AI
    const response = await fetch(TOGETHER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
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

    // Parse tool calls from response
    const toolCalls = parseToolCalls(aiResponse);
    
    // Remove tool call syntax from the display content
    let displayContent = aiResponse.replace(/<TOOL_CALL>\s*[\s\S]*?\s*<\/TOOL_CALL>/g, '').trim();

    // Execute read-only tools immediately and feed results back to AI
    const toolResults: Array<{ toolCallId: string; toolName: string; result: any }> = [];
    const activityLog: Array<{ activity: string; timestamp: string }> = [];
    const pendingActions: Array<{
      toolName: string;
      parameters: any;
      requiresConfirmation: boolean;
    }> = [];

    if (toolCalls) {
      for (const toolCall of toolCalls) {
        const tool = CHAT_TOOLS.find(t => t.name === toolCall.name);
        if (tool) {
          const params = JSON.parse(toolCall.arguments);
          
          if (tool.requiresConfirmation) {
            // Add to pending actions for user confirmation
            pendingActions.push({
              toolName: toolCall.name,
              parameters: params,
              requiresConfirmation: true,
            });
          } else {
            // Execute read-only tool immediately
            const activityMessage = getActivityMessage(toolCall.name, params);
            activityLog.push({
              activity: activityMessage,
              timestamp: new Date().toISOString(),
            });
            
            try {
              const result = await executeTool(toolCall.name, params, client);
              toolResults.push({
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                result: result,
              });
            } catch (error) {
              console.error(`Error executing tool ${toolCall.name}:`, error);
              toolResults.push({
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                result: { error: error instanceof Error ? error.message : 'Unknown error' },
              });
            }
          }
        }
      }
    }

    // If we executed tools, feed results back to AI for final response
    if (toolResults.length > 0) {
      console.log('[Chat API] Executed tools, getting final response from AI...');
      
      let iterationCount = 0;
      const maxIterations = 3; // Prevent infinite loops
      let currentMessages = [...messages];
      let currentAiResponse = aiResponse;
      let finalContent = '';
      let totalTokens = data.usage?.total_tokens || 0;

      // Keep iterating until AI stops calling tools or we hit max iterations
      while (iterationCount < maxIterations) {
        iterationCount++;
        console.log(`[Chat API] Iteration ${iterationCount}: Processing ${toolResults.length} tool results`);
        
        // Build a message with tool results
        const toolResultsMessage = toolResults.map(tr => {
          return `Tool: ${tr.toolName}\nResult: ${JSON.stringify(tr.result, null, 2)}`;
        }).join('\n\n');

        // Call AI again with tool results
        const followUpResponse = await fetch(TOGETHER_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: MODEL_NAME,
            messages: [
              ...currentMessages,
              {
                role: 'assistant',
                content: currentAiResponse,
              },
              {
                role: 'user',
                content: `TOOL RESULTS:\n${toolResultsMessage}\n\nBased on these tool results, analyze what information you have and what's still needed:

CRITICAL INSTRUCTIONS:
1. If the user asked for a "summary" or comprehensive information, you likely need MORE data:
   - If you have a project/client ID, call searchDocuments or getKnowledgeBank to get related documents
   - If you see documents, you may need to get their details or extracted data
   - Keep calling tools until you have enough information for a complete answer

2. When you have enough information, provide a clear, human-readable answer:
   - Use bullet points, lists, and structured formatting
   - Do NOT show raw object notation like "[object Object]" or raw field names
   - Format dates nicely (e.g., "November 10, 2025" not "2025-11-10T23:52:57.981Z")
   - Present data in a user-friendly way
   - For summaries, include: key details, status, related documents, important numbers/dates

3. IMPORTANT - When creating NOTES (via createNote tool):
   - Use PLAIN TEXT formatting without markdown symbols
   - Use simple line breaks and indentation for structure
   - DO NOT use ###, **, *, or other markdown syntax in note content
   - Structure with clear sections using line breaks and simple dashes/bullets
   - Example good note format:
     
     PROJECT OVERVIEW
     Project Name: Lonnen Road
     Project ID: abc123
     Status: Active
     
     KEY INFORMATION
     - The project is associated with a primary client
     - Total costs: £2,193,999.63
     - Created: November 10, 2025

4. If you need more information, call the appropriate tool now using <TOOL_CALL> tags.`,
              },
            ],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });

        if (!followUpResponse.ok) {
          const errorText = await followUpResponse.text();
          console.error('[Chat API] Follow-up API error:', followUpResponse.status, errorText);
          throw new Error(`Failed to get follow-up response from AI: ${followUpResponse.status}`);
        }

        const followUpData = await followUpResponse.json();
        const followUpContent = followUpData.choices[0]?.message?.content || '';
        totalTokens += followUpData.usage?.total_tokens || 0;

        console.log('[Chat API] Follow-up response received, length:', followUpContent.length);

        // Check for more tool calls in follow-up
        const followUpToolCalls = parseToolCalls(followUpContent);
        finalContent = followUpContent.replace(/<TOOL_CALL>\s*[\s\S]*?\s*<\/TOOL_CALL>/g, '').trim();

        console.log('[Chat API] Found', followUpToolCalls?.length || 0, 'tool calls in follow-up');

        // If no more tool calls, we're done
        if (!followUpToolCalls || followUpToolCalls.length === 0) {
          console.log('[Chat API] No more tool calls, finishing');
          break;
        }

        // Clear previous tool results and execute new ones
        toolResults.length = 0;

        // Execute any additional read-only tool calls
        for (const toolCall of followUpToolCalls) {
          const tool = CHAT_TOOLS.find(t => t.name === toolCall.name);
          if (tool && !tool.requiresConfirmation) {
            const activityMessage = getActivityMessage(toolCall.name, JSON.parse(toolCall.arguments));
            activityLog.push({
              activity: activityMessage,
              timestamp: new Date().toISOString(),
            });
            
            try {
              const result = await executeTool(toolCall.name, JSON.parse(toolCall.arguments), client);
              toolResults.push({
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                result: result,
              });
              console.log('[Chat API] Executed tool:', toolCall.name);
            } catch (error) {
              console.error(`[Chat API] Error executing follow-up tool ${toolCall.name}:`, error);
              toolResults.push({
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                result: { error: error instanceof Error ? error.message : 'Unknown error' },
              });
            }
          } else if (tool && tool.requiresConfirmation) {
            pendingActions.push({
              toolName: toolCall.name,
              parameters: JSON.parse(toolCall.arguments),
              requiresConfirmation: true,
            });
          }
        }

        // If we have pending actions requiring confirmation, stop here
        if (pendingActions.length > 0) {
          console.log('[Chat API] Have pending actions, stopping iteration');
          break;
        }

        // If no new tool results, we're done
        if (toolResults.length === 0) {
          console.log('[Chat API] No new tool results, finishing');
          break;
        }

        // Update messages for next iteration
        currentMessages = [
          ...currentMessages,
          {
            role: 'assistant',
            content: currentAiResponse,
          },
          {
            role: 'user',
            content: `TOOL RESULTS:\n${toolResultsMessage}`,
          },
        ];
        currentAiResponse = followUpContent;
      }

      console.log('[Chat API] Completed after', iterationCount, 'iterations');

      return NextResponse.json({
        content: finalContent || currentAiResponse,
        toolCalls: toolCalls || [],
        activityLog,
        pendingActions,
        tokensUsed: totalTokens,
      });
    }

    return NextResponse.json({
      content: displayContent || aiResponse,
      toolCalls: toolCalls || [],
      activityLog,
      pendingActions,
      tokensUsed: data.usage?.total_tokens || 0,
    });
  } catch (error) {
    console.error('Chat Assistant API error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process chat request',
      },
      { status: 500 }
    );
  }
}

