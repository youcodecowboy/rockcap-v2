import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../../convex/_generated/api';
import { addDays, addHours, setHours, setMinutes } from 'date-fns';

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const MODEL_NAME = 'openai/gpt-oss-20b'; // GPT-OSS-20B via Together.ai

export const runtime = 'nodejs';
export const maxDuration = 60;

// Helper function to extract time from text
function extractTime(text: string): { hours: number; minutes: number } | null {
  const lowerText = text.toLowerCase();
  
  // Improved regex to match various time formats: "at 3pm", "3pm", "at 3:00pm", "3:00pm", "at 15:00", etc.
  const timePatterns = [
    // Pattern 1: "at 3pm", "3pm", "at 3:00pm", "3:00pm" - with AM/PM (most common)
    /(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i,
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i,  // Without "at" prefix
    // Pattern 2: "at 15:00", "15:30" - 24-hour format
    /(?:at|@)\s*(\d{1,2}):(\d{2})/i,
  ];
  
  for (const pattern of timePatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      let hours = parseInt(match[1]);
      const minutes = match[2] ? parseInt(match[2]) : 0;
      const ampm = match[3]?.toLowerCase();
      
      // Convert to 24-hour format if AM/PM specified
      if (ampm) {
        if (ampm === 'pm' && hours !== 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        return { hours, minutes };
      } else {
        // For 24-hour format pattern, assume it's already 24-hour
        // Only use if hours are reasonable (0-23)
        if (hours >= 0 && hours <= 23) {
          return { hours, minutes };
        }
      }
    }
  }
  
  return null;
}

// Helper function to parse natural language dates/times
function parseNaturalDateTime(text: string): Date | null {
  const now = new Date();
  const lowerText = text.toLowerCase().trim();
  
  // Handle "tomorrow" or "tomorrow at [time]" or "at [time] tomorrow"
  if (lowerText.includes('tomorrow')) {
    let targetDate = addDays(now, 1);
    
    const extractedTime = extractTime(text);
    if (extractedTime) {
      targetDate = setHours(targetDate, extractedTime.hours);
      targetDate = setMinutes(targetDate, extractedTime.minutes);
    }
    
    return targetDate;
  }
  
  // Handle "today at [time]" or "at [time] today"
  if (lowerText.includes('today')) {
    let targetDate = new Date(now);
    
    const extractedTime = extractTime(text);
    if (extractedTime) {
      targetDate = setHours(targetDate, extractedTime.hours);
      targetDate = setMinutes(targetDate, extractedTime.minutes);
      
      // If time has passed today, assume tomorrow
      if (targetDate.getTime() < now.getTime()) {
        targetDate = addDays(targetDate, 1);
      }
    }
    
    return targetDate;
  }
  
  // Handle standalone time (e.g., "at 3pm" without "today" or "tomorrow")
  const extractedTime = extractTime(text);
  if (extractedTime) {
    let targetDate = new Date(now);
    targetDate = setHours(targetDate, extractedTime.hours);
    targetDate = setMinutes(targetDate, extractedTime.minutes);
    
    // If time has passed today, assume tomorrow
    if (targetDate.getTime() < now.getTime()) {
      targetDate = addDays(targetDate, 1);
    }
    
    return targetDate;
  }
  
  // Handle "in X hours"
  const hoursMatch = lowerText.match(/in\s+(\d+)\s+hours?/i);
  if (hoursMatch) {
    return addHours(now, parseInt(hoursMatch[1]));
  }
  
  // Handle "in X days"
  const daysMatch = lowerText.match(/in\s+(\d+)\s+days?/i);
  if (daysMatch) {
    return addDays(now, parseInt(daysMatch[1]));
  }
  
  return null;
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
    const { reminderDescription } = body;

    if (!reminderDescription || !reminderDescription.trim()) {
      return NextResponse.json(
        { error: 'Reminder description is required' },
        { status: 400 }
      );
    }

    // Get current user
    const currentUser = await client.query(api.users.getCurrent, {});
    
    // Get clients and projects for context
    const clients = await client.query(api.clients.list, {});
    const projects = await client.query(api.projects.list, {});

    // Build clients with projects structure
    const clientsWithProjects = clients.map(client => ({
      _id: client._id,
      id: client._id,
      name: client.name,
      companyName: client.companyName || '',
      projects: projects
        .filter(p => p.clientRoles?.some((cr: any) => cr.clientId === client._id))
        .map(p => ({ _id: p._id, id: p._id, name: p.name })),
    }));

    // Create a detailed client/project list
    const clientProjectList = clientsWithProjects.map(client => {
      const projects = client.projects.length > 0 
        ? ` (Projects: ${client.projects.map(p => p.name).join(', ')})`
        : '';
      const companyAlias = client.companyName && client.companyName !== client.name
        ? ` [Also known as: ${client.companyName}]`
        : '';
      return `${client.name}${companyAlias}${projects}`;
    }).join('\n') || 'None available';

    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY environment variable is not set');
    }

    const prompt = `You are an AI assistant helping users create reminders for a real estate financing company. You are POWERFUL and INTELLIGENT - match client/project names even with partial matches, typos, or variations.

CONTEXT:
- This is a real estate financing company
- Reminders can be associated with clients and their projects
- Reminders are time-sensitive notifications
- Current user ID: ${currentUser?._id || 'unknown'}

AVAILABLE CLIENTS AND THEIR PROJECTS:
${clientProjectList}

REMINDER DESCRIPTION:
${reminderDescription}

PARSING REQUIREMENTS:
Parse the reminder description and extract the following information:

1. Title: Extract a clear, concise reminder title (required)
2. Description: Extract or generate a detailed description of what the reminder is for
3. Scheduled Time: Extract the time/date when reminder should trigger (CRITICAL - BE PRECISE):
   - Look for: "at [time]", "on [date]", "by [date]", "tomorrow", "tomorrow at [time]", "today at [time]", "next week", "in X hours", "in X days"
   - Handle times like "18:00", "6pm", "6:00 PM", "at 6", "at 3pm", "at 3:00pm", "at 15:00"
   - IMPORTANT: "tomorrow at 3pm" means tomorrow's date at 3:00 PM (15:00)
   - IMPORTANT: "today at 3pm" means today's date at 3:00 PM (15:00), but if that time has passed, use tomorrow
   - Return ISO timestamp format (REQUIRED for reminders) - MUST be a valid ISO 8601 string
   - If only time is mentioned (e.g., "at 18:00"), use today's date with that time (or tomorrow if time has passed)
   - Default to 1 hour from now if no time is specified
   - Current date/time context: ${new Date().toISOString()}
4. Client Matching (CRITICAL - BE SMART):
   - Match client names even with partial matches, typos, or variations
   - Check both client.name and client.companyName fields
   - Examples: "Kristian" should match "Kristian Hansen", "Hansen" should match "Kristian Hansen"
   - Return the EXACT client ID from the available list if matched
5. Project Matching (CRITICAL - BE SMART):
   - Match project names even with partial matches
   - Projects can be referenced by name, address, or loan number
   - Return the EXACT project ID from the available list if matched
6. Notes: Extract any additional context

Respond with a JSON object in this EXACT format:
{
  "title": "Clear reminder title",
  "description": "Detailed description of what to remember",
  "scheduledTime": "ISO timestamp (REQUIRED)",
  "clientId": "client ID if found, or null",
  "clientName": "client name if found, or null",
  "projectId": "project ID if found, or null",
  "projectName": "project name if found, or null",
  "notes": "Additional notes or context"
}

CRITICAL MATCHING INSTRUCTIONS:
- BE GENEROUS with client/project matching - if you see ANY similarity, match it
- Check partial names: "Kristian" matches "Kristian Hansen"
- Check company names: if company name matches, use that client
- Check project names: match even partial project names
- For dates/times: Convert "today at 18:00" to today's date with 18:00 time
- Always respond with valid JSON only
- scheduledTime is REQUIRED - default to 1 hour from now if not specified
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
            content: 'You are a helpful assistant that parses reminder descriptions for a real estate financing company. Always respond with valid JSON only. Be precise with client and project names - use exact matches when available.',
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
    
    // Check if the description contains natural language date/time keywords
    const lowerDescription = reminderDescription.toLowerCase();
    const hasNaturalLanguageDate = 
      lowerDescription.includes('tomorrow') ||
      lowerDescription.includes('today') ||
      lowerDescription.includes('at ') ||
      lowerDescription.match(/\d{1,2}(:\d{2})?\s*(am|pm)/i) !== null ||
      lowerDescription.includes('in ') && (lowerDescription.includes('hour') || lowerDescription.includes('day'));
    
    // ALWAYS try natural language parsing first if keywords detected - it's more reliable
    const naturalLanguageDate = parseNaturalDateTime(reminderDescription);
    
    // Post-process: Validate and fix scheduledTime
    if (hasNaturalLanguageDate && naturalLanguageDate) {
      // If we detected natural language keywords and parsed successfully, ALWAYS use it
      result.scheduledTime = naturalLanguageDate.toISOString();
    } else if (result.scheduledTime) {
      try {
        // Try to parse the scheduledTime from LLM
        let scheduledDate = new Date(result.scheduledTime);
        
        // If invalid date, try natural language parsing or default to 1 hour from now
        if (isNaN(scheduledDate.getTime())) {
          if (naturalLanguageDate) {
            result.scheduledTime = naturalLanguageDate.toISOString();
          } else {
            scheduledDate = addHours(new Date(), 1);
            result.scheduledTime = scheduledDate.toISOString();
          }
        } else {
          // Ensure it's a valid ISO string
          result.scheduledTime = scheduledDate.toISOString();
        }
      } catch (error) {
        // If parsing fails, try natural language parsing or default to 1 hour from now
        if (naturalLanguageDate) {
          result.scheduledTime = naturalLanguageDate.toISOString();
        } else {
          result.scheduledTime = addHours(new Date(), 1).toISOString();
        }
      }
    } else {
      // No scheduledTime provided, try natural language parsing or default to 1 hour from now
      if (naturalLanguageDate) {
        result.scheduledTime = naturalLanguageDate.toISOString();
      } else {
        result.scheduledTime = addHours(new Date(), 1).toISOString();
      }
    }
    
    // Post-process: Improve client/project matching with fuzzy search
    if (!result.clientId && result.clientName) {
      const clientNameLower = result.clientName.toLowerCase();
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
    console.error('Error parsing reminder:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse reminder' },
      { status: 500 }
    );
  }
}

