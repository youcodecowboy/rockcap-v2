import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getToolRegistry, executeTool } from '@/lib/tools';
import { getAuthenticatedConvexClient, requireAuth } from '@/lib/auth';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { getAllClientFields, getAllProjectFields } from '@/components/intelligence/fieldDefinitions';
import { getCategoryForField } from '@/components/intelligence/intelligenceUtils';

const MODEL = 'claude-haiku-4-5-20251001';

export const runtime = 'nodejs';
export const maxDuration = 60;

// =============================================================================
// INTELLIGENCE SUMMARY
// =============================================================================

/**
 * Build a compact intelligence summary (~200-300 tokens) instead of dumping
 * full intelligence records (10,000-25,000 tokens).
 * Shows filled/total counts per category and flags missing critical fields.
 */
function buildIntelligenceSummary(
  clientIntel: any | null,
  projectIntel: any | null,
  clientName: string,
  clientType: string,
  projectName?: string,
): string {
  const lines: string[] = [];

  if (clientIntel) {
    lines.push(`Client Intelligence Summary (${clientName}, ${clientType}):`);
    const isLender = clientType === 'lender';
    const allFields = getAllClientFields(isLender);

    const categoryMap = new Map<string, { filled: number; total: number; criticalMissing: string[] }>();

    for (const field of allFields) {
      const category = getCategoryForField(field.key);
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { filled: 0, total: 0, criticalMissing: [] });
      }
      const cat = categoryMap.get(category)!;
      cat.total++;

      const parts = field.key.split('.');
      let value: any = clientIntel;
      for (const part of parts) {
        value = value?.[part];
      }

      if (value != null && value !== '') {
        cat.filled++;
      } else if (field.priority === 'critical') {
        cat.criticalMissing.push(field.label);
      }
    }

    for (const [category, stats] of categoryMap) {
      let line = `- ${category}: ${stats.filled}/${stats.total} filled`;
      if (stats.criticalMissing.length > 0) {
        line += ` [missing critical: ${stats.criticalMissing.join(', ')}]`;
      }
      lines.push(line);
    }
  }

  if (projectIntel && projectName) {
    lines.push('');
    lines.push(`Project Intelligence (${projectName}):`);
    const allFields = getAllProjectFields();
    const categoryMap = new Map<string, { filled: number; total: number; criticalMissing: string[] }>();

    for (const field of allFields) {
      const category = getCategoryForField(field.key);
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { filled: 0, total: 0, criticalMissing: [] });
      }
      const cat = categoryMap.get(category)!;
      cat.total++;

      const parts = field.key.split('.');
      let value: any = projectIntel;
      for (const part of parts) {
        value = value?.[part];
      }

      if (value != null && value !== '') {
        cat.filled++;
      } else if (field.priority === 'critical') {
        cat.criticalMissing.push(field.label);
      }
    }

    for (const [category, stats] of categoryMap) {
      let line = `- ${category}: ${stats.filled}/${stats.total} filled`;
      if (stats.criticalMissing.length > 0) {
        line += ` [missing critical: ${stats.criticalMissing.join(', ')}]`;
      }
      lines.push(line);
    }
  }

  if (lines.length > 0) {
    lines.push('');
    lines.push('Use queryIntelligence tool to look up specific values.');
  }

  return lines.join('\n');
}

// =============================================================================
// CONTEXT GATHERING
// =============================================================================

/**
 * Gather comprehensive context for the chat based on session context.
 * Uses caching to avoid re-gathering data on every request.
 */
