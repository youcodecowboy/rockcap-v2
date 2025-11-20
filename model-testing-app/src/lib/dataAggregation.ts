import { SavedDocument, Communication, Contact } from '@/types';
import { getDocumentsByClient, getDocumentsByProject } from './documentStorage';

export interface ClientStats {
  totalProjects: number;
  activeProjects: number;
  totalDocuments: number;
  lastActivity?: string;
}

export interface ProjectStats {
  totalDocuments: number;
  totalCosts?: number;
  loanAmount?: number;
  lastActivity?: string;
}

export function aggregateClientStats(clientId: string): ClientStats {
  const { getProjectsByClient } = require('./clientStorage');
  const projects = getProjectsByClient(clientId);
  const documents = getDocumentsByClient(clientId);

  const totalProjects = projects.length;
  const activeProjects = projects.filter((p: any) => p.status === 'active').length;
  const totalDocuments = documents.length;

  let lastActivity: string | undefined;
  if (documents.length > 0) {
    const sortedDocs = documents.sort((a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    lastActivity = sortedDocs[0].uploadedAt;
  }

  return {
    totalProjects,
    activeProjects,
    totalDocuments,
    lastActivity,
  };
}

export function aggregateProjectStats(projectId: string): ProjectStats {
  const documents = getDocumentsByProject(projectId);
  const totalDocuments = documents.length;

  let totalCosts: number | undefined;
  let loanAmount: number | undefined;

  const documentsWithData = documents.filter(doc => doc.extractedData);
  if (documentsWithData.length > 0) {
    const costs = documentsWithData
      .map(doc => doc.extractedData?.costsTotal?.amount)
      .filter((amount): amount is number => typeof amount === 'number');

    if (costs.length > 0) {
      totalCosts = costs.reduce((sum, amount) => sum + amount, 0);
    }

    const loanAmounts = documentsWithData
      .map(doc => doc.extractedData?.financing?.loanAmount)
      .filter((amount): amount is number => typeof amount === 'number');

    if (loanAmounts.length > 0) {
      loanAmount = loanAmounts[loanAmounts.length - 1];
    }
  }

  let lastActivity: string | undefined;
  if (documents.length > 0) {
    const sortedDocs = documents.sort((a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    lastActivity = sortedDocs[0].uploadedAt;
  }

  return {
    totalDocuments,
    totalCosts,
    loanAmount,
    lastActivity,
  };
}

export function extractContactsFromDocuments(documents: SavedDocument[]): Contact[] {
  const contacts: Contact[] = [];
  const seenContacts = new Set<string>();

  for (const doc of documents) {
    // Extract from summary and reasoning
    const text = `${doc.summary} ${doc.reasoning}`.toLowerCase();

    // Simple email extraction
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailRegex) || [];

    for (const email of emails) {
      if (!seenContacts.has(email.toLowerCase())) {
        seenContacts.add(email.toLowerCase());
        contacts.push({
          id: `extracted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: email.split('@')[0].replace(/[._]/g, ' '),
          email: email,
          createdAt: doc.uploadedAt,
          sourceDocumentId: doc._id,
        });
      }
    }

    // Extract phone numbers (basic pattern)
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    const phones = text.match(phoneRegex) || [];

    for (const phone of phones) {
      const phoneKey = phone.replace(/\D/g, '');
      if (!seenContacts.has(`phone_${phoneKey}`)) {
        seenContacts.add(`phone_${phoneKey}`);
        contacts.push({
          id: `extracted_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: 'Unknown Contact',
          phone: phone.trim(),
          createdAt: doc.uploadedAt,
          sourceDocumentId: doc._id,
        });
      }
    }
  }

  return contacts;
}

export function extractCommunicationsFromDocuments(documents: SavedDocument[]): Communication[] {
  const communications: Communication[] = [];

  for (const doc of documents) {
    const category = doc.category.toLowerCase();
    const fileType = doc.fileTypeDetected.toLowerCase();

    let commType: Communication['type'] = 'other';
    if (fileType.includes('email') || category.includes('email')) {
      commType = 'email';
    } else if (fileType.includes('meeting') || category.includes('meeting')) {
      commType = 'meeting';
    } else if (fileType.includes('call') || category.includes('call')) {
      commType = 'call';
    } else if (category === 'communications') {
      commType = 'email';
    }

    // Extract participants from summary/reasoning (simple extraction)
    const text = `${doc.summary} ${doc.reasoning}`;
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const participants = text.match(emailRegex) || [];

    communications.push({
      id: `comm_${doc._id}`,
      type: commType,
      subject: doc.fileName,
      date: doc.uploadedAt,
      participants: participants.slice(0, 5), // Limit to 5 participants
      documentId: doc._id,
      summary: doc.summary,
    });
  }

  // Sort by date descending
  return communications.sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function getRecentActivity(
  entityId: string,
  type: 'client' | 'project'
): Array<{ type: string; date: string; documentId: string; documentName: string }> {
  const documents = type === 'client'
    ? getDocumentsByClient(entityId)
    : getDocumentsByProject(entityId);

  const activities = documents.map(doc => ({
    type: 'document_upload',
    date: doc.uploadedAt,
    documentId: doc._id,
    documentName: doc.fileName,
  }));

  return activities.sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  ).slice(0, 10); // Return last 10 activities
}

