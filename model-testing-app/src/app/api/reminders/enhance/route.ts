import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { enhanceReminderText } from '@/lib/reminderEnhancement';
import { api } from '../../../../../convex/_generated/api';

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
    const { reminderText } = body;

    if (!reminderText || !reminderText.trim()) {
      return NextResponse.json(
        { error: 'Reminder text is required' },
        { status: 400 }
      );
    }

    // Get clients and projects for context
    const clients = await client.query(api.clients.list, {});
    const projects = await client.query(api.projects.list, {});

    // Build clients with projects structure
    const clientsWithProjects = clients.map(client => ({
      id: client._id,
      name: client.name,
      projects: projects
        .filter(p => p.clientRoles?.some((cr: any) => cr.clientId === client._id))
        .map(p => ({ id: p._id, name: p.name })),
    }));

    // Enhance reminder text with LLM
    const enhancement = await enhanceReminderText(reminderText, clientsWithProjects);

    return NextResponse.json(enhancement);
  } catch (error) {
    console.error('Error enhancing reminder:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enhance reminder' },
      { status: 500 }
    );
  }
}