async function gatherChatContext(
  client: any,
  sessionId: string,
  clientId?: string,
  projectId?: string
): Promise<string> {
  if (!clientId && !projectId) {
    return '';
  }

  const contextType = clientId ? 'client' : 'project';
  const contextId = (clientId || projectId) as string;

  try {
    // Check cache first
    const cached = await client.query(api.contextCache.get, {
      contextType,
      contextId,
    });

    if (cached) {
      const isValid = await client.query(api.contextCache.isValid, {
        contextType,
        contextId,
      });

      if (isValid) {
        return cached.cachedContext;
      }
    }

    // Cache miss or invalid — build fresh context
    let context = '';
    let metadata = {
      knowledgeBankCount: 0,
      documentsCount: 0,
      notesCount: 0,
      contactsCount: 0,
      dealsCount: 0,
      tasksCount: 0,
      eventsCount: 0,
      lastDataUpdate: new Date(0).toISOString(),
    };

    if (clientId) {
      // -----------------------------------------------------------------------
      // CLIENT CONTEXT
      // -----------------------------------------------------------------------
      const clientData = await client.query(api.clients.get, {
        id: clientId as Id<"clients">,
      });

      if (clientData) {
        context += `\n\n=== CLIENT CONTEXT ===\n`;
        context += `Name: ${clientData.name}\n`;
        if (clientData.type) context += `Type: ${clientData.type}\n`;
        if (clientData.status) context += `Status: ${clientData.status}\n`;
        if (clientData.companyName) context += `Company: ${clientData.companyName}\n`;
        if (clientData.email) context += `Email: ${clientData.email}\n`;
        if (clientData.phone) context += `Phone: ${clientData.phone}\n`;
        if (clientData.address) context += `Address: ${clientData.address}\n`;
        if (clientData.city) context += `City: ${clientData.city}\n`;
        if (clientData.state) context += `State: ${clientData.state}\n`;
        if (clientData.zip) context += `ZIP: ${clientData.zip}\n`;
        if (clientData.country) context += `Country: ${clientData.country}\n`;
        if (clientData.website) context += `Website: ${clientData.website}\n`;
        if (clientData.industry) context += `Industry: ${clientData.industry}\n`;
        if (clientData.tags && clientData.tags.length > 0) {
          context += `Tags: ${clientData.tags.join(', ')}\n`;
        }
        if (clientData.notes) context += `Notes: ${clientData.notes}\n`;
        if (clientData.lastContactDate) context += `Last Contact: ${clientData.lastContactDate}\n`;
      }

      // Client Intelligence (lightweight summary — full data via queryIntelligence tool)
      try {
        const clientIntelligence = await client.query(api.intelligence.getClientIntelligence, {
          clientId: clientId as Id<"clients">,
        });

        if (clientIntelligence) {
          const summary = buildIntelligenceSummary(
            clientIntelligence,
            null,
            clientData?.name || 'Unknown',
            clientData?.type || 'borrower',
          );
          if (summary) {
            context += `\n\n=== CLIENT INTELLIGENCE ===\n`;
            context += summary;
          }

          metadata.knowledgeBankCount = 1;
          if (clientIntelligence.lastUpdated) {
            const intDate = new Date(clientIntelligence.lastUpdated);
            if (intDate > new Date(metadata.lastDataUpdate)) {
              metadata.lastDataUpdate = intDate.toISOString();
            }
          }
        }
      } catch (e) {
        console.log('No intelligence data found for client:', clientId);
      }

      // Documents
      const documents = await client.query(api.documents.list, {
        clientId: clientId as Id<"clients">,
        status: 'completed',
      });
      metadata.documentsCount = documents?.length || 0;
      if (documents && documents.length > 0) {
        context += `\n\n=== DOCUMENTS (${documents.length} documents) ===\n`;
        const sortedDocs = [...documents].sort((a: any, b: any) =>
          new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
        );
        sortedDocs.forEach((doc: any) => {
          const docDate = new Date(doc.savedAt);
          if (docDate > new Date(metadata.lastDataUpdate)) {
            metadata.lastDataUpdate = docDate.toISOString();
          }
          context += `\n[${doc.category}] ${doc.fileName} (${new Date(doc.savedAt).toLocaleDateString()})\n`;
          context += `Summary: ${doc.summary}\n`;
          if (doc.extractedData) {
            const extractedStr = JSON.stringify(doc.extractedData);
            if (extractedStr.length < 500) {
              context += `Extracted Data: ${extractedStr}\n`;
            } else {
              context += `Extracted Data: ${extractedStr.substring(0, 500)}...\n`;
            }
          }
        });
      }

      // Notes
      const notes = await client.query(api.notes.getAll, {
        clientId: clientId as Id<"clients">,
      });
      metadata.notesCount = notes?.length || 0;
      if (notes && notes.length > 0) {
        context += `\n\n=== NOTES (${notes.length} notes) ===\n`;
        const sortedNotes = [...notes].sort((a: any, b: any) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        sortedNotes.forEach((note: any) => {
          const noteDate = new Date(note.updatedAt);
          if (noteDate > new Date(metadata.lastDataUpdate)) {
            metadata.lastDataUpdate = noteDate.toISOString();
          }
          context += `\n${note.title || 'Untitled'} (${new Date(note.updatedAt).toLocaleDateString()})\n`;
          const noteText = extractTextFromNoteContent(note.content);
          if (noteText) {
            context += `Content: ${noteText.substring(0, 500)}${noteText.length > 500 ? '...' : ''}\n`;
          }
          if (note.tags && note.tags.length > 0) {
            context += `Tags: ${note.tags.join(', ')}\n`;
          }
        });
      }

      // Contacts
      const contacts = await client.query(api.contacts.getByClient, {
        clientId: clientId as Id<"clients">,
      });
      metadata.contactsCount = contacts?.length || 0;
      if (contacts && contacts.length > 0) {
        context += `\n\n=== CONTACTS (${contacts.length} contacts) ===\n`;
        contacts.forEach((contact: any) => {
          context += `\n${contact.name}`;
          if (contact.role) context += ` - ${contact.role}`;
          if (contact.email) context += ` (${contact.email})`;
          if (contact.phone) context += ` - ${contact.phone}`;
          if (contact.company) context += ` at ${contact.company}`;
          if (contact.notes) context += `\n  Notes: ${contact.notes}`;
          context += `\n`;
        });
      }

      // Tasks
      const allTasks = await client.query(api.tasks.getByUser, {
        clientId: clientId as Id<"clients">,
      });
      metadata.tasksCount = allTasks?.length || 0;
      if (allTasks && allTasks.length > 0) {
        context += `\n\n=== TASKS (${allTasks.length} tasks) ===\n`;
        const activeTasks = allTasks.filter((t: any) => t.status !== 'completed' && t.status !== 'cancelled');
        if (activeTasks.length > 0) {
          context += `Active Tasks:\n`;
          activeTasks.slice(0, 20).forEach((task: any) => {
            context += `\n- ${task.title}`;
            if (task.dueDate) context += ` (Due: ${new Date(task.dueDate).toLocaleDateString()})`;
            if (task.priority) context += ` [${task.priority}]`;
            if (task.status) context += ` - ${task.status}`;
            context += `\n`;
          });
        }
      }

      // Events
      const allEvents = await client.query(api.events.list, {
        clientId: clientId as Id<"clients">,
      });
      metadata.eventsCount = allEvents?.length || 0;
      if (allEvents && allEvents.length > 0) {
        context += `\n\n=== EVENTS (${allEvents.length} events) ===\n`;
        const upcomingEvents = allEvents
          .filter((e: any) => new Date(e.startTime) > new Date())
          .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
          .slice(0, 20);
        if (upcomingEvents.length > 0) {
          upcomingEvents.forEach((event: any) => {
            context += `\n${event.title} - ${new Date(event.startTime).toLocaleString()}`;
            if (event.location) context += ` at ${event.location}`;
            if (event.description) context += `\n  ${event.description.substring(0, 200)}`;
            context += `\n`;
          });
        }
      }

      // Document Checklist Summary
      try {
        const checklistSummary = await client.query(api.knowledgeLibrary.getChecklistSummary, {
          clientId: clientId as Id<"clients">,
        });
        if (checklistSummary && checklistSummary.overall.total > 0) {
          const o = checklistSummary.overall;
          context += `\n\n=== DOCUMENT CHECKLIST (${o.total} items) ===\n`;
          context += `Fulfilled: ${o.fulfilled}/${o.total} | Missing: ${o.missing} | Pending Review: ${o.pendingReview}\n`;
          context += `Required: ${o.requiredFulfilled}/${o.required} fulfilled\n`;
          if (checklistSummary.byCategory && Object.keys(checklistSummary.byCategory).length > 0) {
            context += `\nBy Category:\n`;
            Object.entries(checklistSummary.byCategory).forEach(([cat, stats]: [string, any]) => {
              context += `  ${cat}: ${stats.fulfilled}/${stats.total} fulfilled`;
              if (stats.missing > 0) context += ` (${stats.missing} missing)`;
              context += `\n`;
            });
          }
        }
      } catch {
        // Checklist may not exist for this client
      }

      // Reminders
      try {
        const reminders = await client.query(api.reminders.getByUser, {
          clientId: clientId as Id<"clients">,
          status: 'pending' as const,
        });
        if (reminders && reminders.length > 0) {
          context += `\n\n=== REMINDERS (${reminders.length} pending) ===\n`;
          reminders.slice(0, 15).forEach((r: any) => {
            context += `\n${r.title} - Due: ${new Date(r.scheduledFor).toLocaleString()}`;
            if (r.priority) context += ` [${r.priority}]`;
            if (r.description) context += `\n  ${r.description.substring(0, 200)}`;
            context += `\n`;
          });
        }
      } catch {
        // Reminders query may fail without auth context
      }

      // Related Projects
      const allProjects = await client.query(api.projects.list, {});
      const relatedProjects = allProjects?.filter((p: any) =>
        p.clientRoles?.some((cr: any) => cr.clientId === clientId)
      ) || [];
      if (relatedProjects.length > 0) {
        context += `\n\n=== RELATED PROJECTS (${relatedProjects.length} projects) ===\n`;
        relatedProjects.forEach((project: any) => {
          const role = project.clientRoles.find((cr: any) => cr.clientId === clientId)?.role;
          context += `\n${project.name}`;
          if (role) context += ` (Role: ${role})`;
          if (project.status) context += ` - Status: ${project.status}`;
          if (project.loanAmount) context += ` - Loan: ${project.loanAmount}`;
          context += `\n`;
        });
      }

    } else if (projectId) {
      // -----------------------------------------------------------------------
      // PROJECT CONTEXT
      // -----------------------------------------------------------------------
      const projectData = await client.query(api.projects.get, {
        id: projectId as Id<"projects">,
      });

      if (projectData) {
        context += `\n\n=== PROJECT CONTEXT ===\n`;
        context += `Name: ${projectData.name}\n`;
        if (projectData.description) context += `Description: ${projectData.description}\n`;
        if (projectData.status) context += `Status: ${projectData.status}\n`;
        if (projectData.lifecycleStage) context += `Lifecycle Stage: ${projectData.lifecycleStage}\n`;
        if (projectData.address) context += `Address: ${projectData.address}\n`;
        if (projectData.city) context += `City: ${projectData.city}\n`;
        if (projectData.state) context += `State: ${projectData.state}\n`;
        if (projectData.zip) context += `ZIP: ${projectData.zip}\n`;
        if (projectData.country) context += `Country: ${projectData.country}\n`;
        if (projectData.loanAmount) context += `Loan Amount: ${projectData.loanAmount}\n`;
        if (projectData.loanNumber) context += `Loan Number: ${projectData.loanNumber}\n`;
        if (projectData.interestRate) context += `Interest Rate: ${projectData.interestRate}%\n`;
        if (projectData.startDate) context += `Start Date: ${projectData.startDate}\n`;
        if (projectData.endDate) context += `End Date: ${projectData.endDate}\n`;
        if (projectData.expectedCompletionDate) context += `Expected Completion: ${projectData.expectedCompletionDate}\n`;
        if (projectData.tags && projectData.tags.length > 0) {
          context += `Tags: ${projectData.tags.join(', ')}\n`;
        }
        if (projectData.notes) context += `Notes: ${projectData.notes}\n`;
        if (projectData.clientRoles && projectData.clientRoles.length > 0) {
          context += `Client Roles:\n`;
          projectData.clientRoles.forEach((cr: any) => {
            context += `  - Client ID ${cr.clientId}: ${cr.role}\n`;
          });
        }
      }

      // Project Intelligence (lightweight summary — full data via queryIntelligence tool)
      try {
        const projectIntelligence = await client.query(api.intelligence.getProjectIntelligence, {
          projectId: projectId as Id<"projects">,
        });

        if (projectIntelligence) {
          const summary = buildIntelligenceSummary(
            null,
            projectIntelligence,
            '',
            '',
            projectData?.name || 'Unknown',
          );
          if (summary) {
            context += `\n\n=== PROJECT INTELLIGENCE ===\n`;
            context += summary;
          }

          metadata.knowledgeBankCount = 1;
          if (projectIntelligence.lastUpdated) {
            const intDate = new Date(projectIntelligence.lastUpdated);
            if (intDate > new Date(metadata.lastDataUpdate)) {
              metadata.lastDataUpdate = intDate.toISOString();
            }
          }
        }
      } catch (e) {
        console.log('No intelligence data found for project:', projectId);
      }

      // Documents
      const documents = await client.query(api.documents.list, {
        projectId: projectId as Id<"projects">,
        status: 'completed',
      });
      metadata.documentsCount = documents?.length || 0;
      if (documents && documents.length > 0) {
        context += `\n\n=== DOCUMENTS (${documents.length} documents) ===\n`;
        const sortedDocs = [...documents].sort((a: any, b: any) =>
          new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
        );
        sortedDocs.forEach((doc: any) => {
          const docDate = new Date(doc.savedAt);
          if (docDate > new Date(metadata.lastDataUpdate)) {
            metadata.lastDataUpdate = docDate.toISOString();
          }
          context += `\n[${doc.category}] ${doc.fileName} (${new Date(doc.savedAt).toLocaleDateString()})\n`;
          context += `Summary: ${doc.summary}\n`;
          if (doc.extractedData) {
            const extractedStr = JSON.stringify(doc.extractedData);
            if (extractedStr.length < 500) {
              context += `Extracted Data: ${extractedStr}\n`;
            } else {
              context += `Extracted Data: ${extractedStr.substring(0, 500)}...\n`;
            }
          }
        });
      }

      // Notes
      const notes = await client.query(api.notes.getAll, {
        projectId: projectId as Id<"projects">,
      });
      metadata.notesCount = notes?.length || 0;
      if (notes && notes.length > 0) {
        context += `\n\n=== NOTES (${notes.length} notes) ===\n`;
        const sortedNotes = [...notes].sort((a: any, b: any) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        sortedNotes.forEach((note: any) => {
          const noteDate = new Date(note.updatedAt);
          if (noteDate > new Date(metadata.lastDataUpdate)) {
            metadata.lastDataUpdate = noteDate.toISOString();
          }
          context += `\n${note.title || 'Untitled'} (${new Date(note.updatedAt).toLocaleDateString()})\n`;
          const noteText = extractTextFromNoteContent(note.content);
          if (noteText) {
            context += `Content: ${noteText.substring(0, 500)}${noteText.length > 500 ? '...' : ''}\n`;
          }
          if (note.tags && note.tags.length > 0) {
            context += `Tags: ${note.tags.join(', ')}\n`;
          }
        });
      }

      // Tasks
      const allTasks = await client.query(api.tasks.getByUser, {
        projectId: projectId as Id<"projects">,
      });
      metadata.tasksCount = allTasks?.length || 0;
      if (allTasks && allTasks.length > 0) {
        context += `\n\n=== TASKS (${allTasks.length} tasks) ===\n`;
        const activeTasks = allTasks.filter((t: any) => t.status !== 'completed' && t.status !== 'cancelled');
        if (activeTasks.length > 0) {
          context += `Active Tasks:\n`;
          activeTasks.slice(0, 20).forEach((task: any) => {
            context += `\n- ${task.title}`;
            if (task.dueDate) context += ` (Due: ${new Date(task.dueDate).toLocaleDateString()})`;
            if (task.priority) context += ` [${task.priority}]`;
            if (task.status) context += ` - ${task.status}`;
            context += `\n`;
          });
        }
      }

      // Events
      const allEvents = await client.query(api.events.list, {
        projectId: projectId as Id<"projects">,
      });
      metadata.eventsCount = allEvents?.length || 0;
      if (allEvents && allEvents.length > 0) {
        context += `\n\n=== EVENTS (${allEvents.length} events) ===\n`;
        const upcomingEvents = allEvents
          .filter((e: any) => new Date(e.startTime) > new Date())
          .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
          .slice(0, 20);
        if (upcomingEvents.length > 0) {
          upcomingEvents.forEach((event: any) => {
            context += `\n${event.title} - ${new Date(event.startTime).toLocaleString()}`;
            if (event.location) context += ` at ${event.location}`;
            if (event.description) context += `\n  ${event.description.substring(0, 200)}`;
            context += `\n`;
          });
        }
      }

      // Document Checklist (project-level items from parent client)
      try {
        const projectChecklist = await client.query(api.knowledgeLibrary.getChecklistByProject, {
          projectId: projectId as Id<"projects">,
        });
        if (projectChecklist && projectChecklist.length > 0) {
          const fulfilled = projectChecklist.filter((i: any) => i.status === 'fulfilled').length;
          const missing = projectChecklist.filter((i: any) => i.status === 'missing').length;
          context += `\n\n=== DOCUMENT CHECKLIST (${projectChecklist.length} items) ===\n`;
          context += `Fulfilled: ${fulfilled}/${projectChecklist.length} | Missing: ${missing}\n`;
          // Show missing items explicitly
          const missingItems = projectChecklist.filter((i: any) => i.status === 'missing');
          if (missingItems.length > 0) {
            context += `\nMissing items:\n`;
            missingItems.forEach((item: any) => {
              context += `  - ${item.label} [${item.category}]${item.priority === 'required' ? ' (REQUIRED)' : ''}\n`;
            });
          }
        }
      } catch {
        // Checklist may not exist for this project
      }

      // Related Clients
      const projForClients = await client.query(api.projects.get, {
        id: projectId as Id<"projects">,
      });
      if (projForClients?.clientRoles && projForClients.clientRoles.length > 0) {
        context += `\n\n=== RELATED CLIENTS (${projForClients.clientRoles.length} clients) ===\n`;
        for (const cr of projForClients.clientRoles) {
          const relatedClient = await client.query(api.clients.get, {
            id: cr.clientId as Id<"clients">,
          });
          if (relatedClient) {
            context += `\n${relatedClient.name} (Role: ${cr.role})`;
            if (relatedClient.type) context += ` - Type: ${relatedClient.type}`;
            if (relatedClient.status) context += ` - Status: ${relatedClient.status}`;
            context += `\n`;
          }
        }
      }
    }

    // Store in cache
    await client.mutation(api.contextCache.set, {
      contextType,
      contextId,
      cachedContext: context,
      metadata,
    });

    return context;
  } catch (error) {
    console.error('Error gathering context:', error);
    return '';
  }
}

// =============================================================================
// TOOL ACCESS CONTROL
// =============================================================================

/**
 * Restrict tool access based on context — auto-inject clientId/projectId.
 */
function restrictToolAccess(toolName: string, params: any, clientId?: string, projectId?: string, userId?: string): any {
  const restricted = { ...params };

  // Auto-inject userId for tools that require it
  if (userId) {
    switch (toolName) {
      case 'linkDocumentToChecklist':
        if (!restricted.userId) {
          restricted.userId = userId;
        }
        break;
    }
  }

  if (clientId) {
    switch (toolName) {
      // Force clientId on read tools
      case 'searchClients':
        restricted.searchTerm = undefined;
        restricted.status = undefined;
        restricted.type = undefined;
        break;
      case 'searchProjects':
      case 'getProjectsByClient':
        restricted.clientId = clientId;
        break;
      case 'searchDocuments':
      case 'getDocumentsByClient':
        restricted.clientId = clientId;
        break;
      case 'getKnowledgeBank':
      case 'getKnowledgeItems':
      case 'getKnowledgeStats':
        restricted.clientId = clientId;
        break;
      case 'getNotes':
        restricted.clientId = clientId;
        break;
      case 'getEvents':
        restricted.clientId = clientId;
        break;
      case 'getTasks':
        restricted.clientId = clientId;
        break;
      case 'getReminders':
        restricted.clientId = clientId;
        break;
      case 'getChecklistByClient':
      case 'getChecklistSummary':
      case 'getMissingChecklistItems':
        restricted.clientId = clientId;
        break;
      case 'getClientFolders':
      case 'getClientIntelligence':
        restricted.clientId = clientId;
        break;
      case 'queryIntelligence':
        if (params.scope === 'client' || !params.scope) {
          restricted.clientId = clientId;
        }
        break;
      case 'getContacts':
      case 'searchContactsByClient':
        restricted.clientId = clientId;
        break;
      // Auto-link write tools to current client
      case 'createNote':
      case 'createKnowledgeBankEntry':
      case 'createEvent':
      case 'createTask':
      case 'createReminder':
      case 'createContact':
      case 'addChecklistItem':
      case 'addDocumentNote':
      case 'createClientFolder':
      case 'updateClientIntelligence':
      case 'addClientUpdate':
      case 'moveDocument':
      case 'updateDocumentMetadata':
        if (!restricted.clientId) {
          restricted.clientId = clientId;
        }
        break;
      case 'addKnowledgeItem':
        if (!restricted.clientId && !restricted.projectId) {
          restricted.clientId = clientId;
        }
        break;
      case 'analyzeUploadedDocument':
      case 'saveChatDocument':
        if (!restricted.clientId) {
          restricted.clientId = clientId;
        }
        break;
    }
  } else if (projectId) {
    switch (toolName) {
      // Force projectId on read tools
      case 'searchProjects':
        restricted.projectId = projectId;
        break;
      case 'searchDocuments':
      case 'getDocumentsByProject':
        restricted.projectId = projectId;
        break;
      case 'getKnowledgeBank':
      case 'getKnowledgeItems':
        restricted.projectId = projectId;
        break;
      case 'getNotes':
        restricted.projectId = projectId;
        break;
      case 'getEvents':
        restricted.projectId = projectId;
        break;
      case 'getTasks':
        restricted.projectId = projectId;
        break;
      case 'getReminders':
        restricted.projectId = projectId;
        break;
      case 'getChecklistByProject':
      case 'getMissingChecklistItems':
        restricted.projectId = projectId;
        break;
      case 'getProjectFolders':
      case 'getProjectIntelligence':
        restricted.projectId = projectId;
        break;
      case 'queryIntelligence':
        if (params.scope === 'project' || !params.scope) {
          restricted.projectId = projectId;
        }
        break;
      // Auto-link write tools to current project
      case 'createNote':
      case 'createKnowledgeBankEntry':
      case 'createEvent':
      case 'createTask':
      case 'createReminder':
      case 'createProjectFolder':
      case 'updateProjectIntelligence':
      case 'addProjectUpdate':
      case 'updateDocumentMetadata':
        if (!restricted.projectId) {
          restricted.projectId = projectId;
        }
        break;
      case 'addKnowledgeItem':
        if (!restricted.projectId && !restricted.clientId) {
          restricted.projectId = projectId;
        }
        break;
      case 'analyzeUploadedDocument':
      case 'saveChatDocument':
        if (!restricted.projectId) {
          restricted.projectId = projectId;
        }
        break;
    }
  }

  return restricted;
}

/**
 * Filter tool results based on context.
 */
function filterToolResults(toolName: string, result: any, clientId?: string, projectId?: string): any {
  if (!result) return result;

  if (clientId) {
    switch (toolName) {
      case 'searchClients':
        if (Array.isArray(result)) {
          return result.filter((c: any) => c._id === clientId);
        }
        break;
      case 'searchProjects':
        if (Array.isArray(result)) {
          return result.filter((p: any) =>
            p.clientRoles?.some((cr: any) => cr.clientId === clientId)
          );
        }
        break;
    }
  } else if (projectId) {
    switch (toolName) {
      case 'searchProjects':
        if (Array.isArray(result)) {
          return result.filter((p: any) => p._id === projectId);
        }
        break;
    }
  }

  return result;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract text from TipTap note content JSON.
 */
function extractTextFromNoteContent(content: any): string {
  if (!content || !content.content) return '';

  let text = '';
  const processNode = (node: any) => {
    if (node.type === 'text') {
      text += node.text + ' ';
    } else if (node.type === 'heading') {
      const level = node.attrs?.level || 1;
      const headingText = '#'.repeat(level) + ' ';
      text += headingText;
      if (node.content) {
        node.content.forEach(processNode);
      }
      text += '\n';
    } else if (node.type === 'paragraph') {
      if (node.content) {
        node.content.forEach(processNode);
      }
      text += '\n';
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      if (node.content) {
        node.content.forEach((item: any) => {
          text += '- ';
          if (item.content) {
            item.content.forEach((p: any) => {
              if (p.content) p.content.forEach(processNode);
            });
          }
          text += '\n';
        });
      }
    } else if (node.content) {
      node.content.forEach(processNode);
    }
  };

  if (Array.isArray(content.content)) {
    content.content.forEach(processNode);
  }
  return text.trim();
}

/**
 * Get user-friendly activity message for tool execution.
 */
function getActivityMessage(toolName: string, params: any): string {
  const messages: Record<string, (p: any) => string> = {
    searchClients: (p) => p?.status ? `Searching for ${p.status} clients...` : 'Searching for clients...',
    getClient: () => 'Retrieving client details...',
    getClientStats: () => 'Loading client statistics...',
    getRecentClients: () => 'Loading recent clients...',
    getClientFolders: () => 'Loading client folders...',
    getClientIntelligence: () => 'Loading client intelligence...',
    checkClientExists: () => 'Checking if client exists...',
    searchProjects: (p) => p?.clientId ? 'Searching for projects...' : 'Searching all projects...',
    getProject: () => 'Retrieving project details...',
    getProjectsByClient: () => 'Loading client projects...',
    getProjectFolders: () => 'Loading project folders...',
    getProjectIntelligence: () => 'Loading project intelligence...',
    getProjectStats: () => 'Loading project statistics...',
    searchDocuments: (p) => p?.projectId ? 'Searching project documents...' : 'Searching documents...',
    getDocument: () => 'Retrieving document details...',
    getDocumentsByClient: () => 'Loading client documents...',
    getDocumentsByProject: () => 'Loading project documents...',
    getDocumentNotes: () => 'Loading document notes...',
    getDocumentExtractions: () => 'Loading document extractions...',
    getDocumentUrl: () => 'Getting document URL...',
    getKnowledgeBank: () => 'Retrieving knowledge bank entries...',
    getKnowledgeItems: () => 'Loading knowledge items...',
    getKnowledgeStats: () => 'Loading knowledge statistics...',
    getNotes: () => 'Retrieving notes...',
    getNote: () => 'Loading note...',
    getTasks: () => 'Retrieving tasks...',
    getTask: () => 'Loading task...',
    getContacts: () => 'Loading contacts...',
    getContact: () => 'Loading contact...',
    getReminders: () => 'Loading reminders...',
    getUpcomingReminders: () => 'Loading upcoming reminders...',
    getEvents: () => 'Loading events...',
    getNextEvent: () => 'Loading next event...',
    getUpcomingEvents: () => 'Loading upcoming events...',
    getChecklistByClient: () => 'Loading client checklist...',
    getChecklistByProject: () => 'Loading project checklist...',
    getChecklistSummary: () => 'Loading checklist summary...',
    getMissingChecklistItems: () => 'Checking missing checklist items...',
    getFileQueueJobs: () => 'Loading file queue...',
    getFileQueueJob: () => 'Loading queue job...',
    getReviewQueue: () => 'Loading review queue...',
    getDocumentsByFolder: () => 'Loading folder documents...',
    mapCategoryToFolder: () => 'Mapping category to folder...',
    getInternalDocuments: () => 'Loading internal documents...',
    getInternalDocument: () => 'Loading internal document...',
    getInternalFolders: () => 'Loading internal folders...',
    getInternalDocumentsByFolder: () => 'Loading internal folder documents...',
    searchContactsByClient: () => 'Searching client contacts...',
    analyzeUploadedDocument: (p) => `Analyzing ${p?.fileName || 'document'} with V4 pipeline...`,
    saveChatDocument: (p) => `Filing ${p?.fileName || 'document'}...`,
  };

  return messages[toolName]?.(params) || `Executing ${toolName}...`;
}

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

/**
 * Build system prompt as two separate blocks for optimal caching:
 *
 * Block 1 (instructions): Static behavioral rules — stable across all turns.
 *   → Gets explicit cache_control breakpoint (rarely changes).
 *
 * Block 2 (context): Gathered client/project data + date + file context.
 *   → Changes per-session (different client/project) but stable within a session.
 *   → Cached automatically via top-level cache_control on the request.
 *
 * Cache hierarchy: tools → system[0] → system[1] → messages
 * Combined with top-level automatic caching, the conversation messages
 * cache forward each turn — only the newest user message is uncached.
 */
function buildChatSystemBlocks(opts: {
  contextType: 'global' | 'client' | 'project';
  contextName: string;
  contextId?: string;
  gatheredContext: string;
  currentDate: Date;
  fileContext?: string;
}): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
  // -- Block 1: Static instructions (cacheable across turns/sessions) --
  let instructions = '';

  if (opts.contextType === 'client') {
    instructions = `You are an AI assistant for RockCap, a UK property finance and development lending platform. You are currently assisting with a specific client. You have comprehensive knowledge about this client including their intelligence profile, documents, notes, contacts, tasks, and events. Focus your responses on data related to this client. Tool calls that accept a clientId will be automatically scoped to the current client.`;
  } else if (opts.contextType === 'project') {
    instructions = `You are an AI assistant for RockCap, a UK property finance and development lending platform. You are currently assisting with a specific project. You have comprehensive knowledge about this project including its intelligence profile, documents, notes, tasks, events, and related clients. Focus your responses on data related to this project. Tool calls that accept a projectId will be automatically scoped to the current project.`;
  } else {
    instructions = `You are an AI assistant for RockCap, a UK property finance and development lending platform. You help users manage clients, projects, documents, intelligence profiles, tasks, notes, contacts, reminders, and events.`;
  }

  instructions += `

RULES:
1. ANSWER FROM CONTEXT FIRST. Your context already includes: client/project details, intelligence profile, document summaries, notes, contacts, active tasks, upcoming events, checklist status, and reminders. DO NOT call tools to fetch data that is already provided in your context below — answer directly from it.
2. Only use read tools when you need data BEYOND what's in context (e.g. full document content, historical tasks, detailed extractions, or data for a different client/project).
3. For write operations (create, update, delete), the system will prompt the user for confirmation before execution.
4. When creating multiple items (e.g. "create 4 reminders"), call all the tools at once in a single response.
5. For multi-step requests (e.g. "create a client, then add a document to that client"), plan and call ALL required tools across ALL steps. Write actions are queued for user confirmation and will be executed sequentially in the order you call them.
6. Format responses with markdown for readability. Use bullet points, bold, and structured formatting.
7. When creating notes, use plain text formatting (no markdown symbols in the note content itself).
8. If a user mentions a client or project by name, use the search tools first to find their ID before performing operations.
9. Present data in a user-friendly way — format dates, currency amounts (£), and percentages nicely.
10. When enriching client or project intelligence, use the specific intelligence update tools. Extract concrete data points and store them using the appropriate fields.
11. Intelligence data is available via the queryIntelligence tool. The summary above shows what categories have data and what's missing. For questions about specific values (e.g., "what's the interest rate?", "who is the contractor?"), call queryIntelligence with the relevant category or field name rather than searching through documents.`;

  // -- Block 2: Session-specific context (client/project data, date, files) --
  let context = '';

  // Context scope
  if (opts.contextType === 'client') {
    context += `CURRENT CONTEXT: Client "${opts.contextName}" (ID: ${opts.contextId})`;
  } else if (opts.contextType === 'project') {
    context += `CURRENT CONTEXT: Project "${opts.contextName}" (ID: ${opts.contextId})`;
  }

  // Date context
  const currentDateISO = opts.currentDate.toISOString();
  const currentDateReadable = opts.currentDate.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const tomorrowDate = new Date(opts.currentDate.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowReadable = tomorrowDate.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  context += `

CURRENT DATE/TIME:
- Now: ${currentDateISO} (${currentDateReadable})
- Tomorrow: ${tomorrowReadable}
- Convert relative dates ("today", "tomorrow", "next Monday") to ISO 8601 format using the above.
- Always use UTC (Z suffix) unless user specifies otherwise.`;

  // Gathered context data
  if (opts.gatheredContext) {
    context += `\n\n${opts.gatheredContext}`;
  }

  // File context
  if (opts.fileContext) {
    context += `\n\n${opts.fileContext}`;
  }

  return [
    // Block 1: Instructions — explicit cache breakpoint (stable across turns)
    { type: 'text' as const, text: instructions, cache_control: { type: 'ephemeral' as const } },
    // Block 2: Context — cached automatically via top-level cache_control
    { type: 'text' as const, text: context },
  ];
}

// =============================================================================
// POST HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const convexClient = await getAuthenticatedConvexClient();
    let currentUser: any;
    try {
      currentUser = await requireAuth(convexClient);
    } catch {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    const currentUserId = currentUser?._id as string | undefined;

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
    } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // =========================================================================
    // ACTION EXECUTION PATH
    // =========================================================================
    if (executeAction && actionId) {
      return handleActionExecution(convexClient, actionId);
    }

    // =========================================================================
    // CHAT PATH
    // =========================================================================
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    const anthropic = new Anthropic({ apiKey });

    // Auto-generate title for first message
    if (conversationHistory.length === 0) {
      generateChatTitle(anthropic, sessionId, message, convexClient).catch(
        (err) => console.error('Error generating chat title:', err)
      );
    }

    // Gather context
    const gatheredContext = await gatherChatContext(convexClient, sessionId, clientId, projectId);

    // Get context name
    let contextName = '';
    const contextType = clientId ? 'client' : projectId ? 'project' : 'global';
    if (clientId) {
      const clientData = await convexClient.query(api.clients.get, {
        id: clientId as Id<"clients">,
      });
      contextName = clientData?.name || 'this client';
    } else if (projectId) {
      const projectData = await convexClient.query(api.projects.get, {
        id: projectId as Id<"projects">,
      });
      contextName = projectData?.name || 'this project';
    }

    // File context — instruct Claude to use the V4 analysis tool
    let fileContext = '';
    if (fileMetadata) {
      fileContext = `FILE UPLOADED:
Filename: ${fileMetadata.fileName}
Size: ${(fileMetadata.fileSize / 1024).toFixed(2)} KB
Type: ${fileMetadata.fileType}
Storage ID: ${fileMetadata.fileStorageId}

IMPORTANT: The user has uploaded a file. You MUST immediately:

STEP 1: Call analyzeUploadedDocument with:
- storageId: "${fileMetadata.fileStorageId}"
- fileName: "${fileMetadata.fileName}"
- fileType: "${fileMetadata.fileType}"
${clientId ? `- clientId: "${clientId}"` : ''}${projectId ? `\n- projectId: "${projectId}"` : ''}

STEP 2: After receiving the analysis results, AUTOMATICALLY call saveChatDocument to file the document using the analysis results. Do NOT wait for the user to ask — file it immediately. The confirmation popup will let the user review before it executes.

Pass to saveChatDocument:
- storageId, fileName, fileType from the upload
- fileSize: ${fileMetadata.fileSize}
- summary, fileTypeDetected, category, confidence from the analysis
- clientId${projectId ? ', projectId' : ''} from context
- folderId and folderType from the suggested folder

STEP 3: Present the analysis results to the user including:
1. Document type and classification (with confidence)
2. Brief summary
3. Key extracted data (entities, dates, amounts)
4. Where it will be filed (folder)
5. Any checklist items matched

The user will see a confirmation popup to approve the filing.`;
    }

    // Build system prompt blocks (split for optimal caching)
    const systemBlocks = buildChatSystemBlocks({
      contextType: contextType as 'global' | 'client' | 'project',
      contextName,
      contextId: clientId || projectId,
      gatheredContext,
      currentDate: new Date(),
      fileContext: fileContext || undefined,
    });

    // Load context-aware tools
    const registry = getToolRegistry();
    const tools = registry.getToolsForContext({ contextType: contextType as any, clientId, projectId });
    const anthropicTools = registry.formatForAnthropicTools(tools);

    // Build messages for Anthropic (filter out any system messages — Anthropic only accepts user/assistant)
    type AnthropicMessage = { role: 'user' | 'assistant'; content: any };
    const messages: AnthropicMessage[] = [
      ...conversationHistory
        .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg: any) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      { role: 'user' as const, content: message },
    ];

    // Call Anthropic with combined caching strategy:
    // 1. Top-level cache_control: automatic conversation caching — moves the cache
    //    breakpoint forward each turn so prior messages are read from cache.
    // 2. Explicit cache_control on system block 1 (instructions): stable across turns,
    //    cached independently from the gathered context.
    // Cache hierarchy: tools → system[0] (explicit) → system[1] → messages (automatic)
    let response = await anthropic.messages.create({
      model: MODEL,
      cache_control: { type: 'ephemeral' },
      system: systemBlocks as any,
      tools: anthropicTools as any,
      messages,
      max_tokens: 4096,
    } as any);

    // Tool use loop
    const pendingActions: Array<{ toolName: string; parameters: any; requiresConfirmation: boolean }> = [];
    const activityLog: Array<{ activity: string; timestamp: string }> = [];
    const usage = response.usage as any;
    let totalInputTokens = usage?.input_tokens || 0;
    let totalOutputTokens = usage?.output_tokens || 0;
    let totalCacheReadTokens = usage?.cache_read_input_tokens || 0;
    let totalCacheCreationTokens = usage?.cache_creation_input_tokens || 0;
    const maxIterations = 5;
    let iteration = 0;

    while (response.stop_reason === 'tool_use' && iteration < maxIterations) {
      iteration++;

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use'
      );
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = [];

      for (const block of toolUseBlocks) {
        const toolDef = registry.getTool(block.name);
        if (!toolDef) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
            is_error: true,
          });
          continue;
        }

        if (toolDef.requiresConfirmation) {
          // Apply restrictToolAccess to write tools too — injects userId, clientId, projectId
          const restrictedWriteParams = restrictToolAccess(block.name, block.input, clientId, projectId, currentUserId);
          pendingActions.push({
            toolName: block.name,
            parameters: restrictedWriteParams,
            requiresConfirmation: true,
          });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'Action requires user confirmation. Awaiting approval.',
          });
        } else {
          // Execute read-only tool immediately
          activityLog.push({
            activity: getActivityMessage(block.name, block.input),
            timestamp: new Date().toISOString(),
          });

          try {
            const restrictedParams = restrictToolAccess(block.name, block.input, clientId, projectId, currentUserId);
            const result = await executeTool(block.name, restrictedParams, convexClient);
            const filtered = filterToolResults(block.name, result, clientId, projectId);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(filtered),
            });
          } catch (err) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
              is_error: true,
            });
          }
        }
      }

      // Send tool results back to model — even for pending confirmations.
      // This lets the model plan multi-step workflows (e.g. "create client, then add doc to it")
      // by continuing the loop. Write tools get "awaiting approval" results and are collected
      // in pendingActions. The frontend executes them sequentially in order.
      messages.push({ role: 'assistant', content: response.content as any });
      messages.push({ role: 'user', content: toolResults as any });

      response = await anthropic.messages.create({
        model: MODEL,
        cache_control: { type: 'ephemeral' },
        system: systemBlocks as any,
        tools: anthropicTools as any,
        messages,
        max_tokens: 4096,
      } as any);
      const loopUsage = response.usage as any;
      totalInputTokens += loopUsage?.input_tokens || 0;
      totalOutputTokens += loopUsage?.output_tokens || 0;
      totalCacheReadTokens += loopUsage?.cache_read_input_tokens || 0;
      totalCacheCreationTokens += loopUsage?.cache_creation_input_tokens || 0;
    }

    // Extract text response
    const textContent = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // Log cache performance for observability
    const totalTokens = totalInputTokens + totalOutputTokens + totalCacheReadTokens + totalCacheCreationTokens;
    const cacheHitRate = totalCacheReadTokens > 0
      ? Math.round((totalCacheReadTokens / (totalCacheReadTokens + totalCacheCreationTokens + totalInputTokens)) * 100)
      : 0;
    console.log(`[Chat] Tokens: ${totalTokens} total | ${totalCacheReadTokens} cache-read | ${totalCacheCreationTokens} cache-write | ${totalInputTokens} uncached | ${totalOutputTokens} output | ${cacheHitRate}% cache hit`);

    return NextResponse.json({
      content: textContent,
      toolCalls: [],
      activityLog,
      pendingActions,
      tokensUsed: totalTokens,
      cacheMetrics: {
        cacheReadTokens: totalCacheReadTokens,
        cacheCreationTokens: totalCacheCreationTokens,
        uncachedInputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheHitRate,
      },
    });
  } catch (error) {
    console.error('Chat Assistant API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process chat request' },
      { status: 500 }
    );
  }
}

// =============================================================================
// ACTION EXECUTION
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

    // Execute using the new executor
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
// TITLE GENERATION
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
