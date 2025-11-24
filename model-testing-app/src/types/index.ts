import { Id } from "../../convex/_generated/dataModel";

export interface SavedDocument {
  _id: Id<"documents">;
  fileStorageId?: Id<"_storage">;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: string;
  summary: string;
  fileTypeDetected: string;
  category: string;
  reasoning: string;
  confidence: number;
  tokensUsed: number;
  clientId?: Id<"clients">;
  clientName?: string;
  projectId?: Id<"projects">;
  projectName?: string;
  suggestedClientName?: string;
  suggestedProjectName?: string;
  extractedData?: any;
  status?: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
  savedAt: string;
  uploadedBy?: Id<"users">;
}

export interface Client {
  id: string;
  name: string;
  createdAt: string;
  // Client type: lender, borrower, real-estate-developer, etc.
  type?: string; // Flexible string for different client types
  // Status: prospect, active, archived, past
  status?: 'prospect' | 'active' | 'archived' | 'past';
  // Extended fields
  companyName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  industry?: string;
  tags?: string[];
  notes?: string;
  lastContactDate?: string; // ISO date
  // Enrichment fields
  enrichmentScore?: number; // 0-100
  source?: 'apollo' | 'zoominfo' | 'real-estate-db' | 'manual' | 'other';
  assignedTo?: string;
  // Flexible metadata for extensibility
  metadata?: Record<string, any>;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  // Many-to-many relationship with clients
  clientRoles: Array<{
    clientId: string;
    role: string; // e.g., "borrower", "lender", "developer", etc.
  }>;
  // Extended fields
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  status?: 'active' | 'inactive' | 'completed' | 'on-hold' | 'cancelled';
  lifecycleStage?: 'prospective' | 'active' | 'completed' | 'on-hold' | 'cancelled' | 'archived';
  tags?: string[];
  startDate?: string; // ISO date
  endDate?: string; // ISO date
  expectedCompletionDate?: string; // ISO date
  loanNumber?: string;
  loanAmount?: number;
  interestRate?: number;
  notes?: string;
  // Flexible metadata for extensibility
  metadata?: Record<string, any>;
}

export interface Contact {
  id: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  createdAt: string; // ISO date
  sourceDocumentId?: string; // Document that provided this contact
}

export interface EnrichmentSuggestion {
  id: string;
  type: 'email' | 'phone' | 'address' | 'company' | 'contact' | 'date' | 'other';
  field: string; // Field name to update (e.g., 'email', 'phone', 'address')
  value: string | number | object;
  source: string; // Document name or source
  documentId: string;
  // Can be applied to either client or project
  clientId?: string;
  projectId?: string;
  confidence: number; // 0.0 to 1.0
  createdAt: string; // ISO date
  status?: 'pending' | 'accepted' | 'rejected';
}

export interface Communication {
  id: string;
  type: 'email' | 'meeting' | 'call' | 'document' | 'other';
  subject?: string;
  date: string; // ISO date
  participants?: string[]; // Array of contact names or emails
  documentId: string;
  summary?: string;
}

export interface ProspectingContext {
  documentId: string;
  clientId: string | null;
  projectId: string | null;
  extractedAt: string;
  
  // Key talking points and insights
  keyPoints: string[];           // Main points from the document
  painPoints: string[];         // Problems/challenges mentioned
  opportunities: string[];       // Opportunities identified
  decisionMakers: Array<{        // People mentioned who might be decision makers
    name: string;
    role?: string;
    context?: string;            // Where they were mentioned
  }>;
  
  // Business context
  businessContext: {
    industry?: string;
    companySize?: string;
    growthIndicators?: string[];
    challenges?: string[];
    goals?: string[];
  };
  
  // Financial context (if relevant)
  financialContext?: {
    budgetMentioned?: boolean;
    budgetRange?: string;
    investmentLevel?: string;
    timeline?: string;
  };
  
  // Relationship context
  relationshipContext?: {
    currentStage?: string;        // e.g., "prospect", "existing client", "past client"
    relationshipStrength?: string; // e.g., "strong", "developing", "new"
    lastInteraction?: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
  };
  
