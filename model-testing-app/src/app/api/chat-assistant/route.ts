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
 * Gather comprehensive context for the chat based on session context
 * Uses caching to avoid re-gathering data on every request
 */
async function gatherChatContext(
  client: any,
  sessionId: string,
  clientId?: string,
  projectId?: string
): Promise<string> {
  // If no context specified, return empty
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

    // Check if cache is valid
    if (cached) {
      const isValid = await client.query(api.contextCache.isValid, {
        contextType,
        contextId,
      });

      if (isValid) {
        return cached.cachedContext;
      }
      // Cache invalid - will rebuild below
    }

    // Cache miss or invalid - build fresh context

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
      // Gather comprehensive client context
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

      // Get CLIENT INTELLIGENCE (structured data)
      try {
        const clientIntelligence = await client.query(api.intelligence.getClientIntelligence, {
          clientId: clientId as Id<"clients">,
        });
        
        if (clientIntelligence) {
          context += `\n\n=== CLIENT INTELLIGENCE ===\n`;
          
          // Identity
          if (clientIntelligence.identity) {
            const id = clientIntelligence.identity;
            if (id.legalName) context += `Legal Name: ${id.legalName}\n`;
            if (id.tradingName) context += `Trading Name: ${id.tradingName}\n`;
            if (id.companyNumber) context += `Company Number: ${id.companyNumber}\n`;
            if (id.vatNumber) context += `VAT Number: ${id.vatNumber}\n`;
          }
          
          // Primary Contact
          if (clientIntelligence.primaryContact) {
            const pc = clientIntelligence.primaryContact;
            context += `\nPrimary Contact:\n`;
            if (pc.name) context += `  Name: ${pc.name}\n`;
            if (pc.role) context += `  Role: ${pc.role}\n`;
            if (pc.email) context += `  Email: ${pc.email}\n`;
            if (pc.phone) context += `  Phone: ${pc.phone}\n`;
          }
          
          // Addresses
          if (clientIntelligence.addresses) {
            const addr = clientIntelligence.addresses;
            if (addr.registered) context += `Registered Address: ${addr.registered}\n`;
            if (addr.trading) context += `Trading Address: ${addr.trading}\n`;
            if (addr.correspondence) context += `Correspondence Address: ${addr.correspondence}\n`;
          }
          
          // Banking
          if (clientIntelligence.banking) {
            const bank = clientIntelligence.banking;
            context += `\nBanking Details:\n`;
            if (bank.bankName) context += `  Bank: ${bank.bankName}\n`;
            if (bank.accountName) context += `  Account Name: ${bank.accountName}\n`;
            if (bank.accountNumber) context += `  Account Number: ${bank.accountNumber}\n`;
            if (bank.sortCode) context += `  Sort Code: ${bank.sortCode}\n`;
          }
          
          // Key People
          if (clientIntelligence.keyPeople && clientIntelligence.keyPeople.length > 0) {
            context += `\nKey People:\n`;
            clientIntelligence.keyPeople.forEach((person: any) => {
              context += `  - ${person.name}`;
              if (person.role) context += ` (${person.role})`;
              if (person.isDecisionMaker) context += ` [Decision Maker]`;
              if (person.email) context += ` - ${person.email}`;
              context += `\n`;
            });
          }
          
          // Lender Profile (if lender)
          if (clientIntelligence.lenderProfile) {
            const lp = clientIntelligence.lenderProfile;
            context += `\nLender Profile:\n`;
            if (lp.dealSizeMin || lp.dealSizeMax) {
              context += `  Deal Size: £${lp.dealSizeMin?.toLocaleString() || 'N/A'} - £${lp.dealSizeMax?.toLocaleString() || 'N/A'}\n`;
            }
            if (lp.propertyTypes?.length) context += `  Property Types: ${lp.propertyTypes.join(', ')}\n`;
            if (lp.loanTypes?.length) context += `  Loan Types: ${lp.loanTypes.join(', ')}\n`;
            if (lp.geographicRegions?.length) context += `  Regions: ${lp.geographicRegions.join(', ')}\n`;
            if (lp.typicalLTV) context += `  Typical LTV: ${lp.typicalLTV}%\n`;
            if (lp.decisionSpeed) context += `  Decision Speed: ${lp.decisionSpeed}\n`;
            if (lp.relationshipNotes) context += `  Relationship Notes: ${lp.relationshipNotes}\n`;
          }
          
          // Borrower Profile (if borrower)
          if (clientIntelligence.borrowerProfile) {
            const bp = clientIntelligence.borrowerProfile;
            context += `\nBorrower Profile:\n`;
            if (bp.experienceLevel) context += `  Experience: ${bp.experienceLevel}\n`;
            if (bp.completedProjects) context += `  Completed Projects: ${bp.completedProjects}\n`;
            if (bp.totalDevelopmentValue) context += `  Total GDV: £${bp.totalDevelopmentValue.toLocaleString()}\n`;
            if (bp.netWorth) context += `  Net Worth: £${bp.netWorth.toLocaleString()}\n`;
            if (bp.liquidAssets) context += `  Liquid Assets: £${bp.liquidAssets.toLocaleString()}\n`;
          }
          
          // AI Summary
          if (clientIntelligence.aiSummary?.executiveSummary) {
            context += `\nExecutive Summary: ${clientIntelligence.aiSummary.executiveSummary}\n`;
          }
          if (clientIntelligence.aiSummary?.keyFacts?.length) {
            context += `Key Facts: ${clientIntelligence.aiSummary.keyFacts.join('; ')}\n`;
          }
          
          // Project Summaries
          if (clientIntelligence.projectSummaries?.length) {
            context += `\nLinked Projects:\n`;
            clientIntelligence.projectSummaries.forEach((proj: any) => {
              context += `  - ${proj.projectName} (${proj.role})`;
              if (proj.status) context += ` - ${proj.status}`;
              if (proj.loanAmount) context += ` - £${proj.loanAmount.toLocaleString()}`;
              context += `\n`;
            });
          }
          
          metadata.knowledgeBankCount = 1; // Intelligence doc counts as structured knowledge
          if (clientIntelligence.lastUpdated) {
            const intDate = new Date(clientIntelligence.lastUpdated);
            if (intDate > new Date(metadata.lastDataUpdate)) {
              metadata.lastDataUpdate = intDate.toISOString();
            }
          }
        }
      } catch (e) {
        // Intelligence might not exist yet for older clients
        console.log('No intelligence data found for client:', clientId);
      }

      // Also get legacy knowledge bank entries for backwards compatibility
      try {
        const knowledgeEntries = await client.query(api.knowledgeBank.getByClient, {
          clientId: clientId as Id<"clients">,
        });
        
        if (knowledgeEntries && knowledgeEntries.length > 0) {
          context += `\n\n=== KNOWLEDGE BANK (${knowledgeEntries.length} legacy entries) ===\n`;
          const sortedEntries = [...knowledgeEntries].sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          
          sortedEntries.slice(0, 20).forEach((entry: any) => {
            const entryDate = new Date(entry.updatedAt || entry.createdAt);
            if (entryDate > new Date(metadata.lastDataUpdate)) {
              metadata.lastDataUpdate = entryDate.toISOString();
            }
            context += `\n[${entry.entryType || 'general'}] ${entry.title} (${new Date(entry.createdAt).toLocaleDateString()})\n`;
            context += `Content: ${entry.content.substring(0, 500)}${entry.content.length > 500 ? '...' : ''}\n`;
          });
        }
      } catch (e) {
        // Knowledge bank might not exist
      }

      // Get ALL documents
      const documents = await client.query(api.documents.list, {
        clientId: clientId as Id<"clients">,
        status: 'completed',
      });
      metadata.documentsCount = documents?.length || 0;
      if (documents && documents.length > 0) {
        context += `\n\n=== DOCUMENTS (${documents.length} documents) ===\n`;
        const sortedDocs = [...documents].sort((a, b) => 
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

      // Get ALL notes
      const notes = await client.query(api.notes.getAll, {
        clientId: clientId as Id<"clients">,
      });
      metadata.notesCount = notes?.length || 0;
      if (notes && notes.length > 0) {
        context += `\n\n=== NOTES (${notes.length} notes) ===\n`;
        const sortedNotes = [...notes].sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        sortedNotes.forEach((note: any) => {
          const noteDate = new Date(note.updatedAt);
          if (noteDate > new Date(metadata.lastDataUpdate)) {
            metadata.lastDataUpdate = noteDate.toISOString();
          }
          context += `\n${note.title || 'Untitled'} (${new Date(note.updatedAt).toLocaleDateString()})\n`;
          // Extract text from note content (it's TipTap JSON)
          const noteText = extractTextFromNoteContent(note.content);
          if (noteText) {
            context += `Content: ${noteText.substring(0, 500)}${noteText.length > 500 ? '...' : ''}\n`;
          }
          if (note.tags && note.tags.length > 0) {
            context += `Tags: ${note.tags.join(', ')}\n`;
          }
        });
      }

      // Get ALL contacts
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

      // Get deals (filter from all deals)
      const allDeals = await client.query(api.deals.getAllDeals, {});
      const clientDeals = allDeals?.filter((deal: any) => 
        deal.linkedCompanyIds?.some((cid: Id<"companies">) => {
          // We'd need to check if company is linked to client, but for now just check if deal has client context
          return false; // Simplified - deals might not have direct client link
        })
      ) || [];
      metadata.dealsCount = clientDeals.length;
      if (clientDeals.length > 0) {
        context += `\n\n=== DEALS (${clientDeals.length} deals) ===\n`;
        clientDeals.forEach((deal: any) => {
          context += `\n${deal.name || 'Unnamed Deal'}`;
          if (deal.stage) context += ` - Stage: ${deal.stage}`;
          if (deal.amount) context += ` - Amount: ${deal.amount}`;
          if (deal.pipeline) context += ` - Pipeline: ${deal.pipeline}`;
          context += `\n`;
        });
      }

      // Get tasks for this client
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

      // Get events for this client
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

      // Get related projects
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
      // Gather comprehensive project context
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

      // Get PROJECT INTELLIGENCE (structured data)
      try {
        const projectIntelligence = await client.query(api.intelligence.getProjectIntelligence, {
          projectId: projectId as Id<"projects">,
        });
        
        if (projectIntelligence) {
          context += `\n\n=== PROJECT INTELLIGENCE ===\n`;
          
          // Overview
          if (projectIntelligence.overview) {
            const ov = projectIntelligence.overview;
            if (ov.projectType) context += `Project Type: ${ov.projectType}\n`;
            if (ov.assetClass) context += `Asset Class: ${ov.assetClass}\n`;
            if (ov.currentPhase) context += `Current Phase: ${ov.currentPhase}\n`;
            if (ov.description) context += `Description: ${ov.description}\n`;
          }
          
          // Location
          if (projectIntelligence.location) {
            const loc = projectIntelligence.location;
            if (loc.siteAddress) context += `Site Address: ${loc.siteAddress}\n`;
            if (loc.postcode) context += `Postcode: ${loc.postcode}\n`;
            if (loc.region) context += `Region: ${loc.region}\n`;
            if (loc.localAuthority) context += `Local Authority: ${loc.localAuthority}\n`;
          }
          
          // Financials
          if (projectIntelligence.financials) {
            const fin = projectIntelligence.financials;
            context += `\nFinancials:\n`;
            if (fin.purchasePrice) context += `  Purchase Price: £${fin.purchasePrice.toLocaleString()}\n`;
            if (fin.totalDevelopmentCost) context += `  Total Development Cost: £${fin.totalDevelopmentCost.toLocaleString()}\n`;
            if (fin.grossDevelopmentValue) context += `  GDV: £${fin.grossDevelopmentValue.toLocaleString()}\n`;
            if (fin.profit) context += `  Profit: £${fin.profit.toLocaleString()}\n`;
            if (fin.profitMargin) context += `  Profit Margin: ${fin.profitMargin}%\n`;
            if (fin.loanAmount) context += `  Loan Amount: £${fin.loanAmount.toLocaleString()}\n`;
            if (fin.ltv) context += `  LTV: ${fin.ltv}%\n`;
            if (fin.ltgdv) context += `  LTGDV: ${fin.ltgdv}%\n`;
            if (fin.interestRate) context += `  Interest Rate: ${fin.interestRate}%\n`;
          }
          
          // Timeline
          if (projectIntelligence.timeline) {
            const tl = projectIntelligence.timeline;
            context += `\nTimeline:\n`;
            if (tl.acquisitionDate) context += `  Acquisition: ${tl.acquisitionDate}\n`;
            if (tl.planningApprovalDate) context += `  Planning Approval: ${tl.planningApprovalDate}\n`;
            if (tl.constructionStartDate) context += `  Construction Start: ${tl.constructionStartDate}\n`;
            if (tl.practicalCompletionDate) context += `  Practical Completion: ${tl.practicalCompletionDate}\n`;
            if (tl.loanMaturityDate) context += `  Loan Maturity: ${tl.loanMaturityDate}\n`;
          }
          
          // Development Details
          if (projectIntelligence.development) {
            const dev = projectIntelligence.development;
            context += `\nDevelopment:\n`;
            if (dev.totalUnits) context += `  Total Units: ${dev.totalUnits}\n`;
            if (dev.totalSqFt) context += `  Total Sq Ft: ${dev.totalSqFt.toLocaleString()}\n`;
            if (dev.planningReference) context += `  Planning Ref: ${dev.planningReference}\n`;
            if (dev.planningStatus) context += `  Planning Status: ${dev.planningStatus}\n`;
          }
          
          // Key Parties
          if (projectIntelligence.keyParties) {
            const kp = projectIntelligence.keyParties;
            context += `\nKey Parties:\n`;
            if (kp.borrower?.name) context += `  Borrower: ${kp.borrower.name}${kp.borrower.contactName ? ` (${kp.borrower.contactName})` : ''}\n`;
            if (kp.lender?.name) context += `  Lender: ${kp.lender.name}${kp.lender.contactName ? ` (${kp.lender.contactName})` : ''}\n`;
            if (kp.solicitor?.firm) context += `  Solicitor: ${kp.solicitor.firm}${kp.solicitor.contactName ? ` (${kp.solicitor.contactName})` : ''}\n`;
            if (kp.valuer?.firm) context += `  Valuer: ${kp.valuer.firm}\n`;
            if (kp.contractor?.firm) context += `  Contractor: ${kp.contractor.firm}${kp.contractor.contractValue ? ` - £${kp.contractor.contractValue.toLocaleString()}` : ''}\n`;
            if (kp.monitoringSurveyor?.firm) context += `  Monitoring Surveyor: ${kp.monitoringSurveyor.firm}\n`;
          }
          
          // Data Library Summary
          if (projectIntelligence.dataLibrarySummary) {
            const dls = projectIntelligence.dataLibrarySummary;
            context += `\nData Library Summary:\n`;
            if (dls.totalDevelopmentCost) context += `  Total Dev Cost: £${dls.totalDevelopmentCost.toLocaleString()}\n`;
            if (dls.landCost) context += `  Land Cost: £${dls.landCost.toLocaleString()}\n`;
            if (dls.constructionCost) context += `  Construction Cost: £${dls.constructionCost.toLocaleString()}\n`;
            if (dls.professionalFees) context += `  Professional Fees: £${dls.professionalFees.toLocaleString()}\n`;
            if (dls.contingency) context += `  Contingency: £${dls.contingency.toLocaleString()}\n`;
            if (dls.financeCosts) context += `  Finance Costs: £${dls.financeCosts.toLocaleString()}\n`;
            if (dls.totalItemCount) context += `  Items: ${dls.totalItemCount}\n`;
            if (dls.sourceDocumentCount) context += `  Source Documents: ${dls.sourceDocumentCount}\n`;
          }
          
          // AI Summary
          if (projectIntelligence.aiSummary?.executiveSummary) {
            context += `\nExecutive Summary: ${projectIntelligence.aiSummary.executiveSummary}\n`;
          }
          if (projectIntelligence.aiSummary?.keyFacts?.length) {
            context += `Key Facts: ${projectIntelligence.aiSummary.keyFacts.join('; ')}\n`;
          }
          if (projectIntelligence.aiSummary?.risks?.length) {
            context += `Risks: ${projectIntelligence.aiSummary.risks.join('; ')}\n`;
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

      // Also get legacy knowledge bank entries for backwards compatibility
      try {
        const knowledgeEntries = await client.query(api.knowledgeBank.getByProject, {
          projectId: projectId as Id<"projects">,
        });
        
        if (knowledgeEntries && knowledgeEntries.length > 0) {
          context += `\n\n=== KNOWLEDGE BANK (${knowledgeEntries.length} legacy entries) ===\n`;
          const sortedEntries = [...knowledgeEntries].sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          
          sortedEntries.slice(0, 20).forEach((entry: any) => {
            const entryDate = new Date(entry.updatedAt || entry.createdAt);
            if (entryDate > new Date(metadata.lastDataUpdate)) {
              metadata.lastDataUpdate = entryDate.toISOString();
            }
            context += `\n[${entry.entryType || 'general'}] ${entry.title} (${new Date(entry.createdAt).toLocaleDateString()})\n`;
            context += `Content: ${entry.content.substring(0, 500)}${entry.content.length > 500 ? '...' : ''}\n`;
          });
        }
      } catch (e) {
        // Knowledge bank might not exist
      }

      // Get ALL documents
      const documents = await client.query(api.documents.list, {
        projectId: projectId as Id<"projects">,
        status: 'completed',
      });
      metadata.documentsCount = documents?.length || 0;
      if (documents && documents.length > 0) {
        context += `\n\n=== DOCUMENTS (${documents.length} documents) ===\n`;
        const sortedDocs = [...documents].sort((a, b) => 
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

      // Get ALL notes
      const notes = await client.query(api.notes.getAll, {
        projectId: projectId as Id<"projects">,
      });
      metadata.notesCount = notes?.length || 0;
      if (notes && notes.length > 0) {
        context += `\n\n=== NOTES (${notes.length} notes) ===\n`;
        const sortedNotes = [...notes].sort((a, b) => 
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

      // Get tasks for this project
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

      // Get events for this project
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

      // Get related clients
      if (projectData?.clientRoles && projectData.clientRoles.length > 0) {
        context += `\n\n=== RELATED CLIENTS (${projectData.clientRoles.length} clients) ===\n`;
        for (const cr of projectData.clientRoles) {
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

/**
 * Restrict tool access based on context - add filters to tool parameters
 */
function restrictToolAccess(toolName: string, params: any, clientId?: string, projectId?: string): any {
  const restricted = { ...params };

  if (clientId) {
    // When in client context, restrict tools to this client
    switch (toolName) {
      case 'searchClients':
        // Only return the current client
        restricted.searchTerm = undefined;
        restricted.status = undefined;
        restricted.type = undefined;
        // We'll filter results instead
        break;
      case 'searchProjects':
        // Only return projects where client has a role - force the clientId
        restricted.clientId = clientId;
        break;
      case 'searchDocuments':
        restricted.clientId = clientId;
        break;
      case 'getKnowledgeBank':
        restricted.clientId = clientId;
        break;
      case 'getNotes':
        restricted.clientId = clientId;
        break;
      case 'getEvents':
        restricted.clientId = clientId;
        break;
      case 'createNote':
      case 'createKnowledgeBankEntry':
      case 'createEvent':
      case 'createTask':
        // Automatically link to current client
        if (!restricted.clientId) {
          restricted.clientId = clientId;
        }
        break;
    }
  } else if (projectId) {
    // When in project context, restrict tools to this project
    switch (toolName) {
      case 'searchProjects':
        // Only return the current project - force the projectId filter
        restricted.projectId = projectId;
        break;
      case 'searchDocuments':
        restricted.projectId = projectId;
        break;
      case 'getKnowledgeBank':
        restricted.projectId = projectId;
        break;
      case 'getNotes':
        restricted.projectId = projectId;
        break;
      case 'getEvents':
        restricted.projectId = projectId;
        break;
      case 'createNote':
      case 'createKnowledgeBankEntry':
      case 'createEvent':
      case 'createTask':
        // Automatically link to current project
        if (!restricted.projectId) {
          restricted.projectId = projectId;
        }
        break;
    }
  }

  return restricted;
}

/**
 * Filter tool results based on context
 */
function filterToolResults(toolName: string, result: any, clientId?: string, projectId?: string): any {
  if (!result) return result;

  if (clientId) {
    switch (toolName) {
      case 'searchClients':
        // Only return the current client
        if (Array.isArray(result)) {
          return result.filter((c: any) => c._id === clientId);
        }
        break;
      case 'searchProjects':
        // Only return projects where client has a role
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
        // Only return the current project
        if (Array.isArray(result)) {
          return result.filter((p: any) => p._id === projectId);
        }
        break;
    }
  }

  return result;
}

/**
 * Helper function to extract text from TipTap note content JSON
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
      fileMetadata,
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
      let action: {
        _id: Id<"chatActions">;
        sessionId: Id<"chatSessions">;
        messageId: Id<"chatMessages">;
        actionType: string;
        actionData: any;
        status: "pending" | "confirmed" | "cancelled" | "executed" | "failed";
        result?: any;
        error?: string;
        createdAt: string;
        updatedAt: string;
      } | null = null;

      try {
        // Get the action details
        action = await client.query(api.chatActions.get, {
          id: actionId as Id<"chatActions">,
        }) as {
          _id: Id<"chatActions">;
          sessionId: Id<"chatSessions">;
          messageId: Id<"chatMessages">;
          actionType: string;
          actionData: any;
          status: "pending" | "confirmed" | "cancelled" | "executed" | "failed";
          result?: any;
          error?: string;
          createdAt: string;
          updatedAt: string;
        } | null;

        if (!action) {
          throw new Error('Action not found');
        }

        // Check if action is already executed or cancelled
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

        // Execute the tool with authenticated client
        const result = await executeTool(action.actionType, action.actionData, client);

        // Mark action as executed
        await client.mutation(api.chatActions.markExecuted, {
          id: actionId as Id<"chatActions">,
          result: result,
        });

        // Determine item type and ID for navigation
        let itemId: string | undefined;
        let itemType: string | undefined;
        let clientId: string | undefined;

        if (result) {
          // The result is typically the ID of the created/updated item
          if (action.actionType === 'createNote' || action.actionType === 'updateNote') {
            itemId = result as string;
            itemType = 'note';
          } else if (action.actionType === 'createClient' || action.actionType === 'updateClient') {
            itemId = result as string;
            itemType = 'client';
          } else if (action.actionType === 'createProject' || action.actionType === 'updateProject') {
            itemId = result as string;
            itemType = 'project';
          } else if (action.actionType === 'createContact') {
            itemId = result as string;
            itemType = 'contact';
          } else if (action.actionType === 'createKnowledgeBankEntry') {
            itemId = result as string;
            itemType = 'knowledgeBankEntry';
            // Knowledge bank entries need clientId for navigation
            if (action.actionData.clientId) {
              clientId = action.actionData.clientId;
            }
          } else if (action.actionType === 'createReminder') {
            itemId = result as string;
            itemType = 'reminder';
            // Reminders don't have a dedicated page, so we'll just show success message
          }
        }

        return NextResponse.json({
          success: true,
          result,
          message: `Successfully executed ${action.actionType}`,
          itemId,
          itemType,
          clientId,
        });
      } catch (error) {
        // Log the full error for debugging
        console.error('Error executing action:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error details:', {
          actionId,
          actionType: action?.actionType,
          actionData: action?.actionData,
          error: errorMessage,
        });

        // Mark action as failed
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
          {
            success: false,
            error: errorMessage,
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

    // Auto-generate chat title if this is the first user message
    if (conversationHistory.length === 0) {
      try {
        const titleResponse = await fetch(TOGETHER_API_URL, {
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
                content: 'Generate a short, concise title (3-5 words maximum) for this conversation based on the user\'s question. Return ONLY the title, nothing else. Make it descriptive but brief.',
              },
              {
                role: 'user',
                content: message,
              },
            ],
            temperature: 0.7,
            max_tokens: 20,
          }),
        });

        if (titleResponse.ok) {
          const titleData = await titleResponse.json();
          const generatedTitle = titleData.choices[0]?.message?.content?.trim();
          
          if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length < 100) {
            // Update session title
            await client.mutation(api.chatSessions.update, {
              id: sessionId as Id<"chatSessions">,
              title: generatedTitle,
            });
          }
        }
      } catch (error) {
        // Silently fail - title generation is not critical
        console.error('Error generating chat title:', error);
      }
    }

    // Gather context
    const context = await gatherChatContext(client, sessionId, clientId, projectId);

    // Get client/project name for system prompt
    let contextName = '';
    if (clientId) {
      const clientData = await client.query(api.clients.get, {
        id: clientId as Id<"clients">,
      });
      contextName = clientData?.name || 'this client';
    } else if (projectId) {
      const projectData = await client.query(api.projects.get, {
        id: projectId as Id<"projects">,
      });
      contextName = projectData?.name || 'this project';
    }

    // Add file metadata to context if present
    let fileContext = '';
    if (fileMetadata) {
      fileContext = `\n\nFILE UPLOADED:\n`;
      fileContext += `Filename: ${fileMetadata.fileName}\n`;
      fileContext += `Size: ${(fileMetadata.fileSize / 1024).toFixed(2)} KB\n`;
      fileContext += `Type: ${fileMetadata.fileType}\n`;
      fileContext += `Storage ID: ${fileMetadata.fileStorageId}\n`;
      fileContext += `\nThe user has uploaded a file and wants you to help process and file it. You can use the analyze-file API endpoint or existing document processing tools to help organize this file.`;
    }

    // Build system prompt with tools
    let systemPromptBase = '';
    if (clientId) {
      systemPromptBase = `You are an AI assistant specialized in ${contextName}. You have comprehensive knowledge about this client including:
- All knowledge bank entries, documents, notes, contacts, deals, tasks, and events
- Related projects where this client has a role
- You should NOT access information about other clients unless explicitly asked
- You are an expert in this client's history, projects, and relationship
- When using tools, you should focus on data related to ${contextName} only
- IMPORTANT: When calling tools like searchProjects, searchDocuments, getKnowledgeBank, etc., you do NOT need to specify the clientId parameter - it will be automatically filtered to this client (${clientId}). Just call the tool without clientId.`;
    } else if (projectId) {
      systemPromptBase = `You are an AI assistant specialized in ${contextName}. You have comprehensive knowledge about this project including:
- All knowledge bank entries, documents, notes, tasks, and events
- Related clients and their roles in this project
- You should NOT access information about other projects unless explicitly asked
- You are an expert in this project's details, status, and history
- When using tools, you should focus on data related to ${contextName} only
- IMPORTANT: When calling tools like searchDocuments, getKnowledgeBank, getNotes, etc., you do NOT need to specify the projectId parameter - it will be automatically filtered to this project (${projectId}). Just call the tool without projectId.`;
    } else {
      systemPromptBase = `You are an AI assistant for a real estate financing application. You help users manage clients, projects, documents, knowledge bank entries, and notes.`;
    }

    // Get current date/time for date parsing context
    const currentDateTime = new Date();
    const currentDateISO = currentDateTime.toISOString();
    const currentDateReadable = currentDateTime.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const currentTimeReadable = currentDateTime.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      timeZoneName: 'short' 
    });

    const systemPrompt = `${systemPromptBase}

CURRENT DATE AND TIME CONTEXT (CRITICAL FOR DATE PARSING):
- Current date/time (ISO): ${currentDateISO}
- Current date (readable): ${currentDateReadable}
- Current time (readable): ${currentTimeReadable}
- When user says "today", it means: ${currentDateReadable}
- When user says "tomorrow", it means: ${new Date(currentDateTime.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
- Always use the current date/time above when converting relative dates like "today", "tomorrow", "next week", etc.

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

User: "Create a reminder to call Kristian tomorrow at 3pm"
Assistant: I'll help you create that reminder. First, let me search for the client "Kristian" to link the reminder properly.
<TOOL_CALL>
{
  "name": "searchClients",
  "arguments": {
    "searchTerm": "Kristian"
  }
}
</TOOL_CALL>
[After getting client results, use the client ID in createReminder]

User: "Create 4 reminders: Call Alex at 10pm, Send proposal at 11pm, Review emails at midnight, Post to LinkedIn at 1am"
Assistant: I'll create all 4 reminders for you. Let me create them all at once:
<TOOL_CALL>
{"name": "createReminder", "arguments": {"title": "Call Alex", "scheduledFor": "2025-11-21T22:00:00Z"}}
</TOOL_CALL>
<TOOL_CALL>
{"name": "createReminder", "arguments": {"title": "Send proposal", "scheduledFor": "2025-11-21T23:00:00Z"}}
</TOOL_CALL>
<TOOL_CALL>
{"name": "createReminder", "arguments": {"title": "Review emails", "scheduledFor": "2025-11-22T00:00:00Z"}}
</TOOL_CALL>
<TOOL_CALL>
{"name": "createReminder", "arguments": {"title": "Post to LinkedIn", "scheduledFor": "2025-11-22T01:00:00Z"}}
</TOOL_CALL>
[All 4 reminders will be created together - don't ask for confirmation one-by-one]

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
7. If a file has been uploaded, help the user process and file it appropriately using available tools

CRITICAL RULES FOR CREATING REMINDERS AND TASKS:

1. BULK CREATION (IMPORTANT):
   - When a user requests MULTIPLE reminders or tasks (e.g., "create 4 reminders", "make me reminders for X, Y, Z"), you MUST create ALL of them in a SINGLE response
   - Use MULTIPLE <TOOL_CALL> tags, one for each reminder/task
   - Example for 4 reminders:
     <TOOL_CALL>
     {"name": "createReminder", "arguments": {"title": "Reminder 1", "scheduledFor": "..."}}
     </TOOL_CALL>
     <TOOL_CALL>
     {"name": "createReminder", "arguments": {"title": "Reminder 2", "scheduledFor": "..."}}
     </TOOL_CALL>
     <TOOL_CALL>
     {"name": "createReminder", "arguments": {"title": "Reminder 3", "scheduledFor": "..."}}
     </TOOL_CALL>
     <TOOL_CALL>
     {"name": "createReminder", "arguments": {"title": "Reminder 4", "scheduledFor": "..."}}
     </TOOL_CALL>
   - Do NOT ask for confirmation one-by-one - create all of them and let the system handle bulk confirmation
   - If there are client ambiguities across multiple items, ask ONCE about all of them together (e.g., "I found multiple possible clients for these reminders. Should I proceed without linking them to specific clients?")

2. CLIENT SEARCH (OPTIONAL BUT RECOMMENDED):
   - Try to search for clients FIRST using searchClients tool before creating reminders or tasks
   - If a user mentions a client name (e.g., "Kristian", "ABC Company"), you SHOULD call searchClients with searchTerm to find the exact client ID
   - If multiple clients match or no client is found, proceed WITHOUT a clientId - client linking is optional
   - If you can't determine the client clearly, proceed without it - don't block creation

3. DATE VALIDATION (MANDATORY):
   - Dates MUST be in ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ (e.g., "2025-11-20T15:00:00Z")
   - NEVER use shell command syntax like $(date +'%Y-%m-%dT15:00:00Z') - this is invalid
   - ALWAYS use the CURRENT DATE AND TIME CONTEXT provided above when converting relative dates
   - Convert natural language dates to ISO format using the current date/time context:
     * "today" → use ${currentDateReadable} (${currentDateISO.split('T')[0]})
     * "tomorrow" → use ${new Date(currentDateTime.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} (${new Date(currentDateTime.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]})
     * "today at 3pm" → ${currentDateISO.split('T')[0]}T15:00:00Z (if time hasn't passed) or tomorrow if time has passed
     * "tomorrow at 3pm" → ${new Date(currentDateTime.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]}T15:00:00Z
     * "next Monday at 10am" → calculate the date from today and use 10:00:00Z
   - Always use UTC timezone (Z suffix) unless user specifies otherwise
   - CRITICAL: When user says "today", you MUST use the current date shown above, NOT yesterday or any other date
   - If date parsing fails, ask the user to clarify the exact date and time

3. FOLLOW-UP QUESTIONS:
   - If a client name is ambiguous (multiple matches), ask: "I found multiple clients matching '[name]'. Which one did you mean: [list options]?"
   - If a client is not found, ask: "I couldn't find a client named '[name]'. Would you like me to search again with different terms, or create a new client?"
   - If a date is unclear or invalid, ask: "I need clarification on the date/time. Could you specify: [what's unclear]?"
   - If creating a reminder/task without a client but context suggests one, ask: "Should I link this to [client name]?"

4. ERROR HANDLING:
   - If tool execution fails with a validation error, read the error message carefully
   - Common errors:
     * Invalid date format → convert to ISO format and try again
     * Client not found → use searchClients first, then retry
     * Multiple clients found → ask user to specify which one
   - Always provide helpful error messages to the user explaining what went wrong and how to fix it

5. WORKFLOW FOR REMINDERS/TASKS:
   Step 1: Extract client name from user request (if mentioned)
   Step 2: If client mentioned → call searchClients with searchTerm
   Step 3: If multiple matches → ask user to clarify
   Step 4: If no matches → ask user to clarify or create client
   Step 5: Convert date/time to ISO format
   Step 6: Validate date format is correct
   Step 7: Call createReminder or createTask with validated parameters

${context}${fileContext}`;

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
    const displayContent = aiResponse.replace(/<TOOL_CALL>\s*[\s\S]*?\s*<\/TOOL_CALL>/g, '').trim();

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
              // Restrict tool access based on context
              const restrictedParams = restrictToolAccess(toolCall.name, params, clientId, projectId);
              const result = await executeTool(toolCall.name, restrictedParams, client);
              
              // Filter results if in context mode
              const filteredResult = filterToolResults(toolCall.name, result, clientId, projectId);
              
              toolResults.push({
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                result: filteredResult,
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
      let iterationCount = 0;
      const maxIterations = 3; // Prevent infinite loops
      let currentMessages = [...messages];
      let currentAiResponse = aiResponse;
      let finalContent = '';
      let totalTokens = data.usage?.total_tokens || 0;

      // Keep iterating until AI stops calling tools or we hit max iterations
      while (iterationCount < maxIterations) {
        iterationCount++;
        
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

        // Check for more tool calls in follow-up
        const followUpToolCalls = parseToolCalls(followUpContent);
        finalContent = followUpContent.replace(/<TOOL_CALL>\s*[\s\S]*?\s*<\/TOOL_CALL>/g, '').trim();

        // If no more tool calls, we're done
        if (!followUpToolCalls || followUpToolCalls.length === 0) {
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
              const params = JSON.parse(toolCall.arguments);
              // Restrict tool access based on context
              const restrictedParams = restrictToolAccess(toolCall.name, params, clientId, projectId);
              const result = await executeTool(toolCall.name, restrictedParams, client);
              
              // Filter results if in context mode
              const filteredResult = filterToolResults(toolCall.name, result, clientId, projectId);
              
              toolResults.push({
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                result: filteredResult,
              });
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
          break;
        }

        // If no new tool results, we're done
        if (toolResults.length === 0) {
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

