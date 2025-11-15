import { Id } from '../convex/_generated/dataModel';
import {
  getClientServer,
  getProjectServer,
  searchKnowledgeBankServer,
  getKnowledgeBankByClientServer,
  getKnowledgeBankByProjectServer,
  getClientSummaryServer,
  getDocumentsServer,
} from './convexServer';

interface ContextData {
  client?: any;
  project?: any;
  knowledgeBankEntries: any[];
  documents: any[];
  clientSummary?: any;
}

/**
 * Gathers relevant context for AI assistant based on note's client/project and prompt
 * This will be called server-side in the API route
 */
export async function gatherContextForNote(
  noteId: string | undefined,
  clientId: Id<"clients"> | null | undefined,
  projectId: Id<"projects"> | null | undefined,
  prompt: string
): Promise<ContextData> {
  const context: ContextData = {
    knowledgeBankEntries: [],
    documents: [],
  };
  
  // Extract keywords from prompt for relevance matching
  const promptKeywords = extractKeywords(prompt);
  
  try {
    // 1. Get client information
    if (clientId) {
      context.client = await getClientServer(clientId);
      context.clientSummary = await getClientSummaryServer(clientId);
    }
    
    // 2. Get project information
    if (projectId) {
      context.project = await getProjectServer(projectId);
    }
    
    // 3. Search knowledge bank entries - prioritize by relevance to prompt
    // Always search with keywords if available, but also include all entries for client/project
    if (promptKeywords.length > 0) {
      // Search with keywords - this will search within client/project if specified
      const searchResults = await searchKnowledgeBankServer({
        clientId: clientId || undefined,
        projectId: projectId || undefined,
        query: promptKeywords.join(' '),
      });
      context.knowledgeBankEntries = searchResults.slice(0, 50); // Increased limit
    }
    
    // Also get all entries for client/project to ensure we have comprehensive context
    if (projectId) {
      const projectEntries = await getKnowledgeBankByProjectServer(projectId);
      // Merge with search results, avoiding duplicates
      const existingIds = new Set(context.knowledgeBankEntries.map(e => e._id));
      projectEntries.forEach(entry => {
        if (!existingIds.has(entry._id)) {
          context.knowledgeBankEntries.push(entry);
        }
      });
    } else if (clientId) {
      const clientEntries = await getKnowledgeBankByClientServer(clientId);
      // Merge with search results, avoiding duplicates
      const existingIds = new Set(context.knowledgeBankEntries.map(e => e._id));
      clientEntries.forEach(entry => {
        if (!existingIds.has(entry._id)) {
          context.knowledgeBankEntries.push(entry);
        }
      });
    }
    
    // Limit to most recent 50 entries total
    context.knowledgeBankEntries = context.knowledgeBankEntries
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
    
    // 4. Get related documents - include all completed documents for context
    context.documents = await getDocumentsServer({
      clientId: clientId || undefined,
      projectId: projectId || undefined,
      status: 'completed',
    });
    // Sort by most recent and limit to 30 for comprehensive context
    context.documents = context.documents
      .sort((a, b) => new Date(b.createdAt || b.savedAt || 0).getTime() - new Date(a.createdAt || a.savedAt || 0).getTime())
      .slice(0, 30);
    
  } catch (error) {
    console.error('Error gathering context:', error);
    // Return partial context if some queries fail
  }
  
  return context;
}

/**
 * Extracts keywords from prompt for relevance matching
 */
function extractKeywords(prompt: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how'
  ]);
  
  const words = prompt.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  return [...new Set(words)]; // Remove duplicates
}

/**
 * Formats context data into a structured string for LLM consumption
 */