  // Competitive intelligence
  competitiveMentions?: Array<{
    competitor?: string;
    context?: string;
  }>;
  
  // Timeline and urgency
  timeline?: {
    urgency?: 'high' | 'medium' | 'low';
    deadlines?: string[];
    milestones?: string[];
  };
  
  // Template-relevant snippets
  templateSnippets?: {
    opening?: string;              // Good opening line for email
    valueProposition?: string;     // Relevant value prop
    callToAction?: string;         // Suggested CTA
  };
  
  confidence: number;
  tokensUsed?: number;
}

export interface ExtractedData {
  costs?: Array<{
    type: string;        // e.g., "Construction", "Land Acquisition", "Permits", "Plot A", "Plot B", etc.
    amount: number;
    currency?: string;
    category?: string;  // "Site Costs" | "Net Construction Costs" | "Professional Fees" | "Financing/Legal Fees" | "Disposal Fees"
  }>;
  costCategories?: {
    siteCosts?: {
      items: Array<{ type: string; amount: number; currency?: string }>;
      subtotal: number;
      currency?: string;
    };
    netConstructionCosts?: {
      items: Array<{ type: string; amount: number; currency?: string }>;
      subtotal: number;
      currency?: string;
    };
    professionalFees?: {
      items: Array<{ type: string; amount: number; currency?: string }>;
      subtotal: number;
      currency?: string;
    };
    financingLegalFees?: {
      items: Array<{ type: string; amount: number; currency?: string }>;
      subtotal: number;
      currency?: string;
    };
    disposalFees?: {
      items: Array<{ type: string; amount: number; currency?: string }>;
      subtotal: number;
      currency?: string;
    };
  };
  costsTotal?: {
    amount: number;
    currency?: string;
  };
  profit?: {
    total?: number;
    percentage?: number;
    currency?: string;
  };
  averageInterest?: {
    rate: number;        // as decimal (e.g., 0.045 for 4.5%)
    percentage?: number; // as percentage (e.g., 4.5)
  };
  financing?: {
    loanAmount?: number;
    interestRate?: number;
    interestPercentage?: number;
    currency?: string;
  };
  units?: {
    type: string;        // "units" | "houses" | "developments" | "plots"
    count: number;
    costPerUnit?: number;
    currency?: string;
  };
  plots?: Array<{
    name: string;        // e.g., "Plot A", "Plot 1", "Development 1"
    cost: number;
    squareFeet?: number; // Square footage if available
    pricePerSquareFoot?: number; // Calculated price per square foot
    currency?: string;
  }>;
  plotsTotal?: {
    amount: number;
    currency?: string;
  };
  miscellaneous?: Array<{
    type: string;
    amount: number;
    currency?: string;
  }>;
  miscellaneousTotal?: {
    amount: number;
    currency?: string;
  };
  detectedCurrency?: string; // Primary currency detected (e.g., "GBP", "USD", "EUR")
  revenue?: {
    totalSales?: number;      // Total projected/actual sales revenue
    salesPerUnit?: number;     // Sales price per unit if available
    currency?: string;
  };
  extractionNotes?: string; // Message if no extractable data found or partial extraction
  confidence?: number;      // Confidence score for extraction (0.0-1.0)
  tokensUsed?: number;      // Token usage for extraction call
  verificationNotes?: string; // Report of verification findings and corrections
  verificationConfidence?: number; // Confidence in verification (0.0-1.0)
  verificationDiscrepancies?: Array<{
    type: string; // e.g., "missing_item", "incorrect_total", "unit_misinterpretation"
    description: string; // Description of the discrepancy
  }>;
}

export interface AnalysisResult {
  summary: string;
  fileType: string;
  clientId: string | null;
  clientName: string | null;
  suggestedClientName: string | null; // If model suggests a new client
  projectId: string | null;
  projectName: string | null;
  suggestedProjectName: string | null; // If model suggests a new project
  category: string;
  reasoning: string;
  confidence: number;
  tokensUsed: number;
  extractedData?: ExtractedData | null;
  enrichmentSuggestions?: Array<{
    type: 'email' | 'phone' | 'address' | 'company' | 'contact' | 'date' | 'other';
    field: string;
    value: string | number | object;
    confidence: number;
    context?: string; // Additional context about where this was found
  }>;
}

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  uploadedAt: string;
  analysisResult?: AnalysisResult;
  error?: string;
}

