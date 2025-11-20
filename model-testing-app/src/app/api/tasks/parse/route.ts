import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../../convex/_generated/api';

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const MODEL_NAME = 'openai/gpt-oss-20b'; // GPT-OSS-20B via Together.ai

export const runtime = 'nodejs';
export const maxDuration = 60;

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
    const { taskDescription } = body;

    if (!taskDescription || !taskDescription.trim()) {
      return NextResponse.json(
        { error: 'Task description is required' },
        { status: 400 }
      );
    }

    // Get current user for "me" assignment
    const currentUser = await client.query(api.users.getCurrent, {});
    
    // Get clients, projects, and user tags for context
    const clients = await client.query(api.clients.list, {});
    const projects = await client.query(api.projects.list, {});
    const userTags = await client.query(api.userTags.get, {});

    // Build clients with projects structure - include company names for better matching
    const clientsWithProjects = clients.map(client => ({
      _id: client._id,
      id: client._id, // Keep both for compatibility
      name: client.name,
      companyName: client.companyName || '',
      projects: projects
        .filter(p => p.clientRoles?.some((cr: any) => cr.clientId === client._id))
        .map(p => ({ _id: p._id, id: p._id, name: p.name })),
    }));

    // Create a more detailed client/project list with aliases
    const clientProjectList = clientsWithProjects.map(client => {
      const projects = client.projects.length > 0 
        ? ` (Projects: ${client.projects.map(p => p.name).join(', ')})`
        : '';
      const companyAlias = client.companyName && client.companyName !== client.name
        ? ` [Also known as: ${client.companyName}]`
        : '';
      return `${client.name}${companyAlias}${projects}`;
    }).join('\n') || 'None available';

    // Create a search-friendly list for fuzzy matching
    const clientSearchList = clientsWithProjects.map(client => ({
      id: client._id,
      names: [client.name, client.companyName].filter(Boolean),
      projects: client.projects.map(p => ({ id: p._id, name: p.name })),
    }));

    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY environment variable is not set');
    }

    const prompt = `You are an AI assistant helping users create tasks for a real estate financing company. You are POWERFUL and INTELLIGENT - match client/project names even with partial matches, typos, or variations.

CONTEXT:
- This is a real estate financing company
- Tasks can be associated with clients and their projects
- Projects are property-specific (e.g., addresses, property names, loan numbers)
- Current user ID: ${currentUser?._id || 'unknown'} (use this for "me" or "myself" assignments)

AVAILABLE CLIENTS AND THEIR PROJECTS:
${clientProjectList}

USER TAG LIBRARY (use these tags when matching natural language):
${userTags.join(', ')}

TASK DESCRIPTION:
${taskDescription}

PARSING REQUIREMENTS:
Parse the task description and extract the following information:

1. Title: Extract a clear, concise task title (required)
2. Description: Extract or generate a detailed description of what needs to happen
3. Priority: Determine priority from context:
   - "high" if urgent, critical, ASAP, important, deadline mentioned, "asap", "urgent"
   - "medium" if normal priority (default)
   - "low" if not urgent, optional, nice to have
4. Due Date: Extract any date/time mentioned:
   - Look for: "by [date]", "due [date]", "on [date]", "before [date]", "at [time]", "next week", "tomorrow", "today", "in X hours", "in X days"
   - Handle times like "18:00", "6pm", "6:00 PM", "at 6", etc.
   - Return ISO timestamp format if date/time found, null otherwise
   - If only time is mentioned (e.g., "at 18:00"), use today's date with that time
5. Client Matching (CRITICAL - BE SMART):
   - Match client names even with partial matches, typos, or variations
   - Check both client.name and client.companyName fields
   - Examples: "Kristian" should match "Kristian Hansen", "Hansen" should match "Kristian Hansen"
   - If you see ANY client name mentioned, try to match it - be generous with matching
   - Return the EXACT client ID from the available list if matched
6. Project Matching (CRITICAL - BE SMART):
   - Match project names even with partial matches
   - Projects can be referenced by name, address, or loan number
   - If a project name is mentioned, match it to available projects
   - Return the EXACT project ID from the available list if matched
7. Assignment:
   - If user says "me", "myself", "assign to me", or similar, set "assignedToMe" to true
   - Otherwise, set "assignedToMe" to false
8. Reminder Detection:
   - If user says "remind me", "set a reminder", "reminder", "remind", set "hasReminder" to true
   - Extract reminder time/date if mentioned separately from task due date
   - Set "reminderTime" if a specific reminder time is mentioned
9. Tags: Extract relevant tags/keywords from the description (array of strings)
   - Match tags from the USER TAG LIBRARY when possible (e.g., "send an email" → "email")
   - Use existing tags from the library when they match the description
   - Be smart about matching: "email" matches "send email", "emailing", "emailed", etc.
10. Notes: Extract any additional context or notes

Respond with a JSON object in this EXACT format:
{
  "title": "Clear task title",
  "description": "Detailed description of what needs to happen",
  "priority": "high" | "medium" | "low",
  "dueDate": "ISO timestamp or null",
  "clientId": "client ID if found, or null",
  "clientName": "client name if found, or null",
  "projectId": "project ID if found, or null",
  "projectName": "project name if found, or null",
  "assignedToMe": true | false,
  "hasReminder": true | false,
  "reminderTime": "ISO timestamp or null (if reminder time mentioned separately)",
  "tags": ["tag1", "tag2"],
  "notes": "Additional notes or context"
}

CRITICAL MATCHING INSTRUCTIONS:
- BE GENEROUS with client/project matching - if you see ANY similarity, match it
- Check partial names: "Kristian" matches "Kristian Hansen"
- Check company names: if company name matches, use that client
- Check project names: match even partial project names
- For dates: Convert "today at 18:00" to today's date with 18:00 time
- For reminders: If "remind me" is mentioned, set hasReminder to true
- For assignment: "me" or "myself" means assignedToMe = true
- Always respond with valid JSON only
- Be CONFIDENT in your matches - if you see a client/project name, match it!`;

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
            content: 'You are a helpful assistant that parses task descriptions for a real estate financing company. Always respond with valid JSON only. Be precise with client and project names - use exact matches when available.',
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

    if (!content) {
      throw new Error('No response content from Together.ai API');
    }

    // Extract JSON from response
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
    }

    const result = JSON.parse(jsonContent);
    
    // Post-process: Improve client/project matching with fuzzy search
    // If LLM didn't find exact matches, try fuzzy matching
    if (!result.clientId && result.clientName) {
      const clientNameLower = result.clientName.toLowerCase();
      // Try to find partial matches
      for (const client of clientsWithProjects) {
        const nameMatch = client.name.toLowerCase().includes(clientNameLower) || 
                         clientNameLower.includes(client.name.toLowerCase());
        const companyMatch = client.companyName && (
          client.companyName.toLowerCase().includes(clientNameLower) ||
          clientNameLower.includes(client.companyName.toLowerCase())
        );
        
        if (nameMatch || companyMatch) {
          result.clientId = client._id;
          result.clientName = client.name;
          break;
        }
      }
    }
    
    // Fuzzy match projects if client is found but project isn't
    if (result.clientId && !result.projectId && result.projectName) {
      const client = clientsWithProjects.find(c => c._id === result.clientId);
      if (client) {
        const projectNameLower = result.projectName.toLowerCase();
        for (const project of client.projects) {
          if (project.name.toLowerCase().includes(projectNameLower) ||
              projectNameLower.includes(project.name.toLowerCase())) {
            result.projectId = project._id;
            result.projectName = project.name;
            break;
          }
        }
      }
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error parsing task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse task' },
      { status: 500 }
    );
  }
}

