import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table - user profiles (Clerk manages auth, we store extra data)
  users: defineTable({
    clerkId: v.optional(v.string()), // Clerk user ID (optional for backward compatibility)
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),
  
  // Clients table - unified (prospects are clients with status="prospect")
  clients: defineTable({
    name: v.string(),
    type: v.optional(v.string()), // lender, borrower, real-estate-developer, etc.
    status: v.optional(v.union(
      v.literal("prospect"),
      v.literal("active"),
      v.literal("archived"),
      v.literal("past")
    )),
    companyName: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    industry: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    lastContactDate: v.optional(v.string()),
    enrichmentScore: v.optional(v.number()),
    source: v.optional(v.union(
      v.literal("apollo"),
      v.literal("zoominfo"),
      v.literal("real-estate-db"),
      v.literal("manual"),
      v.literal("other"),
      v.literal("hubspot")
    )),
    assignedTo: v.optional(v.string()),
    metadata: v.optional(v.any()), // Flexible metadata object
    // HubSpot integration fields
    hubspotCompanyId: v.optional(v.string()),
    hubspotUrl: v.optional(v.string()),
    lastHubSpotSync: v.optional(v.string()),
    hubspotLifecycleStage: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .index("by_name", ["name"])
    .index("by_hubspot_id", ["hubspotCompanyId"]),

  // Companies table - HubSpot companies (prospects, separate from clients)
  // Companies can be promoted to clients when they become active
  companies: defineTable({
    name: v.string(),
    domain: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
    industry: v.optional(v.string()),
    type: v.optional(v.string()), // Company type: developer, lender, etc.
    website: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    // Link to promoted client (if promoted)
    promotedToClientId: v.optional(v.id("clients")),
    // HubSpot integration fields
    hubspotCompanyId: v.string(),
    hubspotUrl: v.optional(v.string()),
    hubspotLifecycleStage: v.optional(v.string()), // Lifecycle stage ID
    hubspotLifecycleStageName: v.optional(v.string()), // Lifecycle stage name (human-readable)
    hubspotOwnerId: v.optional(v.string()), // HubSpot owner/user ID
    // Multiple contact associations (a company can be linked to multiple contacts)
    linkedContactIds: v.optional(v.array(v.id("contacts"))), // Internal contact IDs
    hubspotContactIds: v.optional(v.array(v.string())), // HubSpot contact IDs
    // Multiple deal associations (a company can be linked to multiple deals)
    linkedDealIds: v.optional(v.array(v.id("deals"))), // Internal deal IDs
    hubspotDealIds: v.optional(v.array(v.string())), // HubSpot deal IDs
    lastContactedDate: v.optional(v.string()),
    lastActivityDate: v.optional(v.string()),
    lastHubSpotSync: v.optional(v.string()),
    metadata: v.optional(v.any()), // Custom properties from HubSpot
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_name", ["name"])
    .index("by_hubspot_id", ["hubspotCompanyId"])
    .index("by_promoted", ["promotedToClientId"])
    .index("by_lifecycle_stage", ["hubspotLifecycleStage"])
    .index("by_owner", ["hubspotOwnerId"]),

  // Projects table - supports many-to-many with clients via clientRoles
  projects: defineTable({
    name: v.string(),
    clientRoles: v.array(v.object({
      clientId: v.string(),
      role: v.string(), // e.g., "borrower", "lender", "developer"
    })),
    description: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("completed"),
      v.literal("on-hold"),
      v.literal("cancelled")
    )),
    lifecycleStage: v.optional(v.union(
      v.literal("prospective"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("on-hold"),
      v.literal("cancelled"),
      v.literal("archived")
    )),
    tags: v.optional(v.array(v.string())),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    expectedCompletionDate: v.optional(v.string()),
    loanNumber: v.optional(v.string()),
    loanAmount: v.optional(v.number()),
    interestRate: v.optional(v.number()),
    notes: v.optional(v.string()),
    metadata: v.optional(v.any()), // Flexible metadata object
    // HubSpot integration fields
    hubspotDealId: v.optional(v.string()),
    hubspotUrl: v.optional(v.string()),
    lastHubSpotSync: v.optional(v.string()),
    hubspotPipeline: v.optional(v.string()),
    hubspotStage: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_client", ["clientRoles"])
    .index("by_hubspot_id", ["hubspotDealId"]),

  // Documents table - stores file references and analysis results
  documents: defineTable({
    // File storage reference (Convex file storage ID)
    fileStorageId: v.optional(v.id("_storage")),
    // File metadata
    fileName: v.string(),
    fileSize: v.number(),
    fileType: v.string(),
    uploadedAt: v.string(),
    // Analysis results
    summary: v.string(),
    fileTypeDetected: v.string(),
    category: v.string(),
    reasoning: v.string(),
    confidence: v.number(),
    tokensUsed: v.number(),
    // Links to clients/projects (flexible, can be null)
    clientId: v.optional(v.id("clients")),
    clientName: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    projectName: v.optional(v.string()),
    suggestedClientName: v.optional(v.string()),
    suggestedProjectName: v.optional(v.string()),
    // Document code for filing system (e.g., "FIRESIDE-VAL-WELLINGTON-201125")
    documentCode: v.optional(v.string()),
    // Flag to indicate if document belongs to client's Base Documents (not project-specific)
    isBaseDocument: v.optional(v.boolean()),
    // Extracted data (stored as JSON)
    extractedData: v.optional(v.any()),
    // Status
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("error")
    )),
    error: v.optional(v.string()),
    savedAt: v.string(),
  })
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_category", ["category"])
    .index("by_status", ["status"]),

  // Internal Documents table - internal documents that can link to clients/projects
  internalDocuments: defineTable({
    // File storage reference (Convex file storage ID)
    fileStorageId: v.optional(v.id("_storage")),
    // File metadata
    fileName: v.string(),
    fileSize: v.number(),
    fileType: v.string(),
    uploadedAt: v.string(),
    // Document code for filing system (e.g., "ROCK-INT-TOPIC-251120")
    documentCode: v.string(),
    // Analysis results
    summary: v.string(),
    fileTypeDetected: v.string(),
    category: v.string(),
    reasoning: v.string(),
    confidence: v.number(),
    tokensUsed: v.number(),
    // Links to clients/projects (optional - can link to one client and multiple projects)
    linkedClientId: v.optional(v.id("clients")),
    clientName: v.optional(v.string()),
    linkedProjectIds: v.optional(v.array(v.id("projects"))),
    projectNames: v.optional(v.array(v.string())),
    // Extracted data (stored as JSON)
    extractedData: v.optional(v.any()),
    // Status
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("error")
    )),
    error: v.optional(v.string()),
    savedAt: v.string(),
    // Folder organization (optional - for organizing internal documents)
    folderId: v.optional(v.string()),
  })
    .index("by_linked_client", ["linkedClientId"])
    .index("by_uploadedAt", ["uploadedAt"])
    .index("by_category", ["category"])
    .index("by_folder", ["folderId"]),

  // Internal Document Folders table - for organizing internal documents
  internalDocumentFolders: defineTable({
    name: v.string(),
    createdAt: v.string(),
  })
    .index("by_name", ["name"]),

  // Contacts table - can be linked to clients or projects
  contacts: defineTable({
    name: v.string(),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()), // Legacy field - kept for backward compatibility, use linkedCompanyIds instead
    notes: v.optional(v.string()),
    // Links (flexible)
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    sourceDocumentId: v.optional(v.id("documents")),
    // HubSpot integration fields
    hubspotContactId: v.optional(v.string()),
    hubspotUrl: v.optional(v.string()),
    hubspotLifecycleStage: v.optional(v.string()), // Lifecycle stage ID
    hubspotLifecycleStageName: v.optional(v.string()), // Lifecycle stage name (human-readable)
    hubspotOwnerId: v.optional(v.string()), // HubSpot owner/user ID
    // Multiple company associations (a contact can be linked to multiple companies)
    linkedCompanyIds: v.optional(v.array(v.id("companies"))), // Internal company IDs
    hubspotCompanyIds: v.optional(v.array(v.string())), // HubSpot company IDs
    // Multiple deal associations (a contact can be linked to multiple deals)
    linkedDealIds: v.optional(v.array(v.id("deals"))), // Internal deal IDs
    hubspotDealIds: v.optional(v.array(v.string())), // HubSpot deal IDs
    lastContactedDate: v.optional(v.string()),
    lastActivityDate: v.optional(v.string()),
    lastHubSpotSync: v.optional(v.string()),
    metadata: v.optional(v.any()), // Custom properties from HubSpot
    createdAt: v.string(),
    updatedAt: v.optional(v.string()), // Add updatedAt for contacts too
  })
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_document", ["sourceDocumentId"])
    .index("by_hubspot_id", ["hubspotContactId"])
    .index("by_email", ["email"])
    .index("by_owner", ["hubspotOwnerId"]),

  // Deals table - HubSpot deals for prospecting (this is what they actually use)
  deals: defineTable({
    // Deal name
    name: v.string(),
    // Deal amount
    amount: v.optional(v.number()),
    // HubSpot deal stage (ID)
    stage: v.optional(v.string()), // Stage ID from HubSpot
    // HubSpot stage name (resolved from stage ID)
    stageName: v.optional(v.string()), // Human-readable stage name
    // HubSpot pipeline (ID)
    pipeline: v.optional(v.string()), // Pipeline ID from HubSpot
    // HubSpot pipeline name (resolved from pipeline ID)
    pipelineName: v.optional(v.string()), // Human-readable pipeline name
    // Close date
    closeDate: v.optional(v.string()),
    // Last contacted date
    lastContactedDate: v.optional(v.string()),
    // Last activity date
    lastActivityDate: v.optional(v.string()),
    // Deal type
    dealType: v.optional(v.string()),
    // Next step
    nextStep: v.optional(v.string()),
    // Associated contacts (from HubSpot associations)
    contactIds: v.optional(v.array(v.string())), // HubSpot contact IDs
    // Associated companies (from HubSpot associations)
    companyIds: v.optional(v.array(v.string())), // HubSpot company IDs
    // Link to our contacts table (if synced)
    linkedContactIds: v.optional(v.array(v.id("contacts"))),
    // Link to our companies table (if synced)
    linkedCompanyIds: v.optional(v.array(v.id("companies"))),
    // Deal status for prospecting
    status: v.optional(v.union(
      v.literal("new"),
      v.literal("contacted"),
      v.literal("qualified"),
      v.literal("negotiation"),
      v.literal("closed-won"),
      v.literal("closed-lost")
    )),
    // Priority
    priority: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    )),
    assignedTo: v.optional(v.string()),
    hubspotOwnerId: v.optional(v.string()), // HubSpot owner/user ID
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    // HubSpot integration fields
    hubspotDealId: v.string(),
    hubspotUrl: v.optional(v.string()),
    lastHubSpotSync: v.optional(v.string()),
    // Custom properties from HubSpot
    metadata: v.optional(v.any()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_stage", ["stage"])
    .index("by_pipeline", ["pipeline"])
    .index("by_status", ["status"])
    .index("by_hubspot_id", ["hubspotDealId"])
    .index("by_close_date", ["closeDate"])
    .index("by_owner", ["hubspotOwnerId"]),

  // Unified activities table - activities associated with contacts, companies, or deals from HubSpot
  // Activities can be linked to multiple entities (e.g., a call might be associated with a contact, company, and deal)
  activities: defineTable({
    // Activity can be linked to one or more entities
    contactId: v.optional(v.id("contacts")),
    companyId: v.optional(v.id("companies")),
    dealId: v.optional(v.id("deals")),
    // HubSpot IDs for associations (if not yet synced to internal IDs)
    hubspotContactIds: v.optional(v.array(v.string())),
    hubspotCompanyIds: v.optional(v.array(v.string())),
    hubspotDealIds: v.optional(v.array(v.string())),
    // Activity details
    activityType: v.string(), // e.g., "note", "call", "email", "meeting", "task", "ticket", etc.
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    direction: v.optional(v.union(
      v.literal("inbound"),
      v.literal("outbound")
    )),
    // Activity date/time
    activityDate: v.string(),
    // Activity owner/creator
    hubspotOwnerId: v.optional(v.string()), // HubSpot owner/user ID who created the activity
    // HubSpot integration fields
    hubspotActivityId: v.string(), // Unique HubSpot activity ID
    hubspotUrl: v.optional(v.string()),
    lastHubSpotSync: v.optional(v.string()),
    // Custom properties from HubSpot
    metadata: v.optional(v.any()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_contact", ["contactId"])
    .index("by_company", ["companyId"])
    .index("by_deal", ["dealId"])
    .index("by_activity_type", ["activityType"])
    .index("by_activity_date", ["activityDate"])
    .index("by_hubspot_id", ["hubspotActivityId"])
    .index("by_owner", ["hubspotOwnerId"]),
  
  // Legacy deal activities table - kept for backward compatibility
  // New activities should use the unified "activities" table
  dealActivities: defineTable({
    dealId: v.id("deals"),
    activityType: v.string(), // e.g., "note", "call", "email", "meeting", "task"
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    direction: v.optional(v.union(
      v.literal("inbound"),
      v.literal("outbound")
    )),
    // Activity date/time
    activityDate: v.string(),
    // Associated contact/company (if applicable)
    contactId: v.optional(v.id("contacts")),
    companyId: v.optional(v.id("companies")),
    // HubSpot integration fields
    hubspotActivityId: v.string(),
    hubspotUrl: v.optional(v.string()),
    lastHubSpotSync: v.optional(v.string()),
    // Custom properties from HubSpot
    metadata: v.optional(v.any()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_deal", ["dealId"])
    .index("by_activity_type", ["activityType"])
    .index("by_activity_date", ["activityDate"])
    .index("by_hubspot_id", ["hubspotActivityId"]),

  // Leads table - contacts with opportunity/lead lifecycle stages (prospecting)
  // A contact can be both a contact AND a lead (like companies can be clients)
  leads: defineTable({
    // Link to contact (a lead IS a contact, but with lead status)
    contactId: v.id("contacts"),
    // Lead-specific fields
    lifecycleStage: v.union(
      v.literal("lead"),
      v.literal("opportunity"),
      v.literal("marketingqualifiedlead"),
      v.literal("salesqualifiedlead")
    ),
    // Link to company (if associated)
    companyId: v.optional(v.id("companies")), // Will link to companies table when created
    companyName: v.optional(v.string()), // Denormalized for quick access
    // Lead status and tracking
    status: v.optional(v.union(
      v.literal("new"),
      v.literal("contacted"),
      v.literal("qualified"),
      v.literal("nurturing"),
      v.literal("converted"),
      v.literal("lost")
    )),
    priority: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    )),
    assignedTo: v.optional(v.string()),
    lastContactDate: v.optional(v.string()),
    nextFollowUpDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    // HubSpot integration fields
    hubspotContactId: v.string(), // HubSpot contact ID
    hubspotUrl: v.optional(v.string()),
    hubspotCompanyId: v.optional(v.string()), // HubSpot company ID
    hubspotCompanyUrl: v.optional(v.string()),
    lastHubSpotSync: v.optional(v.string()),
    // Custom properties from HubSpot
    metadata: v.optional(v.any()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_contact", ["contactId"])
    .index("by_company", ["companyId"])
    .index("by_status", ["status"])
    .index("by_lifecycle_stage", ["lifecycleStage"])
    .index("by_hubspot_contact_id", ["hubspotContactId"])
    .index("by_hubspot_company_id", ["hubspotCompanyId"])
    .index("by_assigned_to", ["assignedTo"]),

  // Enrichment suggestions - can apply to clients or projects
  enrichmentSuggestions: defineTable({
    type: v.union(
      v.literal("email"),
      v.literal("phone"),
      v.literal("address"),
      v.literal("company"),
      v.literal("contact"),
      v.literal("date"),
      v.literal("other")
    ),
    field: v.string(),
    value: v.any(), // Flexible value type
    source: v.string(),
    documentId: v.id("documents"),
    // Can be applied to either client or project
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    confidence: v.number(),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("skipped")
    )),
    createdAt: v.string(),
  })
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_document", ["documentId"])
    .index("by_status", ["status"]),

  // Prospecting context - document-based insights
  prospectingContext: defineTable({
    documentId: v.id("documents"),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    extractedAt: v.string(),
    // Key insights
    keyPoints: v.array(v.string()),
    painPoints: v.array(v.string()),
    opportunities: v.array(v.string()),
    decisionMakers: v.array(v.object({
      name: v.string(),
      role: v.optional(v.string()),
      context: v.optional(v.string()),
    })),
    // Business context
    businessContext: v.optional(v.object({
      industry: v.optional(v.string()),
      companySize: v.optional(v.string()),
      growthIndicators: v.optional(v.array(v.string())),
      challenges: v.optional(v.array(v.string())),
      goals: v.optional(v.array(v.string())),
    })),
    // Financial context
    financialContext: v.optional(v.object({
      budgetMentioned: v.optional(v.boolean()),
      budgetRange: v.optional(v.string()),
      investmentLevel: v.optional(v.string()),
      timeline: v.optional(v.string()),
    })),
    // Relationship context
    relationshipContext: v.optional(v.object({
      currentStage: v.optional(v.string()),
      relationshipStrength: v.optional(v.string()),
      lastInteraction: v.optional(v.string()),
      sentiment: v.optional(v.union(
        v.literal("positive"),
        v.literal("neutral"),
        v.literal("negative")
      )),
    })),
    // Competitive intelligence
    competitiveMentions: v.optional(v.array(v.object({
      competitor: v.optional(v.string()),
      context: v.optional(v.string()),
    }))),
    // Timeline
    timeline: v.optional(v.object({
      urgency: v.optional(v.union(
        v.literal("high"),
        v.literal("medium"),
        v.literal("low")
      )),
      deadlines: v.optional(v.array(v.string())),
      milestones: v.optional(v.array(v.string())),
    })),
    // Template snippets
    templateSnippets: v.optional(v.object({
      opening: v.optional(v.string()),
      valueProposition: v.optional(v.string()),
      callToAction: v.optional(v.string()),
    })),
    confidence: v.number(),
    tokensUsed: v.optional(v.number()),
  })
    .index("by_document", ["documentId"])
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"]),

  // Email templates
  emailTemplates: defineTable({
    name: v.string(),
    category: v.union(
      v.literal("first-contact"),
      v.literal("follow-up"),
      v.literal("proposal"),
      v.literal("check-in")
    ),
    prospectType: v.optional(v.union(
      v.literal("new-prospect"),
      v.literal("existing-prospect"),
      v.literal("reactivation")
    )),
    subject: v.string(),
    body: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_category", ["category"])
    .index("by_active", ["isActive"]),

  // Email funnels
  emailFunnels: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    prospectType: v.union(
      v.literal("new-prospect"),
      v.literal("existing-prospect"),
      v.literal("reactivation")
    ),
    templates: v.array(v.object({
      templateId: v.id("emailTemplates"),
      order: v.number(),
      delayDays: v.optional(v.number()),
    })),
    isActive: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_prospect_type", ["prospectType"])
    .index("by_active", ["isActive"]),

  // Prospecting emails
  prospectingEmails: defineTable({
    prospectId: v.optional(v.id("clients")), // Prospects are clients
    clientId: v.optional(v.id("clients")),
    templateId: v.optional(v.id("emailTemplates")),
    subject: v.string(),
    body: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("sent"),
      v.literal("bounced")
    ),
    enrichmentSummary: v.optional(v.object({
      keyPoints: v.optional(v.array(v.string())),
      painPoints: v.optional(v.array(v.string())),
      opportunities: v.optional(v.array(v.string())),
      usedSnippets: v.optional(v.array(v.string())),
    })),
    scheduledFor: v.optional(v.string()),
    sentAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.optional(v.string()),
  })
    .index("by_prospect", ["prospectId"])
    .index("by_client", ["clientId"])
    .index("by_status", ["status"]),

  // File upload queue - tracks background file processing jobs
  fileUploadQueue: defineTable({
    fileName: v.string(),
    fileSize: v.number(),
    fileType: v.string(),
    fileStorageId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("pending"),
      v.literal("uploading"),
      v.literal("analyzing"),
      v.literal("completed"),
      v.literal("error"),
      v.literal("needs_confirmation")
    ),
    progress: v.number(), // 0-100
    analysisResult: v.optional(v.any()), // AnalysisResult object
    documentId: v.optional(v.id("documents")),
    error: v.optional(v.string()),
    isRead: v.optional(v.boolean()), // For notification read status
    userId: v.optional(v.string()), // For future multi-user support
    hasCustomInstructions: v.optional(v.boolean()), // Flag to indicate if custom instructions were requested
    customInstructions: v.optional(v.string()), // Custom instructions for LLM analysis
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  // Knowledge Bank Entries - consolidated knowledge entries per client
  knowledgeBankEntries: defineTable({
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    sourceType: v.union(
      v.literal("document"),
      v.literal("email"),
      v.literal("manual"),
      v.literal("call_transcript")
    ),
    sourceId: v.optional(v.string()), // ID of source document/email/etc.
    entryType: v.union(
      v.literal("deal_update"),
      v.literal("call_transcript"),
      v.literal("email"),
      v.literal("document_summary"),
      v.literal("project_status"),
      v.literal("general")
    ),
    title: v.string(),
    content: v.string(), // Rich content/summary
    keyPoints: v.array(v.string()),
    metadata: v.optional(v.any()), // Flexible JSON for entry-specific data
    tags: v.array(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_entryType", ["entryType"])
    .index("by_sourceType", ["sourceType"]),

  // Notes - user-created notes
  notes: defineTable({
    title: v.string(),
    content: v.any(), // Rich text content (JSON format for editor)
    emoji: v.optional(v.string()), // Emoji icon for note
    userId: v.optional(v.id("users")), // User who owns this note (for unfiled notes only)
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    templateId: v.optional(v.id("noteTemplates")),
    knowledgeBankEntryIds: v.array(v.id("knowledgeBankEntries")),
    tags: v.array(v.string()),
    mentionedUserIds: v.optional(v.array(v.string())), // Array of user IDs mentioned (future-ready)
    lastSavedAt: v.optional(v.string()), // Timestamp of last save
    wordCount: v.optional(v.number()), // Word count for the note
    isDraft: v.optional(v.boolean()), // Draft state
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_template", ["templateId"])
    .index("by_user", ["userId"]),

  // Note Templates - templates for creating notes
  noteTemplates: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    template: v.any(), // JSON structure defining template layout
    knowledgeBankFields: v.array(v.string()), // Fields to pull from knowledge bank
    isActive: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_active", ["isActive"]),

  // Chat Sessions - AI assistant chat sessions
  chatSessions: defineTable({
    title: v.string(), // Auto-generated or user-set title
    contextType: v.union(
      v.literal("global"),
      v.literal("client"),
      v.literal("project")
    ),
    userId: v.optional(v.string()), // User ID (string for backward compatibility, will be id("users") in future)
    clientId: v.optional(v.id("clients")), // If context is client-specific
    projectId: v.optional(v.id("projects")), // If context is project-specific
    lastMessageAt: v.string(), // Timestamp of last message
    messageCount: v.number(), // Number of messages in session
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_contextType", ["contextType"])
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_lastMessageAt", ["lastMessageAt"]),

  // Chat Messages - Individual messages within chat sessions
  chatMessages: defineTable({
    sessionId: v.id("chatSessions"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(), // Message text content
    toolCalls: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
      arguments: v.string(), // JSON string of arguments
    }))),
    toolResults: v.optional(v.array(v.object({
      toolCallId: v.string(),
      result: v.string(), // JSON string of result
    }))),
    metadata: v.optional(v.any()), // For storing additional info (tokens used, etc.)
    createdAt: v.string(),
  })
    .index("by_session", ["sessionId"])
    .index("by_createdAt", ["createdAt"]),

  // Chat Actions - Pending actions requiring user confirmation
  chatActions: defineTable({
    sessionId: v.id("chatSessions"),
    messageId: v.id("chatMessages"),
    actionType: v.string(), // e.g., "createClient", "uploadFile", "updateProject"
    actionData: v.any(), // Parameters for the action
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("cancelled"),
      v.literal("executed"),
      v.literal("failed")
    ),
    result: v.optional(v.any()), // Result of executed action
    error: v.optional(v.string()), // Error message if failed
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_session", ["sessionId"])
    .index("by_status", ["status"])
    .index("by_message", ["messageId"]),

  // HubSpot Sync Configuration
  hubspotSyncConfig: defineTable({
    isRecurringSyncEnabled: v.boolean(),
    lastSyncAt: v.optional(v.string()),
    lastSyncStatus: v.optional(v.union(
      v.literal("success"),
      v.literal("error"),
      v.literal("in_progress")
    )),
    lastSyncStats: v.optional(v.object({
      companiesSynced: v.number(),
      contactsSynced: v.number(),
      leadsSynced: v.optional(v.number()),
      dealsSynced: v.number(),
      errors: v.number(),
    })),
    syncIntervalHours: v.optional(v.number()), // Hours between syncs
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_enabled", ["isRecurringSyncEnabled"]),

  // HubSpot Pipelines and Stages - store pipeline/stage definitions for ID to name mapping
  hubspotPipelines: defineTable({
    pipelineId: v.string(), // HubSpot pipeline ID
    pipelineName: v.string(), // Human-readable pipeline name
    displayOrder: v.number(),
    stages: v.array(v.object({
      stageId: v.string(), // HubSpot stage ID
      stageName: v.string(), // Human-readable stage name
      displayOrder: v.number(),
      metadata: v.optional(v.any()),
    })),
    lastSyncedAt: v.string(),
  })
    .index("by_pipeline_id", ["pipelineId"]),

  // Scenarios table - modeling scenarios linked to projects
  scenarios: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    data: v.optional(v.any()), // Handsontable-compatible data format
    createdAt: v.string(),
    updatedAt: v.string(),
    createdBy: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"]),

  // Model runs table - versioned model executions
  // Scenario results table - stores formula calculation results for version tracking
  scenarioResults: defineTable({
    scenarioId: v.id("scenarios"),
    version: v.number(),
    inputs: v.any(), // Map of input cell values (cellAddress -> value)
    outputs: v.any(), // Map of output cell values (cellAddress -> value)
    allValues: v.any(), // Complete snapshot (cellAddress -> value)
    extractedAt: v.string(), // ISO timestamp
  })
    .index("by_scenario", ["scenarioId"])
    .index("by_scenario_version", ["scenarioId", "version"]),

  modelRuns: defineTable({
    scenarioId: v.id("scenarios"),
    modelType: v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("other")
    ),
    version: v.number(),
    versionName: v.optional(v.string()),
    inputs: v.any(),
    outputs: v.optional(v.any()),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("error")
    ),
    error: v.optional(v.string()),
    runAt: v.string(),
    runBy: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_scenario", ["scenarioId"])
    .index("by_modelType", ["modelType"])
    .index("by_version", ["version"]),

  // Companies House Companies - companies tracked from Companies House API
  companiesHouseCompanies: defineTable({
    companyNumber: v.string(), // Unique company number from Companies House
    companyName: v.string(),
    sicCodes: v.array(v.string()), // Array of SIC codes
    address: v.optional(v.string()),
    registeredOfficeAddress: v.optional(v.any()), // Full address object
    registeredOfficeAddressHash: v.optional(v.string()), // Normalized hash for matching
    incorporationDate: v.optional(v.string()),
    companyStatus: v.optional(v.string()), // e.g., "active", "dissolved"
    hasNewCharges: v.optional(v.boolean()), // Flag for new charges
    lastCheckedAt: v.optional(v.string()), // ISO timestamp
    lastFullSyncAt: v.optional(v.string()), // ISO timestamp of last comprehensive sync
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_company_number", ["companyNumber"])
    .index("by_sic_code", ["sicCodes"])
    .index("by_last_checked", ["lastCheckedAt"])
    .index("by_new_charges", ["hasNewCharges"])
    .index("by_address_hash", ["registeredOfficeAddressHash"]),

  // Companies House Charges - charges (loans) for each company
  companiesHouseCharges: defineTable({
    companyId: v.id("companiesHouseCompanies"),
    chargeId: v.string(), // Unique charge ID from Companies House
    chargeDate: v.optional(v.string()),
    chargeDescription: v.optional(v.string()),
    chargeAmount: v.optional(v.number()),
    chargeStatus: v.optional(v.string()), // e.g., "outstanding", "satisfied"
    chargeeName: v.optional(v.string()), // Name of chargee
    pdfUrl: v.optional(v.string()), // Original PDF URL from Companies House
    pdfDocumentId: v.optional(v.id("_storage")), // Reference to stored PDF in Convex storage
    isNew: v.optional(v.boolean()), // Flag for newly detected charges
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_company", ["companyId"])
    .index("by_charge_date", ["chargeDate"])
    .index("by_status", ["chargeStatus"])
    .index("by_is_new", ["isNew"]),

  // Companies House PSC - Persons with Significant Control
  companiesHousePSC: defineTable({
    pscId: v.string(), // Unique PSC ID from Companies House
    companyId: v.id("companiesHouseCompanies"),
    pscType: v.union(
      v.literal("individual"),
      v.literal("corporate-entity"),
      v.literal("legal-person")
    ),
    name: v.string(),
    nationality: v.optional(v.string()),
    dateOfBirth: v.optional(v.object({
      month: v.optional(v.number()),
      year: v.optional(v.number()),
    })),
    address: v.optional(v.any()), // Address object
    naturesOfControl: v.optional(v.array(v.string())), // Array of control types
    notifiableOn: v.optional(v.string()), // ISO timestamp
    ceasedOn: v.optional(v.string()), // ISO timestamp
    // For corporate entities
    identification: v.optional(v.any()), // Corporate identification details
    // Links to other companies (for relationship mapping)
    linkedCompanyIds: v.optional(v.array(v.id("companiesHouseCompanies"))),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_company", ["companyId"])
    .index("by_psc_id", ["pscId"])
    .index("by_name", ["name"])
    .index("by_type", ["pscType"]),

  // Companies House Officers - Company officers/directors
  companiesHouseOfficers: defineTable({
    officerId: v.string(), // Unique officer ID from Companies House
    companyId: v.id("companiesHouseCompanies"),
    name: v.string(),
    officerRole: v.string(), // e.g., "director", "secretary"
    appointedOn: v.optional(v.string()), // ISO timestamp
    resignedOn: v.optional(v.string()), // ISO timestamp
    nationality: v.optional(v.string()),
    occupation: v.optional(v.string()),
    countryOfResidence: v.optional(v.string()),
    address: v.optional(v.any()), // Address object
    dateOfBirth: v.optional(v.object({
      month: v.optional(v.number()),
      year: v.optional(v.number()),
    })),
    // Links to other companies (for relationship mapping)
    linkedCompanyIds: v.optional(v.array(v.id("companiesHouseCompanies"))),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_company", ["companyId"])
    .index("by_officer_id", ["officerId"])
    .index("by_name", ["name"]),

  // Company Relationships - Links between companies through shared PSC/officers/addresses
  companyRelationships: defineTable({
    companyId1: v.id("companiesHouseCompanies"),
    companyId2: v.id("companiesHouseCompanies"),
    relationshipType: v.union(
      v.literal("shared_psc"),
      v.literal("shared_officer"),
      v.literal("shared_address"),
      v.literal("parent_subsidiary")
    ),
    sharedEntityId: v.optional(v.string()), // PSC ID, Officer ID, or address hash
    sharedEntityType: v.union(
      v.literal("psc"),
      v.literal("officer"),
      v.literal("address")
    ),
    strength: v.number(), // Number of shared connections (1, 2, 3+)
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_company1", ["companyId1"])
    .index("by_company2", ["companyId2"])
    .index("by_relationship_type", ["relationshipType"])
    .index("by_address_hash", ["sharedEntityId"]),

  // API Rate Limit Tracking - Track requests per 5-minute window
  apiRateLimit: defineTable({
    windowStart: v.string(), // ISO timestamp of window start
    requestCount: v.number(),
    lastRequestAt: v.string(), // ISO timestamp
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_window_start", ["windowStart"]),

  // Prospects - Sales/intelligence layer on top of Companies House companies
  prospects: defineTable({
    companyNumber: v.string(), // FK to companiesHouseCompanies.companyNumber
    companyId: v.optional(v.id("companiesHouseCompanies")), // Direct reference to company
    activeProjectScore: v.optional(v.number()), // Computed score based on planning apps + properties
    prospectTier: v.optional(v.union(
      v.literal("A"),
      v.literal("B"),
      v.literal("C"),
      v.literal("UNQUALIFIED")
    )),
    hasPlanningHits: v.optional(v.boolean()),
    hasOwnedPropertyHits: v.optional(v.boolean()),
    lastGauntletRunAt: v.optional(v.string()), // ISO timestamp
    owner: v.optional(v.string()), // CRM owner assignment
    notes: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_company_number", ["companyNumber"])
    .index("by_company_id", ["companyId"])
    .index("by_tier", ["prospectTier"])
    .index("by_score", ["activeProjectScore"])
    .index("by_last_gauntlet_run", ["lastGauntletRunAt"]),

  // Planning Applications - Planning application data from various sources
  planningApplications: defineTable({
    externalId: v.string(), // Unique ID from source (LPA ref, data.gov.uk entity ID, etc.)
    source: v.union(
      v.literal("planning_data_api"),
      v.literal("london_datahub"),
      v.literal("other")
    ),
    localAuthority: v.optional(v.string()),
    councilName: v.optional(v.string()), // Alternative name for local authority
    siteAddress: v.optional(v.string()),
    sitePostcode: v.optional(v.string()),
    geometryReference: v.optional(v.string()), // UPRN, lat/lng, or other geometry ref
    applicantName: v.optional(v.string()),
    applicantOrganisation: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("APPROVED"),
      v.literal("REFUSED"),
      v.literal("UNDER_CONSIDERATION"),
      v.literal("UNKNOWN")
    )),
    decisionDate: v.optional(v.string()), // ISO timestamp
    receivedDate: v.optional(v.string()), // ISO timestamp
    rawPayload: v.optional(v.any()), // Full JSON payload for debugging
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_external_id", ["externalId"])
    .index("by_source", ["source"])
    .index("by_postcode", ["sitePostcode"])
    .index("by_status", ["status"])
    .index("by_decision_date", ["decisionDate"]),

  // Company Planning Links - Many-to-many relationship between companies and planning apps
  companyPlanningLinks: defineTable({
    companyNumber: v.string(), // FK to companiesHouseCompanies.companyNumber
    planningApplicationId: v.id("planningApplications"),
    matchConfidence: v.union(
      v.literal("HIGH"),
      v.literal("MEDIUM"),
      v.literal("LOW")
    ),
    matchReason: v.string(), // e.g., "ORG_NAME_MATCH", "ADDRESS_MATCH", "PERSON_NAME_MATCH"
    createdAt: v.string(),
  })
    .index("by_company_number", ["companyNumber"])
    .index("by_planning_app", ["planningApplicationId"])
    .index("by_confidence", ["matchConfidence"]),

  // Property Titles - Property title data from Land & Property API
  propertyTitles: defineTable({
    titleNumber: v.string(), // Unique title number
    country: v.optional(v.string()), // e.g., "E&W" for England and Wales
    address: v.optional(v.string()),
    postcode: v.optional(v.string()),
    geometrySource: v.optional(v.union(
      v.literal("none"),
      v.literal("inspire_index"),
      v.literal("nps")
    )),
    geometryReference: v.optional(v.string()), // Optional geometry reference
    rawPayload: v.optional(v.any()), // Full JSON payload for debugging
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_title_number", ["titleNumber"])
    .index("by_postcode", ["postcode"]),

  // Company Property Links - Links between companies and property titles
  companyPropertyLinks: defineTable({
    companyNumber: v.string(), // FK to companiesHouseCompanies.companyNumber
    propertyTitleId: v.id("propertyTitles"),
    ownershipType: v.optional(v.union(
      v.literal("FREEHOLD"),
      v.literal("LEASEHOLD"),
      v.literal("UNKNOWN")
    )),
    fromDataset: v.union(
      v.literal("uk_companies_own_property"),
      v.literal("overseas_companies_own_property")
    ),
    acquiredDate: v.optional(v.string()), // ISO timestamp if available
    createdAt: v.string(),
  })
    .index("by_company_number", ["companyNumber"])
    .index("by_property_title", ["propertyTitleId"])
    .index("by_dataset", ["fromDataset"]),

  // Reminders table - user-specific reminders that trigger notifications
  reminders: defineTable({
    userId: v.id("users"), // User who created the reminder
    title: v.string(),
    description: v.optional(v.string()), // LLM-enhanced context
    scheduledFor: v.string(), // ISO timestamp - triggers notification at exact time
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")), // Link to task if reminder is about a task
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("dismissed"),
      v.literal("overdue")
    ),
    isRead: v.optional(v.boolean()), // For notification tracking
    llmContext: v.optional(v.any()), // LLM-generated summary/context
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_scheduledFor", ["scheduledFor"])
    .index("by_status", ["status"])
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"]),

  // Tasks table - task management with assignment and linking
  tasks: defineTable({
    createdBy: v.id("users"), // Who created the task
    assignedTo: v.optional(v.id("users")), // Who the task is assigned to (can be different from creator)
    title: v.string(),
    description: v.optional(v.string()), // What needs to happen
    notes: v.optional(v.string()), // Additional notes/context (editable)
    dueDate: v.optional(v.string()), // ISO timestamp
    status: v.union(
      v.literal("todo"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    priority: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    )),
    tags: v.optional(v.array(v.string())),
    clientId: v.optional(v.id("clients")), // Attached client
    projectId: v.optional(v.id("projects")), // Attached project
    reminderIds: v.optional(v.array(v.id("reminders"))), // Reminders linked to task
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_createdBy", ["createdBy"])
    .index("by_assignedTo", ["assignedTo"])
    .index("by_status", ["status"])
    .index("by_dueDate", ["dueDate"])
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"]),

  // Notifications table - unified notification system
  notifications: defineTable({
    userId: v.id("users"), // Required
    type: v.union(
      v.literal("file_upload"),
      v.literal("reminder"),
      v.literal("task")
    ),
    title: v.string(),
    message: v.string(),
    relatedId: v.optional(v.string()), // ID of related entity (reminder, task, etc.)
    isRead: v.optional(v.boolean()),
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_type", ["type"])
    .index("by_isRead", ["isRead"])
    .index("by_createdAt", ["createdAt"]),

  // User tags for task/reminder categorization (LLM uses these for matching)
  userTags: defineTable({
    userId: v.id("users"), // User who owns these tags
    tags: v.array(v.string()), // Array of tag strings (e.g., ["email", "call", "meeting", "follow-up"])
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"]),

  // Events table - Calendar events with Google Calendar compatibility
  events: defineTable({
    // Core fields
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startTime: v.string(), // ISO timestamp
    endTime: v.string(), // ISO timestamp
    allDay: v.optional(v.boolean()), // All-day event flag
    
    // Extended fields
    attendees: v.optional(v.array(v.object({
      email: v.optional(v.string()),
      name: v.optional(v.string()),
      responseStatus: v.optional(v.union(
        v.literal("needsAction"),
        v.literal("declined"),
        v.literal("tentative"),
        v.literal("accepted")
      )),
    }))),
    recurrence: v.optional(v.string()), // RRULE format for recurring events
    colorId: v.optional(v.string()), // Color coding (1-11, matching Google Calendar)
    visibility: v.optional(v.union(
      v.literal("default"),
      v.literal("public"),
      v.literal("private"),
      v.literal("confidential")
    )),
    status: v.optional(v.union(
      v.literal("confirmed"),
      v.literal("tentative"),
      v.literal("cancelled")
    )),
    
    // Google Calendar sync fields
    googleCalendarId: v.optional(v.string()), // Google Calendar ID (e.g., "primary")
    googleEventId: v.optional(v.string()), // Google Calendar event ID
    googleCalendarUrl: v.optional(v.string()), // URL to event in Google Calendar
    lastGoogleSync: v.optional(v.string()), // ISO timestamp of last sync
    syncStatus: v.optional(v.union(
      v.literal("synced"),
      v.literal("pending"),
      v.literal("failed"),
      v.literal("local_only")
    )),
    
    // Relations
    createdBy: v.id("users"), // User who created the event
    organizerId: v.optional(v.id("users")), // Event organizer (can be different from creator)
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    
    // Metadata
    reminders: v.optional(v.array(v.object({
      method: v.union(
        v.literal("email"),
        v.literal("popup")
      ),
      minutes: v.number(), // Minutes before event
    }))),
    attachments: v.optional(v.array(v.id("_storage"))), // File storage IDs
    conferenceData: v.optional(v.object({
      videoLink: v.optional(v.string()), // Video conference URL
      conferenceId: v.optional(v.string()),
      entryPoints: v.optional(v.array(v.object({
        entryPointType: v.optional(v.string()),
        uri: v.optional(v.string()),
        label: v.optional(v.string()),
      }))),
    })),
    metadata: v.optional(v.any()), // Flexible metadata object
    
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_start_time", ["startTime"])
    .index("by_user", ["createdBy"])
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_google_event_id", ["googleEventId"]),

  // Context cache for AI assistant - caches gathered context for clients/projects
  contextCache: defineTable({
    contextType: v.union(v.literal("client"), v.literal("project")),
    contextId: v.string(), // Store as string to handle both client and project IDs
    cachedContext: v.string(), // The formatted context string
    metadata: v.object({
      knowledgeBankCount: v.number(),
      documentsCount: v.number(),
      notesCount: v.number(),
      contactsCount: v.optional(v.number()),
      dealsCount: v.optional(v.number()),
      tasksCount: v.optional(v.number()),
      eventsCount: v.optional(v.number()),
      lastDataUpdate: v.string(), // Timestamp of most recent data item
    }),
    createdAt: v.string(),
    updatedAt: v.string(),
    expiresAt: v.string(), // TTL for cache invalidation (e.g., 24 hours)
  })
    .index("by_context", ["contextType", "contextId"]),

  // File Type Definitions - user-defined file types for the filing agent
  fileTypeDefinitions: defineTable({
    fileType: v.string(), // The name of the file type (e.g., "RedBook Valuation", "Initial Monitoring Report")
    category: v.string(), // The category it belongs to (e.g., "Appraisals", "Inspections")
    parentType: v.optional(v.string()), // If this is a subtype, reference the parent type (e.g., "Legal Documents")
    description: v.string(), // Description of what this file type is (minimum 100 words)
    keywords: v.array(v.string()), // Keywords that identify this file type
    identificationRules: v.array(v.string()), // Specific rules for identifying this file type
    categoryRules: v.optional(v.string()), // Why it belongs to this category
    exampleFileStorageId: v.optional(v.id("_storage")), // Reference to an example file
    exampleFileName: v.optional(v.string()), // Name of the example file
    isSystemDefault: v.optional(v.boolean()), // Whether this is a system default (read-only)
    isActive: v.boolean(), // Whether this definition is active
    createdBy: v.string(), // User ID who created this
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_file_type", ["fileType"])
    .index("by_category", ["category"])
    .index("by_parent_type", ["parentType"])
    .index("by_active", ["isActive"]),

  // Category Settings - Manage customizable categories for clients/projects
  categorySettings: defineTable({
    categoryType: v.union(
      v.literal("client_status"),
      v.literal("client_type"),
      v.literal("client_tag"),
      v.literal("prospecting_stage")
    ), // Type of category
    name: v.string(), // The name/value (e.g., "active", "lender", "prospect")
    displayName: v.optional(v.string()), // Human-readable display name (e.g., "Active Client")
    description: v.optional(v.string()), // Optional description
    displayOrder: v.number(), // Order for display in dropdowns/lists
    isSystemDefault: v.optional(v.boolean()), // Whether this is a system default (read-only)
    isActive: v.boolean(), // Whether this category is active
    hubspotMapping: v.optional(v.string()), // For prospecting stages: HubSpot stage ID this maps to
    createdBy: v.string(), // User ID who created this
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_category_type", ["categoryType"])
    .index("by_name", ["name"])
    .index("by_active", ["isActive"])
    .index("by_category_type_and_active", ["categoryType", "isActive"]),
});