export interface ModelResponse {
  summary: string;
  fileType: string;
  clientName: string | null;
  suggestedClientName: string | null;
  projectName: string | null;
  suggestedProjectName: string | null;
  category: string;
  reasoning: string;
  confidence: number;
  tokensUsed?: number;
  extractedData?: ExtractedData | null;
  enrichmentSuggestions?: Array<{
    type: 'email' | 'phone' | 'address' | 'company' | 'contact' | 'date' | 'other';
    field: string;
    value: string | number | object;
    confidence: number;
    context?: string; // Additional context about where this was found
  }>;
}

export interface Prospect {
  id: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  industry?: string;
  source: 'apollo' | 'zoominfo' | 'real-estate-db' | 'manual' | 'other';
  status: 'new' | 'contacted' | 'responded' | 'converted' | 'unqualified';
  enrichmentScore: number; // 0-100
  tags: string[];
  assignedTo?: string;
  lastContactDate?: string; // ISO date
  createdAt: string; // ISO date
  clientId?: string; // If converted to client
  metadata?: Record<string, any>;
}

export interface EmailTemplate {
  id: string;
  name: string;
  category: 'first-contact' | 'follow-up' | 'proposal' | 'check-in';
  prospectType?: 'new-prospect' | 'existing-prospect' | 'reactivation';
  subject: string; // With merge fields like {{firstName}}
  body: string; // With merge fields
  description?: string;
  isActive: boolean;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

export interface EmailFunnel {
  id: string;
  name: string;
  description?: string;
  prospectType: 'new-prospect' | 'existing-prospect' | 'reactivation';
  templates: Array<{
    templateId: string;
    order: number; // Order in sequence (1, 2, 3...)
    delayDays?: number; // Days to wait before sending (0 = immediate, 1 = next day, etc.)
  }>;
  isActive: boolean;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

export interface ProspectingEmail {
  id: string;
  prospectId?: string;
  clientId?: string;
  templateId?: string;
  subject: string;
  body: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'sent' | 'bounced';
  enrichmentSummary?: {
    keyPoints?: string[];
    painPoints?: string[];
    opportunities?: string[];
    usedSnippets?: string[];
  };
  scheduledFor?: string; // ISO date
  sentAt?: string; // ISO date
  createdAt: string; // ISO date
  updatedAt?: string; // ISO date
}

export interface KnowledgeBankEntry {
  _id: string;
  clientId: string;
  projectId?: string;
  sourceType: 'document' | 'email' | 'manual' | 'call_transcript';
  sourceId?: string;
  entryType: 'deal_update' | 'call_transcript' | 'email' | 'document_summary' | 'project_status' | 'general';
  title: string;
  content: string;
  keyPoints: string[];
  metadata?: Record<string, any>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  _id: string;
  title: string;
  content: any; // Rich text content (JSON format for editor)
  emoji?: string;
  clientId?: string;
  projectId?: string;
  templateId?: string;
  knowledgeBankEntryIds: string[];
  tags: string[];
  mentionedUserIds?: string[];
  lastSavedAt?: string;
  wordCount?: number;
  isDraft?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteTemplate {
  _id: string;
  name: string;
  description?: string;
  template: any; // JSON structure defining template layout
  knowledgeBankFields: string[]; // Fields to pull from knowledge bank
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBankSummary {
  client: Client;
  totalEntries: number;
  entriesByType: Record<string, KnowledgeBankEntry[]>;
  allKeyPoints: string[];
  allTags: string[];
  recentDealUpdates: KnowledgeBankEntry[];
  recentProjectStatusUpdates: KnowledgeBankEntry[];
  relatedProjects: Array<{
    id: string;
    name: string;
    status?: string;
    lifecycleStage?: string;
  }>;
  lastUpdated: string | null;
}

