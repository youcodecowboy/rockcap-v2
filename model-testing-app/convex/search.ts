import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Global search across all entities: clients, companies, deals, documents, contacts, and knowledge bank entries
 */
export const globalSearch = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const searchQuery = args.query.toLowerCase().trim();
    const limit = args.limit || 10;

    if (!searchQuery) {
      return {
        clients: [],
        companies: [],
        deals: [],
        documents: [],
        contacts: [],
        knowledgeBankEntries: [],
      };
    }

    // Search all entities in parallel
    const [allClients, allCompanies, allDeals, allDocuments, allContacts, allKnowledgeBankEntries] = await Promise.all([
      ctx.db.query("clients").filter((q) => q.neq(q.field("isDeleted"), true)).collect(),
      ctx.db.query("companies").collect(),
      ctx.db.query("deals").collect(),
      ctx.db.query("documents").filter((q) => q.neq(q.field("isDeleted"), true)).collect(),
      ctx.db.query("contacts").filter((q) => q.neq(q.field("isDeleted"), true)).collect(),
      ctx.db.query("knowledgeBankEntries").filter((q) => q.neq(q.field("isDeleted"), true)).collect(),
    ]);

    // Filter clients
    const clients = allClients
      .filter((client) => {
        const nameMatch = client.name?.toLowerCase().includes(searchQuery);
        const companyMatch = client.companyName?.toLowerCase().includes(searchQuery);
        const emailMatch = client.email?.toLowerCase().includes(searchQuery);
        const phoneMatch = client.phone?.toLowerCase().includes(searchQuery);
        const addressMatch = client.address?.toLowerCase().includes(searchQuery);
        const cityMatch = client.city?.toLowerCase().includes(searchQuery);
        const stateMatch = client.state?.toLowerCase().includes(searchQuery);
        
        return nameMatch || companyMatch || emailMatch || phoneMatch || addressMatch || cityMatch || stateMatch;
      })
      .slice(0, limit)
      .map((client) => ({
        id: client._id,
        name: client.name,
        companyName: client.companyName,
        email: client.email,
        phone: client.phone,
        status: client.status,
        type: client.type,
      }));

    // Filter companies
    const companies = allCompanies
      .filter((company) => {
        const nameMatch = company.name?.toLowerCase().includes(searchQuery);
        const domainMatch = company.domain?.toLowerCase().includes(searchQuery);
        const industryMatch = company.industry?.toLowerCase().includes(searchQuery);
        const cityMatch = company.city?.toLowerCase().includes(searchQuery);
        const stateMatch = company.state?.toLowerCase().includes(searchQuery);
        
        return nameMatch || domainMatch || industryMatch || cityMatch || stateMatch;
      })
      .slice(0, limit)
      .map((company) => ({
        id: company._id,
        name: company.name,
        domain: company.domain,
        industry: company.industry,
        city: company.city,
        state: company.state,
        hubspotLifecycleStageName: company.hubspotLifecycleStageName,
      }));

    // Filter deals
    const deals = allDeals
      .filter((deal) => {
        const nameMatch = deal.name?.toLowerCase().includes(searchQuery);
        const dealTypeMatch = deal.dealType?.toLowerCase().includes(searchQuery);
        const notesMatch = deal.notes?.toLowerCase().includes(searchQuery);
        const stageMatch = deal.stageName?.toLowerCase().includes(searchQuery);
        
        return nameMatch || dealTypeMatch || notesMatch || stageMatch;
      })
      .slice(0, limit)
      .map((deal) => ({
        id: deal._id,
        name: deal.name,
        amount: deal.amount,
        dealType: deal.dealType,
        stageName: deal.stageName,
        pipelineName: deal.pipelineName,
        closeDate: deal.closeDate,
      }));

    // Filter documents
    const documents = allDocuments
      .filter((doc) => {
        const fileNameMatch = doc.fileName?.toLowerCase().includes(searchQuery);
        const summaryMatch = doc.summary?.toLowerCase().includes(searchQuery);
        const clientMatch = doc.clientName?.toLowerCase().includes(searchQuery);
        const projectMatch = doc.projectName?.toLowerCase().includes(searchQuery) ||
                            doc.suggestedProjectName?.toLowerCase().includes(searchQuery);
        
        return fileNameMatch || summaryMatch || clientMatch || projectMatch;
      })
      .slice(0, limit)
      .map((doc) => ({
        id: doc._id,
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileTypeDetected: doc.fileTypeDetected,
        summary: doc.summary,
        clientName: doc.clientName,
        projectName: doc.projectName || doc.suggestedProjectName,
        category: doc.category,
      }));

    // Filter contacts
    const contacts = allContacts
      .filter((contact) => {
        const nameMatch = contact.name?.toLowerCase().includes(searchQuery);
        const emailMatch = contact.email?.toLowerCase().includes(searchQuery);
        const phoneMatch = contact.phone?.toLowerCase().includes(searchQuery);
        const roleMatch = contact.role?.toLowerCase().includes(searchQuery);
        const companyMatch = contact.company?.toLowerCase().includes(searchQuery);
        
        return nameMatch || emailMatch || phoneMatch || roleMatch || companyMatch;
      })
      .slice(0, limit)
      .map((contact) => ({
        id: contact._id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        role: contact.role,
        company: contact.company,
      }));

    // Filter knowledge bank entries
    const knowledgeBankEntries = allKnowledgeBankEntries
      .filter((entry) => {
        const titleMatch = entry.title?.toLowerCase().includes(searchQuery);
        const contentMatch = entry.content?.toLowerCase().includes(searchQuery);
        const keyPointMatch = entry.keyPoints?.some(kp => kp.toLowerCase().includes(searchQuery));
        const tagMatch = entry.tags?.some(tag => tag.toLowerCase().includes(searchQuery));
        
        return titleMatch || contentMatch || keyPointMatch || tagMatch;
      })
      .slice(0, limit)
      .map((entry) => {
        // Get client name if available
        let clientName: string | undefined;
        if (entry.clientId) {
          const client = allClients.find(c => c._id === entry.clientId);
          clientName = client?.name;
        }
        
        return {
          id: entry._id,
          title: entry.title,
          content: entry.content.substring(0, 150) + (entry.content.length > 150 ? '...' : ''),
          entryType: entry.entryType,
          keyPoints: entry.keyPoints,
          tags: entry.tags,
          clientId: entry.clientId,
          clientName,
          projectId: entry.projectId,
        };
      });

    return {
      clients,
      companies,
      deals,
      documents,
      contacts,
      knowledgeBankEntries,
    };
  },
});

