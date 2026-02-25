import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table - user profiles (Clerk manages auth, we store extra data)
  users: defineTable({
    clerkId: v.optional(v.string()), // Clerk user ID (optional for backward compatibility)
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    isAdmin: v.optional(v.boolean()), // Admin flag for elevated permissions
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
    // Internal stage tracking
    stageNote: v.optional(v.string()), // Quick note about current stage/status of client relationship
    stageNoteUpdatedAt: v.optional(v.string()), // When the stage note was last updated
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
    // Project shortcode for document naming (max 10 chars, e.g., "WIMBPARK28")
    projectShortcode: v.optional(v.string()),
    clientRoles: v.array(v.object({
      clientId: v.id("clients"),
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
    // Deal phase for Knowledge Library requirements tracking
    dealPhase: v.optional(v.union(
      v.literal("indicative_terms"),
      v.literal("credit_submission"),
      v.literal("post_credit"),
      v.literal("completed")
    )),
    createdAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_client", ["clientRoles"])
    .index("by_hubspot_id", ["hubspotDealId"])
    .index("by_shortcode", ["projectShortcode"])
    .index("by_deal_phase", ["dealPhase"]),

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
    // Folder organization for bulk upload filing
    folderId: v.optional(v.string()), // Reference to clientFolders or projectFolders
    folderType: v.optional(v.union(
      v.literal("client"),
      v.literal("project")
    )),
    // Internal vs External classification
    isInternal: v.optional(v.boolean()),
    // Document scope (client, internal company-wide, or personal/private)
    scope: v.optional(v.union(
      v.literal("client"),     // Client/project documents (default for existing)
      v.literal("internal"),   // RockCap company-wide documents
      v.literal("personal")    // User-specific private documents
    )),
    // Owner ID (required for personal scope - the user who owns this document)
    ownerId: v.optional(v.id("users")),
    // Version control
    version: v.optional(v.string()), // "V1.0", "V1.1", "V2.0"
    uploaderInitials: v.optional(v.string()), // e.g., "JS", "AB"
    previousVersionId: v.optional(v.id("documents")), // Link to previous version
    // Extracted data (stored as JSON)
    extractedData: v.optional(v.any()),
    // Document analysis from multi-stage pipeline (Stage 1: Summary Agent)
    documentAnalysis: v.optional(v.object({
      documentDescription: v.string(),
      documentPurpose: v.string(),
      entities: v.object({
        people: v.array(v.string()),
        companies: v.array(v.string()),
        locations: v.array(v.string()),
        projects: v.array(v.string()),
      }),
      keyTerms: v.array(v.string()),
      keyDates: v.array(v.string()),
      keyAmounts: v.array(v.string()),
      executiveSummary: v.string(),
      detailedSummary: v.string(),
      sectionBreakdown: v.optional(v.array(v.string())),
      documentCharacteristics: v.object({
        isFinancial: v.boolean(),
        isLegal: v.boolean(),
        isIdentity: v.boolean(),
        isReport: v.boolean(),
        isDesign: v.boolean(),
        isCorrespondence: v.boolean(),
        hasMultipleProjects: v.boolean(),
        isInternal: v.boolean(),
      }),
      rawContentType: v.string(),
      confidenceInAnalysis: v.number(),
    })),
    // Classification reasoning from Stage 2
    classificationReasoning: v.optional(v.string()),
    // Status
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("error")
    )),
    error: v.optional(v.string()),
    savedAt: v.string(),
    // User who uploaded the document
    uploadedBy: v.optional(v.id("users")),
    // Document reader tracking
    lastOpenedAt: v.optional(v.string()),
    lastOpenedBy: v.optional(v.id("users")),
    // Notes denormalization for efficient list queries
    hasNotes: v.optional(v.boolean()),
    noteCount: v.optional(v.number()),
    // Intelligence integration - flag to track if document analysis was added to client/project intelligence
    addedToIntelligence: v.optional(v.boolean()),
  })
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_category", ["category"])
    .index("by_status", ["status"])
    .index("by_folder", ["folderId"])
    .index("by_previous_version", ["previousVersionId"])
    .index("by_has_notes", ["hasNotes"])
    .index("by_scope", ["scope"])
    .index("by_owner", ["ownerId"])
    .index("by_scope_owner", ["scope", "ownerId"]),

  // Document Notes - User annotations on specific documents (for document reader)
  documentNotes: defineTable({
    documentId: v.id("documents"),
    // Context (inherited from document but denormalized for querying)
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    // Note content
    content: v.string(),
    // Intelligence integration
    addedToIntelligence: v.boolean(),
    intelligenceTarget: v.optional(v.union(v.literal("client"), v.literal("project"))),
    knowledgeItemId: v.optional(v.id("knowledgeItems")), // Reference if converted to intelligence
    // Metadata
    createdBy: v.id("users"),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_document", ["documentId"])
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_created", ["createdAt"]),

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

  // Internal Folders - Company-wide folder structure for RockCap internal documents
  // These folders are shared across all users for organizing internal company documents
  internalFolders: defineTable({
    folderType: v.string(),              // Unique identifier (e.g., "templates", "policies")
    name: v.string(),                    // Display name
    description: v.optional(v.string()), // Optional description for the folder
    parentFolderId: v.optional(v.id("internalFolders")), // For nested folders
    isCustom: v.optional(v.boolean()),   // True if user-created, false if default
    createdAt: v.string(),
    createdBy: v.optional(v.id("users")), // User who created the folder
  })
    .index("by_type", ["folderType"])
    .index("by_parent", ["parentFolderId"]),

  // Personal Folders - User-specific folder structure for private documents
  // Each user has their own set of folders that only they can see
  personalFolders: defineTable({
    userId: v.id("users"),               // Owner of this folder
    folderType: v.string(),              // Unique identifier within user's folders
    name: v.string(),                    // Display name
    description: v.optional(v.string()), // Optional description
    parentFolderId: v.optional(v.id("personalFolders")), // For nested folders
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "folderType"])
    .index("by_parent", ["parentFolderId"]),

  // Legacy: Internal Document Folders (deprecated - use internalFolders instead)
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
    forceExtraction: v.optional(v.boolean()), // Force data extraction regardless of file type
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  // ============================================================================
  // BULK UPLOAD SYSTEM - For uploading up to 100 documents at once
  // ============================================================================

  // Bulk Upload Batches - Groups files uploaded together
  bulkUploadBatches: defineTable({
    // Document scope for this batch
    scope: v.optional(v.union(
      v.literal("client"),     // Client/project documents (default)
      v.literal("internal"),   // RockCap company-wide documents
      v.literal("personal")    // User-specific private documents
    )),
    // Client/Project association (required for client scope, optional for internal/personal)
    clientId: v.optional(v.id("clients")),
    clientName: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    projectName: v.optional(v.string()),
    projectShortcode: v.optional(v.string()), // For document naming
    // Internal folder association (for internal scope)
    internalFolderId: v.optional(v.string()),
    internalFolderName: v.optional(v.string()),
    // Personal folder association (for personal scope)
    personalFolderId: v.optional(v.string()),
    personalFolderName: v.optional(v.string()),
    // Batch status
    status: v.union(
      v.literal("uploading"), // Files being uploaded
      v.literal("processing"), // Files being analyzed
      v.literal("review"), // Ready for user review
      v.literal("completed"), // All files filed
      v.literal("partial") // Some files filed, some pending
    ),
    // Counts
    totalFiles: v.number(),
    processedFiles: v.number(),
    filedFiles: v.number(),
    errorFiles: v.optional(v.number()),
    // Classification
    isInternal: v.boolean(), // Internal vs External batch default
    // User instructions (optional)
    instructions: v.optional(v.string()),
    // Background processing (for large batches >5 files)
    processingMode: v.optional(v.union(
      v.literal("foreground"),  // Small batches - client-side processing
      v.literal("background")   // Large batches - server-side processing
    )),
    estimatedCompletionTime: v.optional(v.string()), // ISO timestamp
    startedProcessingAt: v.optional(v.string()),
    completedProcessingAt: v.optional(v.string()),
    notificationSent: v.optional(v.boolean()),
    // User tracking
    userId: v.id("users"),
    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_user", ["userId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_scope", ["scope"]),

  // Bulk Upload Items - Individual files within a batch
  bulkUploadItems: defineTable({
    batchId: v.id("bulkUploadBatches"),
    // File metadata
    fileName: v.string(),
    fileSize: v.number(),
    fileType: v.string(),
    fileStorageId: v.optional(v.id("_storage")),
    // Processing status
    status: v.union(
      v.literal("pending"), // Not yet processed
      v.literal("processing"), // Currently being analyzed
      v.literal("ready_for_review"), // Analysis complete, awaiting user review
      v.literal("filed"), // Successfully filed to documents
      v.literal("error") // Processing failed
    ),
    // Analysis results (from summary-only analysis)
    summary: v.optional(v.string()),
    fileTypeDetected: v.optional(v.string()),
    category: v.optional(v.string()),
    targetFolder: v.optional(v.string()), // Suggested folder based on category
    confidence: v.optional(v.number()),
    // Classification (can override batch default)
    isInternal: v.optional(v.boolean()),
    // Manual extraction toggle (default false for bulk uploads)
    extractionEnabled: v.optional(v.boolean()),
    extractedData: v.optional(v.any()), // Only populated if extraction enabled
    // Pre-extracted intelligence from bulk-analyze (Sprint 4+)
    extractedIntelligence: v.optional(v.any()), // Intelligence fields extracted during analysis
    // Document analysis from multi-stage pipeline (Stage 1: Summary Agent)
    documentAnalysis: v.optional(v.object({
      // Document identification
      documentDescription: v.string(),
      documentPurpose: v.string(),
      // Key entities
      entities: v.object({
        people: v.array(v.string()),
        companies: v.array(v.string()),
        locations: v.array(v.string()),
        projects: v.array(v.string()),
      }),
      // Key details
      keyTerms: v.array(v.string()),
      keyDates: v.array(v.string()),
      keyAmounts: v.array(v.string()),
      // Summaries
      executiveSummary: v.string(),
      detailedSummary: v.string(),
      sectionBreakdown: v.optional(v.array(v.string())),
      // Document characteristics
      documentCharacteristics: v.object({
        isFinancial: v.boolean(),
        isLegal: v.boolean(),
        isIdentity: v.boolean(),
        isReport: v.boolean(),
        isDesign: v.boolean(),
        isCorrespondence: v.boolean(),
        hasMultipleProjects: v.boolean(),
        isInternal: v.boolean(),
      }),
      // Raw signals
      rawContentType: v.string(),
      confidenceInAnalysis: v.number(),
    })),
    // Classification reasoning from Stage 2
    classificationReasoning: v.optional(v.string()),
    // Document code generation
    generatedDocumentCode: v.optional(v.string()), // Auto-generated name
    // Version control
    version: v.optional(v.string()), // "V1.0", "V1.1", "V2.0"
    isDuplicate: v.optional(v.boolean()), // Flag if duplicate detected
    duplicateOfDocumentId: v.optional(v.id("documents")), // Reference to existing document
    versionType: v.optional(v.union(
      v.literal("minor"), // V1.1
      v.literal("significant") // V2.0
    )),
    // Reference to filed document (populated after filing)
    documentId: v.optional(v.id("documents")),
    // Knowledge Library checklist linking
    checklistItemIds: v.optional(v.array(v.id("knowledgeChecklistItems"))),
    suggestedChecklistItems: v.optional(v.array(v.object({
      itemId: v.id("knowledgeChecklistItems"),
      itemName: v.string(),
      category: v.optional(v.string()),
      confidence: v.number(),
      reasoning: v.optional(v.string()),
    }))),
    // User edits tracking (flags + original AI values for feedback loop)
    userEdits: v.optional(v.object({
      // Flags indicating which fields were edited
      fileTypeDetected: v.optional(v.boolean()),
      category: v.optional(v.boolean()),
      isInternal: v.optional(v.boolean()),
      targetFolder: v.optional(v.boolean()),
      checklistItems: v.optional(v.boolean()),
      // Original AI values (stored on first edit for feedback loop)
      originalFileTypeDetected: v.optional(v.string()),
      originalCategory: v.optional(v.string()),
      originalIsInternal: v.optional(v.boolean()),
      originalTargetFolder: v.optional(v.string()),
      originalChecklistItemIds: v.optional(v.array(v.id("knowledgeChecklistItems"))),
      originalSuggestedChecklistItems: v.optional(v.array(v.object({
        itemId: v.id("knowledgeChecklistItems"),
        itemName: v.string(),
        category: v.string(),
        confidence: v.number(),
        reasoning: v.optional(v.string()),
      }))),
    })),
    // User note/comment for internal context and intelligence
    userNote: v.optional(v.object({
      content: v.string(),
      addToIntelligence: v.boolean(),
      intelligenceTarget: v.optional(v.union(v.literal("client"), v.literal("project"))),
      createdAt: v.string(),
      updatedAt: v.string(),
    })),
    // Error tracking
    error: v.optional(v.string()),
    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_batch", ["batchId"])
    .index("by_status", ["status"])
    .index("by_batch_status", ["batchId", "status"]),

  // ============================================================================
  // FOLDER STRUCTURE - Client and Project folders for organized filing
  // ============================================================================

  // Client Folders - Folder structure at client level
  // Created automatically when a client is created, but users can add custom folders
  clientFolders: defineTable({
    clientId: v.id("clients"),
    folderType: v.string(), // Folder identifier (e.g., "background", "kyc", or custom like "special_docs")
    name: v.string(), // Display name
    description: v.optional(v.string()), // Optional description for the folder
    parentFolderId: v.optional(v.id("clientFolders")), // For nested folders
    isCustom: v.optional(v.boolean()), // True if user-created, false/undefined if from template
    createdAt: v.string(),
  })
    .index("by_client", ["clientId"])
    .index("by_client_type", ["clientId", "folderType"])
    .index("by_parent", ["parentFolderId"]),

  // Project Folders - Standard 8-folder structure for each project
  // Created automatically when a project is created, but users can add custom folders
  projectFolders: defineTable({
    projectId: v.id("projects"),
    folderType: v.string(), // Folder identifier (e.g., "background", "terms_comparison", or custom)
    name: v.string(), // Display name
    description: v.optional(v.string()), // Optional description for the folder
    isCustom: v.optional(v.boolean()), // True if user-created, false/undefined if from template
    createdAt: v.string(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_type", ["projectId", "folderType"]),

  // ============================================================================
  // FOLDER TEMPLATES - Configurable folder structures per client type
  // ============================================================================

  // Folder Templates - Define folder structures for different client types
  // Used when creating new clients/projects to generate appropriate folders
  folderTemplates: defineTable({
    clientType: v.string(), // "borrower" | "lender" | etc.
    level: v.union(v.literal("client"), v.literal("project")),
    folders: v.array(v.object({
      name: v.string(), // Display name (e.g., "Background")
      folderKey: v.string(), // Unique key (e.g., "background")
      parentKey: v.optional(v.string()), // Parent folder key for nested folders
      description: v.optional(v.string()), // Description of folder purpose
      order: v.number(), // Display order
    })),
    isDefault: v.boolean(), // Whether this is the default template for this type
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_client_type_level", ["clientType", "level"])
    .index("by_client_type", ["clientType"]),

  // Document Placement Rules - Define where document types should be filed
  // Per client type mapping of document types to target folders
  documentPlacementRules: defineTable({
    clientType: v.string(), // "borrower" | "lender" | etc.
    documentType: v.string(), // e.g., "Red Book Valuation", "Term Sheet"
    category: v.string(), // e.g., "Appraisals", "Terms"
    targetFolderKey: v.string(), // e.g., "appraisals", "terms_comparison"
    targetLevel: v.union(v.literal("client"), v.literal("project")),
    priority: v.number(), // For ordering/override (higher = more specific)
    description: v.optional(v.string()), // Why this rule exists
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_client_type", ["clientType"])
    .index("by_document_type", ["documentType"])
    .index("by_client_type_document", ["clientType", "documentType"])
    .index("by_category", ["category"]),

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
    userId: v.optional(v.id("users")), // User who owns this chat session (temporarily optional - will be required after cleanup)
    clientId: v.optional(v.id("clients")), // If context is client-specific
    projectId: v.optional(v.id("projects")), // If context is project-specific
    lastMessageAt: v.string(), // Timestamp of last message
    messageCount: v.number(), // Number of messages in session
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_contextType", ["contextType"])
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_lastMessageAt", ["lastMessageAt"])
    .index("by_user_contextType", ["userId", "contextType"]),

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
    projectId: v.optional(v.id("projects")), // For easier version queries per project
    modelType: v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("custom"),
      v.literal("other")
    ),
    version: v.number(),
    versionName: v.optional(v.string()), // Auto-generated: v{N}-{modelType}-{date}
    inputs: v.any(), // Full sheet structure for JSON backup
    outputs: v.optional(v.any()),
    fileStorageId: v.optional(v.id("_storage")), // Saved Excel file in Convex storage
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
    // Source tracking for data provenance
    sourceDocumentIds: v.optional(v.array(v.id("documents"))),
    dataLibrarySnapshotId: v.optional(v.id("dataLibrarySnapshots")),
    billOfMaterials: v.optional(v.any()), // Embedded copy for quick access
  })
    .index("by_scenario", ["scenarioId"])
    .index("by_project", ["projectId"])
    .index("by_project_modelType", ["projectId", "modelType"])
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
      v.literal("task"),
      v.literal("changelog")
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

  // Comments table - comments on documents and file upload jobs
  comments: defineTable({
    jobId: v.optional(v.id("fileUploadQueue")), // For comments on unfiled uploads
    documentId: v.optional(v.id("documents")), // For comments on filed documents
    userId: v.id("users"), // Who commented
    content: v.string(), // Comment text
    taggedUserIds: v.optional(v.array(v.id("users"))), // Users mentioned in comment
    createdAt: v.string(),
    updatedAt: v.optional(v.string()),
  })
    .index("by_job", ["jobId"])
    .index("by_document", ["documentId"])
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
    // Deterministic verification fields (Phase 1 - unified source of truth)
    targetFolderKey: v.optional(v.string()), // Target folder key (e.g., "kyc", "appraisals")
    targetLevel: v.optional(v.union(v.literal("client"), v.literal("project"))), // Folder level
    filenamePatterns: v.optional(v.array(v.string())), // Keywords for filename matching
    excludePatterns: v.optional(v.array(v.string())), // Patterns to exclude (prevent false positives)
    // Auto-learned keywords from user corrections
    learnedKeywords: v.optional(v.array(v.object({
      keyword: v.string(),
      source: v.union(v.literal("correction"), v.literal("manual")),
      addedAt: v.string(),
      correctionCount: v.optional(v.number()),
    }))),
    lastLearnedAt: v.optional(v.string()), // When keywords were last auto-learned
  })
    .index("by_file_type", ["fileType"])
    .index("by_category", ["category"])
    .index("by_parent_type", ["parentType"])
    .index("by_active", ["isActive"])
    .index("by_target_folder", ["targetFolderKey"]),

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

  // Changelog table - tracks application changes and updates
  changelog: defineTable({
    title: v.optional(v.string()), // Title of the change (optional for backward compatibility)
    description: v.string(), // Detailed description of the change
    pagesAffected: v.optional(v.array(v.string())), // Array of page names affected
    featuresAffected: v.optional(v.array(v.string())), // Array of feature names affected
    createdAt: v.string(), // ISO timestamp (server time)
  })
    .index("by_createdAt", ["createdAt"]),

  // Modeling Templates - Store financial model templates
  modelingTemplates: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    modelType: v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("custom")
    ),
    fileStorageId: v.id("_storage"), // Convex storage reference to .xlsx file
    version: v.string(), // Version string (e.g., "1.0.0")
    isActive: v.boolean(), // Whether template is active and available for use
    placeholderCodes: v.optional(v.array(v.string())), // Array of input codes used in template (e.g., ["<interest.rate>", "<costs>"])
    createdBy: v.optional(v.id("users")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_modelType", ["modelType"])
    .index("by_active", ["isActive"])
    .index("by_createdAt", ["createdAt"]),

  // Modeling Code Mappings - Category code to input code mappings
  modelingCodeMappings: defineTable({
    categoryCode: v.string(), // From extracted data (e.g., "financing.interestRate")
    inputCode: v.string(), // Template placeholder (e.g., "<interest.rate>")
    displayName: v.optional(v.string()), // Human-readable display name
    description: v.optional(v.string()), // Description of what this mapping does
    dataType: v.union(
      v.literal("string"),
      v.literal("number"),
      v.literal("date"),
      v.literal("boolean"),
      v.literal("array")
    ),
    format: v.optional(v.string()), // Format hint (e.g., "currency", "percentage")
    priority: v.number(), // Priority for ambiguous matches (higher = more important, default: 0)
    isActive: v.boolean(), // Whether this mapping is active
    createdBy: v.optional(v.id("users")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_categoryCode", ["categoryCode"])
    .index("by_inputCode", ["inputCode"])
    .index("by_active", ["isActive"])
    .index("by_priority", ["priority"]),

  // Document Extractions - Track extraction history per document
  documentExtractions: defineTable({
    documentId: v.id("documents"), // Reference to source document
    projectId: v.optional(v.id("projects")), // Project this extraction belongs to
    extractedData: v.any(), // The extracted data (JSON)
    extractedAt: v.string(), // ISO timestamp of extraction
    version: v.number(), // Version number for this extraction (increments per document)
    sourceFileName: v.string(), // Original file name
  })
    .index("by_document", ["documentId"])
    .index("by_project", ["projectId"])
    .index("by_extractedAt", ["extractedAt"]),

  // Extracted Item Codes - CANONICAL, NORMALIZED CODES ONLY
  // This is the master code library - clean, no duplicates
  extractedItemCodes: defineTable({
    code: v.string(), // e.g., "<stamp.duty>" - the canonical code
    displayName: v.string(), // e.g., "Stamp Duty" - human-readable name
    category: v.string(), // e.g., "Purchase Costs" - for grouping
    dataType: v.union(
      v.literal("currency"),
      v.literal("number"),
      v.literal("percentage"),
      v.literal("string")
    ),
    isSystemDefault: v.optional(v.boolean()), // Whether this is a system-seeded code
    isActive: v.boolean(), // Whether this code is active
    createdBy: v.optional(v.id("users")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_code", ["code"])
    .index("by_category", ["category"])
    .index("by_active", ["isActive"]),

  // Item Code Aliases - NORMALIZATION LAYER (Learning System)
  // Maps various terms to their canonical codes
  // This is how the system learns from user confirmations
  itemCodeAliases: defineTable({
    alias: v.string(), // Original term (e.g., "site costs", "SDLT", "unit costs")
    aliasNormalized: v.string(), // Lowercase, trimmed for matching
    canonicalCodeId: v.id("extractedItemCodes"), // Reference to the canonical code
    canonicalCode: v.string(), // Denormalized for quick access (e.g., "<stamp.duty>")
    confidence: v.number(), // 0.0 - 1.0 confidence in this mapping
    source: v.union(
      v.literal("system_seed"), // Initial seed data
      v.literal("llm_suggested"), // LLM suggested, not yet confirmed
      v.literal("user_confirmed"), // User confirmed LLM suggestion
      v.literal("manual") // User manually added
    ),
    usageCount: v.optional(v.number()), // How many times this alias was matched
    createdAt: v.string(),
  })
    .index("by_alias_normalized", ["aliasNormalized"])
    .index("by_canonical_code", ["canonicalCodeId"])
    .index("by_source", ["source"]),

  // Item Categories - Dynamic categories for organizing item codes
  // Users can add custom categories with descriptions to improve LLM codification
  itemCategories: defineTable({
    name: v.string(), // Display name (e.g., "Professional Fees")
    normalizedName: v.string(), // Normalized for matching (e.g., "professional.fees")
    description: v.string(), // Description of what types of items belong here
    examples: v.array(v.string()), // Example items (e.g., ["Engineers", "Solicitors"])
    isSystem: v.boolean(), // true for default categories, false for user-added
    displayOrder: v.optional(v.number()), // For ordering in UI
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_normalized_name", ["normalizedName"])
    .index("by_system", ["isSystem"]),

  // Codified Extractions - Per-Document Codified Data
  // Stores the result of codification for each document
  codifiedExtractions: defineTable({
    documentId: v.id("documents"), // Reference to source document
    projectId: v.optional(v.id("projects")), // Project this belongs to
    items: v.array(v.object({
      id: v.string(), // Unique ID for this item within the extraction
      originalName: v.string(), // Original name from spreadsheet (e.g., "Site Purchase Price")
      itemCode: v.optional(v.string()), // Assigned canonical code (if matched/confirmed)
      suggestedCode: v.optional(v.string()), // LLM suggestion (if pending)
      suggestedCodeId: v.optional(v.id("extractedItemCodes")), // Reference to suggested code
      value: v.any(), // The extracted value
      dataType: v.string(), // Detected data type (currency, number, percentage, string)
      category: v.string(), // Category from extraction (for grouping)
      mappingStatus: v.union(
        v.literal("matched"), // Fast pass found alias match
        v.literal("suggested"), // Smart pass suggested code
        v.literal("pending_review"), // Needs LLM (between passes)
        v.literal("confirmed"), // User confirmed mapping
        v.literal("unmatched") // LLM couldn't suggest, user skipped
      ),
      confidence: v.number(), // 0-1 confidence in the mapping
      isSubtotal: v.optional(v.boolean()), // Whether this item is a subtotal
      subtotalReason: v.optional(v.string()), // Reason for subtotal detection
    })),
    mappingStats: v.object({
      matched: v.number(), // Count of auto-matched items
      suggested: v.number(), // Count of LLM-suggested items
      pendingReview: v.number(), // Count of items needing review
      confirmed: v.number(), // Count of user-confirmed items
      unmatched: v.number(), // Count of unmatched/skipped items
    }),
    fastPassCompleted: v.boolean(), // Whether fast pass has run
    smartPassCompleted: v.boolean(), // Whether smart pass has run
    isFullyConfirmed: v.boolean(), // All items confirmed (ready for model run)
    codifiedAt: v.string(), // When fast pass completed
    smartPassAt: v.optional(v.string()), // When smart pass completed
    confirmedAt: v.optional(v.string()), // When user confirmed all
    // Project data library merge tracking
    mergedToProjectLibrary: v.optional(v.boolean()), // Whether items merged to project library
    mergedAt: v.optional(v.string()), // When merged
    // Soft delete for bad extractions
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.string()),
    deletedReason: v.optional(v.string()),
  })
    .index("by_document", ["documentId"])
    .index("by_project", ["projectId"])
    .index("by_confirmed", ["isFullyConfirmed"])
    .index("by_merged", ["mergedToProjectLibrary"]),

  // Template Definitions - Template metadata for optimized loading
  // Stores configuration about core vs dynamic sheets and their relationships
  templateDefinitions: defineTable({
    name: v.string(), // Template name (e.g., "Appraisal Model v2")
    modelType: v.union(
      v.literal("appraisal"),
      v.literal("operating"),
      v.literal("other")
    ),
    version: v.number(), // Template version number
    description: v.optional(v.string()), // Template description
    // Original Excel file reference (for re-parsing if needed)
    originalFileStorageId: v.optional(v.id("_storage")),
    originalFileName: v.optional(v.string()),
    // Sheet configuration
    coreSheetIds: v.array(v.id("templateSheets")), // IDs of core sheets (always included)
    dynamicGroups: v.array(v.object({
      groupId: v.string(), // e.g., "site"
      label: v.string(), // e.g., "Site"
      sheetIds: v.array(v.id("templateSheets")), // Template sheets in this group
      min: v.number(), // Minimum count (default: 1)
      max: v.number(), // Maximum count (default: 10)
      defaultCount: v.number(), // Default count when running model
      namePlaceholder: v.string(), // e.g., "{N}" - what to replace in names/formulas
    })),
    // Metadata
    totalSheetCount: v.number(), // Total sheets including templates
    isActive: v.boolean(), // Whether this template is available for use
    createdBy: v.optional(v.id("users")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_modelType", ["modelType"])
    .index("by_active", ["isActive"])
    .index("by_name", ["name"]),

  // Template Sheets - Individual sheet data (can be large, loaded on demand)
  // Sheets are stored separately for lazy loading and efficient duplication
  templateSheets: defineTable({
    templateId: v.id("templateDefinitions"), // Reference to parent template
    name: v.string(), // Sheet name (e.g., "AppraisalSite{N}" or "Control Sheet")
    order: v.number(), // Display order within template
    type: v.union(
      v.literal("core"), // Always included in generated model
      v.literal("dynamic") // Duplicated based on user selection
    ),
    groupId: v.optional(v.string()), // Only for dynamic sheets (e.g., "site")
    // Sheet data storage strategy
    // For large sheets (>100KB): store in file storage as compressed JSON
    dataStorageId: v.optional(v.id("_storage")),
    // For small sheets: store inline (faster to load)
    inlineData: v.optional(v.object({
      data: v.any(), // Cell data (any[][] format)
      styles: v.optional(v.any()), // Cell styles (Record<string, CellStyle>)
      formulas: v.optional(v.any()), // Original formulas (Record<string, string>)
      columnWidths: v.optional(v.any()), // Column widths (Record<number, number>)
      rowHeights: v.optional(v.any()), // Row heights (Record<number, number>)
      mergedCells: v.optional(v.any()), // Merged cell ranges
    })),
    // Metadata for quick access (no need to load full data)
    dimensions: v.object({
      rows: v.number(),
      cols: v.number(),
    }),
    hasFormulas: v.boolean(), // Quick check if sheet has formulas
    hasStyles: v.boolean(), // Quick check if sheet has styling
    hasMergedCells: v.boolean(), // Quick check for merged cells
    // Estimated size for loading strategy decisions
    estimatedSizeBytes: v.optional(v.number()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_template", ["templateId"])
    .index("by_type", ["type"])
    .index("by_template_order", ["templateId", "order"]),

  // ============================================================================
  // PROJECT DATA LIBRARY - Unified data aggregation across documents
  // ============================================================================

  // Project Data Items - Unified project data library
  // One row per unique item code per project, aggregating across all documents
  projectDataItems: defineTable({
    projectId: v.id("projects"),
    itemCode: v.string(),              // Canonical code (e.g., "SITE.001")
    category: v.string(),              // Category for grouping
    originalName: v.string(),          // Display name (from most recent source)
    
    // Current value
    currentValue: v.any(),
    currentValueNormalized: v.number(), // Always in base units (e.g., actual £, not thousands)
    currentUnit: v.optional(v.string()), // "actual", "thousands", "millions"
    currentSourceDocumentId: v.id("documents"),
    currentSourceDocumentName: v.string(),
    currentDataType: v.string(),       // "currency", "percentage", "number"
    
    // Provenance tracking
    lastUpdatedAt: v.string(),
    lastUpdatedBy: v.union(v.literal("extraction"), v.literal("manual")),
    lastUpdatedByUserId: v.optional(v.id("users")),
    manualOverrideNote: v.optional(v.string()),
    
    // Multi-source detection
    hasMultipleSources: v.boolean(),
    valueVariance: v.optional(v.number()), // % difference between min/max values
    
    // Full history (all values from all sources)
    valueHistory: v.array(v.object({
      value: v.any(),
      valueNormalized: v.number(),
      sourceDocumentId: v.id("documents"),
      sourceDocumentName: v.string(),
      sourceExtractionId: v.id("codifiedExtractions"),
      originalName: v.string(),
      addedAt: v.string(),
      addedBy: v.union(v.literal("extraction"), v.literal("manual")),
      addedByUserId: v.optional(v.id("users")),
      isCurrentValue: v.boolean(),
      wasReverted: v.optional(v.boolean()),
    })),
    
    // Soft delete support
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.string()),
    deletedReason: v.optional(v.string()),
    
    // Computed totals support
    isComputed: v.optional(v.boolean()), // True for auto-computed category totals
    computedFromCategory: v.optional(v.string()), // Category this total is computed from
    
    // Subtotal detection - subtotals should not be included in category totals
    isSubtotal: v.optional(v.boolean()), // True if this item is a subtotal/total line
    subtotalReason: v.optional(v.string()), // Why it was detected as subtotal
  })
    .index("by_project", ["projectId"])
    .index("by_project_category", ["projectId", "category"])
    .index("by_project_code", ["projectId", "itemCode"])
    .index("by_source_document", ["currentSourceDocumentId"]),

  // Data Library Snapshots - Point-in-time snapshots for model runs and revert
  dataLibrarySnapshots: defineTable({
    projectId: v.id("projects"),
    createdAt: v.string(),
    createdBy: v.optional(v.id("users")),
    reason: v.union(
      v.literal("model_run"),
      v.literal("manual_save"),
      v.literal("pre_revert_backup"),
      v.literal("pre_delete_backup")
    ),
    
    // Frozen copy of all projectDataItems at this moment
    items: v.array(v.object({
      itemCode: v.string(),
      category: v.string(),
      originalName: v.string(),
      value: v.any(),
      valueNormalized: v.number(),
      sourceDocumentId: v.id("documents"),
      sourceDocumentName: v.string(),
    })),
    
    // Source documents that contributed to this snapshot
    sourceDocumentIds: v.array(v.id("documents")),
    
    // Stats
    itemCount: v.number(),
    documentCount: v.number(),
    
    // Link to model run if applicable
    modelRunId: v.optional(v.id("modelRuns")),
    
    // Description for manual saves
    description: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_model_run", ["modelRunId"])
    .index("by_reason", ["reason"]),

  // Model Exports - Track all exports for audit trail
  modelExports: defineTable({
    projectId: v.id("projects"),
    modelRunId: v.optional(v.id("modelRuns")),
    snapshotId: v.optional(v.id("dataLibrarySnapshots")),
    templateId: v.optional(v.id("modelingTemplates")),
    templateDefinitionId: v.optional(v.id("templateDefinitions")),
    
    exportedAt: v.string(),
    exportedBy: v.optional(v.id("users")),
    fileName: v.string(),
    exportType: v.union(
      v.literal("quick_export"),
      v.literal("full_model"),
      v.literal("data_only")
    ),
    
    // Bill of materials (audit metadata)
    billOfMaterials: v.object({
      sourceDocuments: v.array(v.object({
        documentId: v.id("documents"),
        fileName: v.string(),
        uploadedAt: v.string(),
        itemsUsed: v.number(),
      })),
      manualOverrides: v.array(v.object({
        itemCode: v.string(),
        originalName: v.string(),
        originalValue: v.any(),
        overriddenValue: v.any(),
        overriddenBy: v.optional(v.id("users")),
        note: v.optional(v.string()),
      })),
      totalItems: v.number(),
      totalManualOverrides: v.number(),
    }),
  })
    .index("by_project", ["projectId"])
    .index("by_model_run", ["modelRunId"])
    .index("by_snapshot", ["snapshotId"]),

  // ============================================================================
  // KNOWLEDGE LIBRARY - Document requirements checklists per client type
  // ============================================================================

  // Knowledge Requirement Templates - Base document requirements per client type
  // These define what documents are needed for each type of client (borrower, lender)
  knowledgeRequirementTemplates: defineTable({
    clientType: v.string(), // "borrower" | "lender" | etc.
    level: v.union(v.literal("client"), v.literal("project")), // Whether requirement is at client or project level
    requirements: v.array(v.object({
      id: v.string(), // Unique identifier within template
      name: v.string(), // Display name (e.g., "Certified Proof of Address")
      category: v.string(), // Grouping (e.g., "KYC", "Project Plans", "Professional Reports")
      phaseRequired: v.union(
        v.literal("indicative_terms"),
        v.literal("credit_submission"),
        v.literal("post_credit"),
        v.literal("always")
      ),
      priority: v.union(
        v.literal("required"),
        v.literal("nice_to_have"),
        v.literal("optional")
      ),
      description: v.optional(v.string()), // What this document should contain
      matchingDocumentTypes: v.optional(v.array(v.string())), // Document types that fulfill this
      order: v.number(), // Display order within category
    })),
    isDefault: v.boolean(), // Whether this is the default template for this type
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_client_type", ["clientType"])
    .index("by_client_type_level", ["clientType", "level"]),

  // Knowledge Checklist Items - Per-client/project checklist tracking
  // Created from templates when a client/project is set up, tracks fulfillment status
  knowledgeChecklistItems: defineTable({
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")), // Optional - if project-level requirement
    requirementTemplateId: v.optional(v.id("knowledgeRequirementTemplates")), // Reference to template
    requirementId: v.optional(v.string()), // ID within the template
    // Requirement details (denormalized from template, or custom)
    name: v.string(),
    category: v.string(),
    phaseRequired: v.union(
      v.literal("indicative_terms"),
      v.literal("credit_submission"),
      v.literal("post_credit"),
      v.literal("always")
    ),
    priority: v.union(
      v.literal("required"),
      v.literal("nice_to_have"),
      v.literal("optional")
    ),
    description: v.optional(v.string()),
    matchingDocumentTypes: v.optional(v.array(v.string())),
    order: v.number(),
    // Status tracking
    status: v.union(
      v.literal("missing"),
      v.literal("pending_review"),
      v.literal("fulfilled")
    ),
    // Custom item flags
    isCustom: v.boolean(), // True if user/LLM added (not from template)
    customSource: v.optional(v.union(
      v.literal("manual"),
      v.literal("llm")
    )), // How custom item was created
    // AI suggestion info (for pending suggestions before user confirms)
    suggestedDocumentId: v.optional(v.id("documents")),
    suggestedDocumentName: v.optional(v.string()),
    suggestedConfidence: v.optional(v.number()), // 0-1 confidence score
    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_client_status", ["clientId", "status"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_client_category", ["clientId", "category"])
    .index("by_template", ["requirementTemplateId"]),

  // Knowledge Email Logs - Track email request generation history
  knowledgeEmailLogs: defineTable({
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")), // Optional - for project-specific requests
    generatedAt: v.string(),
    generatedBy: v.id("users"),
    missingItemIds: v.array(v.id("knowledgeChecklistItems")), // Items included in email
    emailContent: v.string(), // Generated email text
    recipientInfo: v.optional(v.object({
      email: v.optional(v.string()),
      name: v.optional(v.string()),
    })),
  })
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_generated_at", ["generatedAt"]),

  // Knowledge Checklist Document Links - Many-to-many relationship between documents and checklist items
  // Enables multiple documents per checklist item (e.g., 3 bank statements for "3 months statements")
  // And multiple checklist items per document (e.g., combined PDF fulfilling multiple requirements)
  knowledgeChecklistDocumentLinks: defineTable({
    checklistItemId: v.id("knowledgeChecklistItems"),
    documentId: v.id("documents"),
    documentName: v.string(), // Denormalized for display
    linkedAt: v.string(),
    linkedBy: v.optional(v.id("users")),
    isPrimary: v.boolean(), // First doc linked = primary (triggered fulfilled status)
  })
    .index("by_checklist_item", ["checklistItemId"])
    .index("by_document", ["documentId"])
    .index("by_checklist_item_primary", ["checklistItemId", "isPrimary"]),

  // ============================================================================
  // CLIENT INTELLIGENCE - Structured, searchable client data
  // ============================================================================

  // Client Intelligence - One document per client with structured intelligence data
  clientIntelligence: defineTable({
    clientId: v.id("clients"),
    clientType: v.string(), // "borrower" | "lender" | "developer" etc.

    // === COMMON FIELDS (all client types) ===
    identity: v.optional(v.object({
      legalName: v.optional(v.string()),
      tradingName: v.optional(v.string()),
      companyNumber: v.optional(v.string()),
      vatNumber: v.optional(v.string()),
      incorporationDate: v.optional(v.string()),
    })),

    primaryContact: v.optional(v.object({
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      role: v.optional(v.string()),
    })),

    addresses: v.optional(v.object({
      registered: v.optional(v.string()),
      trading: v.optional(v.string()),
      correspondence: v.optional(v.string()),
    })),

    banking: v.optional(v.object({
      bankName: v.optional(v.string()),
      accountName: v.optional(v.string()),
      accountNumber: v.optional(v.string()),
      sortCode: v.optional(v.string()),
      iban: v.optional(v.string()),
      swift: v.optional(v.string()),
    })),

    keyPeople: v.optional(v.array(v.object({
      name: v.string(),
      role: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      isDecisionMaker: v.optional(v.boolean()),
      notes: v.optional(v.string()),
    }))),

    // === LENDER-SPECIFIC FIELDS ===
    lenderProfile: v.optional(v.object({
      dealSizeMin: v.optional(v.number()),
      dealSizeMax: v.optional(v.number()),
      preferredDealSize: v.optional(v.number()),
      propertyTypes: v.optional(v.array(v.string())), // ["residential", "commercial", "mixed-use"]
      loanTypes: v.optional(v.array(v.string())), // ["bridge", "development", "term", "mezzanine"]
      geographicRegions: v.optional(v.array(v.string())), // ["London", "South East", "UK-wide"]
      typicalLTV: v.optional(v.number()), // As percentage
      typicalInterestRate: v.optional(v.object({
        min: v.optional(v.number()),
        max: v.optional(v.number()),
      })),
      typicalTermMonths: v.optional(v.object({
        min: v.optional(v.number()),
        max: v.optional(v.number()),
      })),
      specializations: v.optional(v.array(v.string())),
      restrictions: v.optional(v.array(v.string())),
      decisionSpeed: v.optional(v.string()), // "fast", "medium", "slow"
      relationshipNotes: v.optional(v.string()),
    })),

    // === BORROWER-SPECIFIC FIELDS ===
    borrowerProfile: v.optional(v.object({
      experienceLevel: v.optional(v.string()), // "first-time", "experienced", "professional"
      completedProjects: v.optional(v.number()),
      totalDevelopmentValue: v.optional(v.number()),
      preferredPropertyTypes: v.optional(v.array(v.string())),
      preferredRegions: v.optional(v.array(v.string())),
      netWorth: v.optional(v.number()),
      liquidAssets: v.optional(v.number()),
    })),

    // === AI CONTEXT (for chat/templates) ===
    aiSummary: v.optional(v.object({
      executiveSummary: v.optional(v.string()),
      keyFacts: v.optional(v.array(v.string())),
      recentUpdates: v.optional(v.array(v.object({
        date: v.string(),
        update: v.string(),
      }))),
    })),

    // === PROJECT SUMMARIES (embedded for quick access) ===
    projectSummaries: v.optional(v.array(v.object({
      projectId: v.id("projects"),
      projectName: v.string(),
      role: v.string(), // "borrower", "lender", "developer"
      status: v.optional(v.string()),
      loanAmount: v.optional(v.number()),
      lastUpdate: v.optional(v.string()),
      // Per-project data summary
      dataSummary: v.optional(v.object({
        totalDevelopmentCost: v.optional(v.number()),
        itemCount: v.optional(v.number()),
        categoryCount: v.optional(v.number()),
      })),
    }))),

    // === AGGREGATED DATA LIBRARY (across all client projects) ===
    dataLibraryAggregate: v.optional(v.object({
      totalDevelopmentCostAllProjects: v.optional(v.number()),
      totalItemCount: v.optional(v.number()),
      totalDocumentCount: v.optional(v.number()),
      projectCount: v.optional(v.number()),
      categoryTotals: v.optional(v.array(v.object({
        category: v.string(),
        total: v.number(),
        itemCount: v.number(),
      }))),
      lastSyncedAt: v.optional(v.string()),
    })),

    // === CUSTOM FIELDS ===
    customFields: v.optional(v.any()),

    // === EVIDENCE TRAIL (tracks source and confidence for all extracted data) ===
    evidenceTrail: v.optional(v.array(v.object({
      fieldPath: v.string(),  // e.g. "identity.companyNumber", "banking.sortCode"
      value: v.any(),         // The extracted value
      confidence: v.number(), // 0-1 confidence score
      sourceDocumentId: v.optional(v.id("documents")),
      sourceDocumentName: v.optional(v.string()),
      sourceText: v.optional(v.string()), // Quoted text evidence
      pageNumber: v.optional(v.number()),
      extractedAt: v.string(),
      method: v.string(), // "ai_extraction" | "manual" | "api" | "data_library_sync"
    }))),

    // === FLEXIBLE ATTRIBUTES (for extracted data beyond fixed schema) ===
    extractedAttributes: v.optional(v.array(v.object({
      key: v.string(),        // e.g. "previous_company_name", "tax_reference"
      value: v.any(),
      confidence: v.number(),
      sourceDocumentId: v.optional(v.id("documents")),
      sourceText: v.optional(v.string()),
      extractedAt: v.string(),
    }))),

    // === AI INSIGHTS (analysis and reasoning from documents) ===
    aiInsights: v.optional(v.object({
      keyFindings: v.optional(v.array(v.string())),
      risks: v.optional(v.array(v.object({
        risk: v.string(),
        severity: v.optional(v.string()), // "low" | "medium" | "high"
        sourceDocumentId: v.optional(v.id("documents")),
      }))),
      opportunities: v.optional(v.array(v.string())),
      recommendations: v.optional(v.array(v.string())),
      lastAnalyzedAt: v.optional(v.string()),
    })),

    // === METADATA ===
    fieldSources: v.optional(v.any()), // Legacy - use evidenceTrail instead
    lastUpdated: v.string(),
    lastUpdatedBy: v.optional(v.string()),
    version: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_client_type", ["clientType"]),

  // ============================================================================
  // PROJECT INTELLIGENCE - Structured, searchable project data
  // ============================================================================

  // Project Intelligence - One document per project with structured intelligence data
  projectIntelligence: defineTable({
    projectId: v.id("projects"),

    // === PROJECT OVERVIEW ===
    overview: v.optional(v.object({
      projectType: v.optional(v.string()), // "new-build", "refurbishment", "conversion"
      assetClass: v.optional(v.string()), // "residential", "commercial", "mixed-use"
      description: v.optional(v.string()),
      currentPhase: v.optional(v.string()),
    })),

    // === LOCATION ===
    location: v.optional(v.object({
      siteAddress: v.optional(v.string()),
      postcode: v.optional(v.string()),
      localAuthority: v.optional(v.string()),
      region: v.optional(v.string()),
      coordinates: v.optional(v.object({
        lat: v.number(),
        lng: v.number(),
      })),
    })),

    // === FINANCIALS ===
    financials: v.optional(v.object({
      purchasePrice: v.optional(v.number()),
      totalDevelopmentCost: v.optional(v.number()),
      grossDevelopmentValue: v.optional(v.number()),
      profit: v.optional(v.number()),
      profitMargin: v.optional(v.number()),
      loanAmount: v.optional(v.number()),
      ltv: v.optional(v.number()),
      ltgdv: v.optional(v.number()),
      interestRate: v.optional(v.number()),
      arrangementFee: v.optional(v.number()),
      exitFee: v.optional(v.number()),
    })),

    // === TIMELINE ===
    timeline: v.optional(v.object({
      acquisitionDate: v.optional(v.string()),
      planningSubmissionDate: v.optional(v.string()),
      planningApprovalDate: v.optional(v.string()),
      constructionStartDate: v.optional(v.string()),
      practicalCompletionDate: v.optional(v.string()),
      salesCompletionDate: v.optional(v.string()),
      loanMaturityDate: v.optional(v.string()),
    })),

    // === UNITS/DEVELOPMENT ===
    development: v.optional(v.object({
      totalUnits: v.optional(v.number()),
      unitBreakdown: v.optional(v.array(v.object({
        type: v.string(), // "1-bed", "2-bed", "commercial"
        count: v.number(),
        avgSize: v.optional(v.number()), // sq ft
        avgValue: v.optional(v.number()),
      }))),
      totalSqFt: v.optional(v.number()),
      siteArea: v.optional(v.number()),
      planningReference: v.optional(v.string()),
      planningStatus: v.optional(v.string()),
    })),

    // === KEY PARTIES (project-specific) ===
    keyParties: v.optional(v.object({
      borrower: v.optional(v.object({
        clientId: v.optional(v.id("clients")),
        name: v.optional(v.string()),
        contactName: v.optional(v.string()),
        contactEmail: v.optional(v.string()),
      })),
      lender: v.optional(v.object({
        clientId: v.optional(v.id("clients")),
        name: v.optional(v.string()),
        contactName: v.optional(v.string()),
        contactEmail: v.optional(v.string()),
      })),
      solicitor: v.optional(v.object({
        firm: v.optional(v.string()),
        contactName: v.optional(v.string()),
        contactEmail: v.optional(v.string()),
      })),
      valuer: v.optional(v.object({
        firm: v.optional(v.string()),
        contactName: v.optional(v.string()),
      })),
      architect: v.optional(v.object({
        firm: v.optional(v.string()),
        contactName: v.optional(v.string()),
      })),
      contractor: v.optional(v.object({
        firm: v.optional(v.string()),
        contactName: v.optional(v.string()),
        contractValue: v.optional(v.number()),
      })),
      monitoringSurveyor: v.optional(v.object({
        firm: v.optional(v.string()),
        contactName: v.optional(v.string()),
      })),
    })),

    // === DATA LIBRARY SUMMARY (synced from projectDataItems) ===
    dataLibrarySummary: v.optional(v.object({
      // Aggregated totals by category
      categoryTotals: v.optional(v.array(v.object({
        category: v.string(),
        total: v.number(),
        itemCount: v.number(),
      }))),

      // Key financial metrics (auto-synced from Data Library)
      totalDevelopmentCost: v.optional(v.number()),
      landCost: v.optional(v.number()),
      constructionCost: v.optional(v.number()),
      professionalFees: v.optional(v.number()),
      contingency: v.optional(v.number()),
      financeCosts: v.optional(v.number()),
      salesCosts: v.optional(v.number()),

      // Metadata
      lastSyncedAt: v.optional(v.string()),
      sourceDocumentCount: v.optional(v.number()),
      totalItemCount: v.optional(v.number()),
    })),

    // === AI CONTEXT ===
    aiSummary: v.optional(v.object({
      executiveSummary: v.optional(v.string()),
      keyFacts: v.optional(v.array(v.string())),
      risks: v.optional(v.array(v.string())),
      recentUpdates: v.optional(v.array(v.object({
        date: v.string(),
        update: v.string(),
      }))),
    })),

    // === CUSTOM FIELDS ===
    customFields: v.optional(v.any()),

    // === EVIDENCE TRAIL (tracks source and confidence for all extracted data) ===
    evidenceTrail: v.optional(v.array(v.object({
      fieldPath: v.string(),  // e.g. "financials.loanAmount", "timeline.planningApprovalDate"
      value: v.any(),         // The extracted value
      confidence: v.number(), // 0-1 confidence score
      sourceDocumentId: v.optional(v.id("documents")),
      sourceDocumentName: v.optional(v.string()),
      sourceText: v.optional(v.string()), // Quoted text evidence
      pageNumber: v.optional(v.number()),
      extractedAt: v.string(),
      method: v.string(), // "ai_extraction" | "manual" | "api" | "data_library_sync"
    }))),

    // === FLEXIBLE ATTRIBUTES (for extracted data beyond fixed schema) ===
    extractedAttributes: v.optional(v.array(v.object({
      key: v.string(),        // e.g. "s106_contribution", "cil_liability"
      value: v.any(),
      confidence: v.number(),
      sourceDocumentId: v.optional(v.id("documents")),
      sourceText: v.optional(v.string()),
      extractedAt: v.string(),
    }))),

    // === AI INSIGHTS (analysis and reasoning from documents) ===
    aiInsights: v.optional(v.object({
      keyFindings: v.optional(v.array(v.string())),
      risks: v.optional(v.array(v.object({
        risk: v.string(),
        severity: v.optional(v.string()), // "low" | "medium" | "high"
        sourceDocumentId: v.optional(v.id("documents")),
      }))),
      opportunities: v.optional(v.array(v.string())),
      recommendations: v.optional(v.array(v.string())),
      lastAnalyzedAt: v.optional(v.string()),
    })),

    // === METADATA ===
    fieldSources: v.optional(v.any()), // Legacy - use evidenceTrail instead
    lastUpdated: v.string(),
    lastUpdatedBy: v.optional(v.string()),
    version: v.number(),
  })
    .index("by_project", ["projectId"]),

  // ============================================================================
  // EXTRACTION JOBS - Queue for background data extraction processing
  // ============================================================================
  
  // Extraction Jobs - Queued extraction jobs to be processed in background
  // Created when documents are filed with extractionEnabled = true
  extractionJobs: defineTable({
    documentId: v.id("documents"),
    projectId: v.id("projects"),
    clientId: v.optional(v.id("clients")),
    fileStorageId: v.id("_storage"),
    fileName: v.string(),
    // Job status
    status: v.union(
      v.literal("pending"),      // Waiting to be processed
      v.literal("processing"),   // Currently being extracted
      v.literal("completed"),    // Extraction completed successfully
      v.literal("failed")        // Extraction failed
    ),
    // Results
    extractedData: v.optional(v.any()),
    codifiedExtractionId: v.optional(v.id("codifiedExtractions")),
    error: v.optional(v.string()),
    // Processing metadata
    attempts: v.number(),
    maxAttempts: v.optional(v.number()),
    lastAttemptAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_document", ["documentId"])
    .index("by_project", ["projectId"])
    .index("by_created", ["createdAt"]),

  // ============================================================================
  // INTELLIGENCE EXTRACTION JOBS - Queue for intelligence extraction from documents
  // ============================================================================

  // Intelligence Extraction Jobs - Queued jobs to extract intelligence from filed documents
  // Created when documents are filed, processes document content to populate intelligence
  intelligenceExtractionJobs: defineTable({
    documentId: v.id("documents"),
    projectId: v.optional(v.id("projects")),
    clientId: v.optional(v.id("clients")),
    // Document info (cached for processing)
    documentName: v.string(),
    documentType: v.optional(v.string()), // e.g. "Valuation", "Bank Statement", "Title Deed"
    documentCategory: v.optional(v.string()),
    // Job status
    status: v.union(
      v.literal("pending"),      // Waiting to be processed
      v.literal("processing"),   // Currently being extracted
      v.literal("completed"),    // Extraction completed successfully
      v.literal("failed"),       // Extraction failed
      v.literal("skipped")       // Skipped (e.g. not relevant for intelligence)
    ),
    // Extraction results
    extractedFields: v.optional(v.array(v.object({
      fieldPath: v.string(),     // e.g. "financials.loanAmount"
      value: v.any(),
      confidence: v.number(),
      sourceText: v.optional(v.string()),
      pageNumber: v.optional(v.number()),
    }))),
    extractedAttributes: v.optional(v.array(v.object({
      key: v.string(),
      value: v.any(),
      confidence: v.number(),
      sourceText: v.optional(v.string()),
    }))),
    aiInsights: v.optional(v.object({
      keyFindings: v.optional(v.array(v.string())),
      risks: v.optional(v.array(v.object({
        risk: v.string(),
        severity: v.optional(v.string()),
      }))),
    })),
    // Merge status (tracks what was actually applied)
    mergeResult: v.optional(v.object({
      fieldsAdded: v.optional(v.number()),
      fieldsUpdated: v.optional(v.number()),
      fieldsSkipped: v.optional(v.number()), // Lower confidence than existing
      attributesAdded: v.optional(v.number()),
      insightsAdded: v.optional(v.number()),
    })),
    // Error tracking
    error: v.optional(v.string()),
    attempts: v.number(),
    maxAttempts: v.optional(v.number()),
    lastAttemptAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_document", ["documentId"])
    .index("by_project", ["projectId"])
    .index("by_client", ["clientId"])
    .index("by_created", ["createdAt"]),

  // ============================================================================
  // KNOWLEDGE ITEMS - Flexible, normalized intelligence storage
  // ============================================================================

  // Knowledge Items - Individual facts/data points with canonical field paths
  // This is the new flexible intelligence storage that supports:
  // - Canonical fields (normalized from extraction)
  // - Custom fields (anything that doesn't match canonical)
  // - Source tracking for provenance
  // - Conflict flagging for human review
  knowledgeItems: defineTable({
    // Target (client or project)
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),

    // Field identification
    fieldPath: v.string(),           // e.g., "company.registrationNumber" or "custom.favorite_broker"
    isCanonical: v.boolean(),        // true if matched to canonical field
    category: v.string(),            // Derived from fieldPath: "company", "contact", "custom"
    label: v.string(),               // Human-readable label

    // Value
    value: v.any(),                  // The actual value (string, number, date, array, etc.)
    valueType: v.union(
      v.literal("string"),
      v.literal("number"),
      v.literal("currency"),
      v.literal("date"),
      v.literal("percentage"),
      v.literal("array"),
      v.literal("text"),
      v.literal("boolean")
    ),

    // Source tracking
    sourceType: v.union(
      v.literal("document"),
      v.literal("manual"),
      v.literal("ai_extraction"),
      v.literal("data_library"),
      v.literal("checklist")
    ),
    sourceDocumentId: v.optional(v.id("documents")),
    sourceDocumentName: v.optional(v.string()),
    sourceText: v.optional(v.string()),  // Quote from source document

    // Normalization info
    originalLabel: v.optional(v.string()),  // What the AI originally extracted as
    matchedAlias: v.optional(v.string()),   // Which alias matched
    normalizationConfidence: v.optional(v.number()),  // How confident the mapping was

    // Status
    status: v.union(
      v.literal("active"),
      v.literal("flagged"),          // Needs human review
      v.literal("archived"),         // Superseded or removed
      v.literal("superseded")        // Replaced by newer value
    ),
    flagReason: v.optional(v.string()),
    supersededBy: v.optional(v.id("knowledgeItems")),

    // Timestamps
    addedAt: v.string(),
    updatedAt: v.string(),
    addedBy: v.optional(v.string()),  // User who added it or "ai-extraction"

    // Template tags for retrieval and document generation
    tags: v.optional(v.array(v.string())),  // e.g., ["lenders_note", "credit_submission", "general"]
  })
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_client_category", ["clientId", "category"])
    .index("by_project_category", ["projectId", "category"])
    .index("by_client_field", ["clientId", "fieldPath"])
    .index("by_project_field", ["projectId", "fieldPath"])
    .index("by_status", ["status"])
    .index("by_source_document", ["sourceDocumentId"])
    .index("by_client_status", ["clientId", "status"])
    .index("by_project_status", ["projectId", "status"]),

  // Intelligence Conflicts - When multiple sources disagree
  intelligenceConflicts: defineTable({
    // Target
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),

    // Conflict info
    fieldPath: v.string(),
    category: v.string(),
    description: v.string(),         // "Loan amount differs between documents"
    relatedItemIds: v.array(v.id("knowledgeItems")),

    // Status
    status: v.union(
      v.literal("pending"),
      v.literal("resolved")
    ),
    resolution: v.optional(v.object({
      winnerId: v.id("knowledgeItems"),
      resolvedBy: v.string(),
      resolvedAt: v.string(),
      reason: v.optional(v.string()),
    })),

    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_field", ["fieldPath"]),

  // ============================================================================
  // FILING FEEDBACK LOOP - Self-teaching system for improving AI classification
  // ============================================================================

  // Filing Corrections - Stores every AI mistake corrected by users
  // Used to feed back into Critic agent for self-improvement
  filingCorrections: defineTable({
    // Source reference
    sourceItemId: v.optional(v.id("bulkUploadItems")),
    sourceDocumentId: v.optional(v.id("documents")),

    // Document context for retrieval
    fileName: v.string(),
    fileNameNormalized: v.string(), // Lowercase, pattern-matched for search
    contentHash: v.string(), // SHA-256 of first 10KB for dedup
    contentSummary: v.string(), // First 500 chars of summary
    clientType: v.optional(v.string()), // borrower, lender, etc.

    // AI's original prediction
    aiPrediction: v.object({
      fileType: v.string(),
      category: v.string(),
      targetFolder: v.string(),
      confidence: v.number(),
      isInternal: v.optional(v.boolean()),
      // AI-suggested checklist items (with names for meaningful feedback)
      suggestedChecklistItems: v.optional(v.array(v.object({
        itemId: v.string(),
        itemName: v.string(),
        category: v.optional(v.string()),
        confidence: v.number(),
      }))),
    }),

    // User's correction (only fields that were changed)
    userCorrection: v.object({
      fileType: v.optional(v.string()),
      category: v.optional(v.string()),
      targetFolder: v.optional(v.string()),
      isInternal: v.optional(v.boolean()),
      // User's final checklist selection (with names for meaningful feedback)
      checklistItems: v.optional(v.array(v.object({
        itemId: v.string(),
        itemName: v.string(),
      }))),
    }),

    // What fields were corrected (for efficient retrieval)
    correctedFields: v.array(v.string()), // ["fileType", "category", etc.]

    // Learning metadata
    correctionWeight: v.number(), // 1.0 = normal, higher = important correction
    wasReversed: v.optional(v.boolean()), // If user later undid the correction

    // Document content for keyword learning (Phase 1 - deterministic verification)
    documentKeywords: v.optional(v.array(v.string())), // keyTerms extracted from document summary
    aiReasoning: v.optional(v.string()), // Why AI made this classification (for debugging)

    // User and timing
    correctedBy: v.optional(v.id("users")),
    createdAt: v.string(),
  })
    .index("by_content_hash", ["contentHash"])
    .index("by_file_type", ["aiPrediction.fileType"])
    .index("by_category", ["aiPrediction.category"])
    .index("by_folder", ["aiPrediction.targetFolder"])
    .index("by_created_at", ["createdAt"])
    .index("by_client_type", ["clientType"])
    .index("by_user_correction_type", ["userCorrection.fileType"]) // For learning aggregation
    .searchIndex("search_filename", {
      searchField: "fileNameNormalized",
      filterFields: ["clientType"],
    }),

  // Learning Events - Tracks auto-learned keywords from corrections
  // Used to notify users and allow undo of learned keywords
  learningEvents: defineTable({
    eventType: v.literal("keyword_learned"),
    fileTypeId: v.id("fileTypeDefinitions"), // Which file type definition was updated
    fileType: v.string(), // Denormalized for display
    keyword: v.string(), // The keyword that was learned
    correctionCount: v.number(), // How many corrections led to this learning
    sourceCorrections: v.array(v.id("filingCorrections")), // Which corrections triggered this
    createdAt: v.string(),
    dismissed: v.optional(v.boolean()), // If user dismissed the notification
    undone: v.optional(v.boolean()), // If user undid this learned keyword
  })
    .index("by_created_at", ["createdAt"])
    .index("by_file_type", ["fileType"])
    .index("by_dismissed", ["dismissed"]),

  // Classification Cache - Caches results for identical content
  // Reduces redundant AI processing for duplicate/similar documents
  classificationCache: defineTable({
    // Content identification
    contentHash: v.string(), // SHA-256 of first 10KB
    fileNamePattern: v.string(), // Normalized filename pattern

    // Cached classification result
    classification: v.object({
      fileType: v.string(),
      category: v.string(),
      targetFolder: v.string(),
      confidence: v.number(),
      isInternal: v.optional(v.boolean()),
      suggestedChecklistItems: v.optional(v.array(v.object({
        itemId: v.string(),
        itemName: v.string(),
        category: v.optional(v.string()),
        confidence: v.number(),
      }))),
    }),

    // Cache metadata
    hitCount: v.number(), // Times this cache entry was used
    lastHitAt: v.string(), // For LRU eviction
    createdAt: v.string(),

    // Invalidation tracking
    correctionCount: v.number(), // How many times corrections were made for this hash
    invalidatedAt: v.optional(v.string()), // When cache was invalidated due to correction
    isValid: v.boolean(),

    // Context
    clientType: v.optional(v.string()),
  })
    .index("by_content_hash", ["contentHash"])
    .index("by_valid", ["isValid"])
    .index("by_last_hit", ["lastHitAt"])
    .index("by_pattern_client", ["fileNamePattern", "clientType"]),

  // LoRA Training Exports - Batched training data exports for fine-tuning
  loraTrainingExports: defineTable({
    // Export metadata
    exportName: v.string(),
    exportedBy: v.id("users"),
    exportedAt: v.string(),

    // Export criteria/filters
    criteria: v.object({
      minCorrectionWeight: v.optional(v.number()),
      correctedFieldsFilter: v.optional(v.array(v.string())),
      dateRangeStart: v.optional(v.string()),
      dateRangeEnd: v.optional(v.string()),
      clientTypes: v.optional(v.array(v.string())),
    }),

    // Export statistics
    stats: v.object({
      totalExamples: v.number(),
      byFileType: v.any(), // { "Passport": 15, "Bank Statement": 23, ... }
      byCategory: v.any(), // { "KYC": 45, "Appraisals": 12, ... }
      byCorrectionType: v.any(), // { "fileType": 30, "category": 20, ... }
    }),

    // File storage reference
    exportFileStorageId: v.optional(v.id("_storage")), // JSONL file
    exportFormat: v.union(
      v.literal("openai_chat"), // OpenAI fine-tuning format
      v.literal("together_chat"), // Together AI format
      v.literal("alpaca"), // Alpaca instruction format
    ),

    status: v.union(
      v.literal("pending"),
      v.literal("generating"),
      v.literal("completed"),
      v.literal("error"),
    ),
    error: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_exported_at", ["exportedAt"]),

  // Meetings table - extracted meeting summaries from transcripts/notes
  meetings: defineTable({
    // Ownership
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),

    // Meeting info
    title: v.string(),
    meetingDate: v.string(), // ISO date string
    meetingType: v.optional(v.union(
      v.literal("progress"),
      v.literal("kickoff"),
      v.literal("review"),
      v.literal("site_visit"),
      v.literal("call"),
      v.literal("other")
    )),

    // Attendees
    attendees: v.array(v.object({
      name: v.string(),
      role: v.optional(v.string()),
      company: v.optional(v.string()),
      contactId: v.optional(v.id("contacts")),
    })),

    // Extracted content
    summary: v.string(),
    keyPoints: v.array(v.string()),
    decisions: v.array(v.string()),

    // Action items (embedded)
    actionItems: v.array(v.object({
      id: v.string(),
      description: v.string(),
      assignee: v.optional(v.string()),
      dueDate: v.optional(v.string()),
      status: v.union(v.literal("pending"), v.literal("completed"), v.literal("cancelled")),
      taskId: v.optional(v.id("tasks")),
      createdAt: v.string(),
      completedAt: v.optional(v.string()),
    })),

    // Source tracking
    sourceDocumentId: v.optional(v.id("documents")),
    sourceDocumentName: v.optional(v.string()),
    extractionConfidence: v.optional(v.number()),

    // Metadata
    createdBy: v.optional(v.id("users")),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_client_date", ["clientId", "meetingDate"])
    .index("by_source_document", ["sourceDocumentId"]),

  // Meeting Extraction Jobs - async queue for extracting meetings from documents
  meetingExtractionJobs: defineTable({
    // Source document info
    documentId: v.id("documents"),
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    fileStorageId: v.id("_storage"),
    documentName: v.string(),

    // Job status
    status: v.union(
      v.literal("pending"),     // Waiting to be processed
      v.literal("processing"),  // Currently being extracted
      v.literal("completed"),   // Extraction completed successfully
      v.literal("failed"),      // Extraction failed
      v.literal("skipped")      // Skipped (e.g. not a meeting document)
    ),

    // Result
    meetingId: v.optional(v.id("meetings")),
    error: v.optional(v.string()),

    // Processing metadata
    attempts: v.number(),
    maxAttempts: v.optional(v.number()),
    lastAttemptAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),

    // Timestamps
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_document", ["documentId"])
    .index("by_client", ["clientId"])
    .index("by_created", ["createdAt"]),
});