export function formatContextForLLM(
  context: ContextData, 
  prompt: string, 
  updateMode: boolean = false,
  existingContent: string | null = null
): string {
  let contextString = `# CONTEXT FOR AI ASSISTANT\n\n`;
  
  if (updateMode && existingContent) {
    contextString += `## MODE: UPDATE EXISTING NOTE\n\n`;
    contextString += `The user wants to UPDATE/REVISE the existing note content based on their prompt.\n\n`;
    contextString += `### CURRENT NOTE CONTENT:\n${existingContent}\n\n`;
    contextString += `### USER'S UPDATE REQUEST:\n${prompt}\n\n`;
    contextString += `INSTRUCTIONS: Revise and update the existing note content based on the user's request. `;
    contextString += `Keep relevant information that doesn't conflict with the update request. `;
    contextString += `Enhance, expand, or modify sections as requested. Maintain the note's structure and formatting.\n\n`;
  } else {
    contextString += `User Prompt: ${prompt}\n\n`;
  }
  
  // Client Information
  if (context.client) {
    contextString += `## CLIENT INFORMATION\n`;
    contextString += `Name: ${context.client.name}\n`;
    if (context.client.companyName) contextString += `Company: ${context.client.companyName}\n`;
    if (context.client.type) contextString += `Type: ${context.client.type}\n`;
    if (context.client.status) contextString += `Status: ${context.client.status}\n`;
    if (context.client.address) contextString += `Address: ${context.client.address}\n`;
    contextString += `\n`;
  }
  
  // Client Summary (from knowledge bank aggregation)
  if (context.clientSummary) {
    contextString += `## CLIENT SUMMARY\n`;
    if (context.clientSummary.summary) {
      contextString += `${context.clientSummary.summary}\n\n`;
    }
    if (context.clientSummary.recentUpdates && context.clientSummary.recentUpdates.length > 0) {
      contextString += `Recent Updates:\n`;
      context.clientSummary.recentUpdates.forEach((update: string) => {
        contextString += `- ${update}\n`;
      });
      contextString += `\n`;
    }
  }
  
  // Project Information
  if (context.project) {
    contextString += `## PROJECT INFORMATION\n`;
    contextString += `Name: ${context.project.name}\n`;
    if (context.project.description) contextString += `Description: ${context.project.description}\n`;
    if (context.project.status) contextString += `Status: ${context.project.status}\n`;
    contextString += `\n`;
  }
  
  // Knowledge Bank Entries
  if (context.knowledgeBankEntries && context.knowledgeBankEntries.length > 0) {
    contextString += `## RELEVANT KNOWLEDGE BANK ENTRIES\n\n`;
    context.knowledgeBankEntries.slice(0, 30).forEach((entry, index) => {
      contextString += `### Entry ${index + 1}: ${entry.title}\n`;
      contextString += `Type: ${entry.entryType}\n`;
      contextString += `Source: ${entry.sourceType}\n`;
      contextString += `Date: ${entry.createdAt}\n`;
      if (entry.content) {
        // Include full content, not truncated - the LLM needs all the details
        contextString += `Content: ${entry.content}\n`;
      }
      // Include metadata which may contain extracted data
      if (entry.metadata && typeof entry.metadata === 'object') {
        contextString += `Metadata:\n`;
        try {
          const metadataStr = JSON.stringify(entry.metadata, null, 2);
          contextString += `${metadataStr}\n`;
        } catch (e) {
          contextString += `${JSON.stringify(entry.metadata)}\n`;
        }
      }
      if (entry.keyPoints && entry.keyPoints.length > 0) {
        contextString += `Key Points:\n`;
        entry.keyPoints.forEach((kp: string) => {
          contextString += `- ${kp}\n`;
        });
      }
      if (entry.tags && entry.tags.length > 0) {
        contextString += `Tags: ${entry.tags.join(', ')}\n`;
      }
      contextString += `\n`;
    });
  }
  
  // Related Documents
  if (context.documents && context.documents.length > 0) {
    contextString += `## RELATED DOCUMENTS\n\n`;
    context.documents.slice(0, 20).forEach((doc, index) => {
      contextString += `### Document ${index + 1}: ${doc.fileName || doc.name || 'Untitled'}\n`;
      contextString += `Category: ${doc.category || 'N/A'}\n`;
      contextString += `Type: ${doc.fileTypeDetected || 'N/A'}\n`;
      if (doc.summary) {
        contextString += `Summary: ${doc.summary}\n`;
      }
      // Include extracted data - this contains structured information like expenses, numbers, etc.
      if (doc.extractedData && typeof doc.extractedData === 'object') {
        contextString += `Extracted Data:\n`;
        try {
          const extractedStr = JSON.stringify(doc.extractedData, null, 2);
          contextString += `${extractedStr}\n`;
        } catch (e) {
          contextString += `${JSON.stringify(doc.extractedData)}\n`;
        }
      }
      // Include metadata if available
      if (doc.metadata && typeof doc.metadata === 'object') {
        contextString += `Metadata:\n`;
        try {
          const metadataStr = JSON.stringify(doc.metadata, null, 2);
          contextString += `${metadataStr}\n`;
        } catch (e) {
          contextString += `${JSON.stringify(doc.metadata)}\n`;
        }
      }
      contextString += `\n`;
    });
  }
  
  contextString += `\n---\n`;
  contextString += `INSTRUCTIONS: Use the above context to help answer the user's prompt. `;
  contextString += `Reference specific entries, documents, or information when relevant. `;
  contextString += `Format your response professionally with headings, lists, and clear structure. `;
  contextString += `If you mention clients, projects, or files, identify them clearly so they can be linked.`;
  
  return contextString;
}

/**
 * Estimates token count (rough approximation: 1 token ≈ 4 characters)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

