import { Id } from '../../convex/_generated/dataModel';
import { generateDocumentName, generateBasePattern } from './documentNaming';

/**
 * Bulk Upload Queue Processor
 * 
 * Handles sequential processing of files in a bulk upload batch.
 * Uses the simplified /api/bulk-analyze endpoint for faster analysis.
 */

interface BulkQueueItem {
  itemId: Id<"bulkUploadItems">;
  file: File;
}

interface SuggestedChecklistItem {
  itemId: Id<"knowledgeChecklistItems">;
  itemName: string;
  category: string;
  confidence: number;
  reasoning?: string;
}

// Pre-extracted intelligence field from bulk-analyze (Sprint 4+)
type ValidValueType = "string" | "number" | "currency" | "date" | "percentage" | "array" | "text" | "boolean";
const VALID_VALUE_TYPES = new Set<string>(["string", "number", "currency", "date", "percentage", "array", "text", "boolean"]);

interface ExtractedIntelligenceField {
  fieldPath: string;
  label: string;
  category: string;
  value: any;
  valueType: ValidValueType;
  isCanonical: boolean;
  confidence: number;
  sourceText?: string;
  originalLabel?: string;
  matchedAlias?: string;
  templateTags?: string[];
  pageReference?: string;
  scope?: string;
}

/**
 * Sanitize intelligence fields before sending to Convex.
 * The AI pipeline can generate unexpected valueType values (e.g. "months", "duration")
 * or include fields not in the Convex validator. This normalizes everything to match
 * the schema, preventing ArgumentValidationError on every new document type.
 */
function sanitizeIntelligenceFields(fields: any[]): ExtractedIntelligenceField[] {
  return fields.map(f => ({
    fieldPath: f.fieldPath,
    label: f.label,
    category: f.category,
    value: f.value,
    valueType: VALID_VALUE_TYPES.has(f.valueType) ? f.valueType as ValidValueType : "text",
    isCanonical: f.isCanonical ?? false,
    confidence: typeof f.confidence === 'number' ? f.confidence : 0,
    sourceText: f.sourceText,
    originalLabel: f.originalLabel,
    matchedAlias: f.matchedAlias,
    templateTags: Array.isArray(f.templateTags) ? f.templateTags : undefined,
    pageReference: f.pageReference,
    scope: f.scope,
  }));
}

interface ExtractedIntelligence {
  fields: ExtractedIntelligenceField[];
  insights?: {
    keyFindings?: string[];
    risks?: Array<{ risk: string; severity?: string }>;
  };
}

// Document analysis from Stage 1 Summary Agent
interface DocumentAnalysis {
  documentDescription: string;
  documentPurpose: string;
  entities: {
    people: string[];
    companies: string[];
    locations: string[];
    projects: string[];
  };
  keyTerms: string[];
  keyDates: string[];
  keyAmounts: string[];
  executiveSummary: string;
  detailedSummary: string;
  sectionBreakdown?: string[];
  documentCharacteristics: {
    isFinancial: boolean;
    isLegal: boolean;
    isIdentity: boolean;
    isReport: boolean;
    isDesign: boolean;
    isCorrespondence: boolean;
    hasMultipleProjects: boolean;
    isInternal: boolean;
  };
  rawContentType: string;
  confidenceInAnalysis: number;
}

interface BulkAnalysisResult {
  summary: string;
  fileType: string;
  category: string;
  confidence: number;
  suggestedFolder: string;
  typeAbbreviation: string;
  suggestedChecklistItems?: SuggestedChecklistItem[];
}

interface BulkAnalysisResponse {
  success: boolean;
  result: BulkAnalysisResult;
  extractedIntelligence?: ExtractedIntelligence;
  documentAnalysis?: DocumentAnalysis;
  classificationReasoning?: string;
}

export interface BulkQueueProcessorCallbacks {
  // Convex mutations
  updateItemStatus: (args: {
    itemId: Id<"bulkUploadItems">;
    status: "pending" | "processing" | "ready_for_review" | "filed" | "error";
    error?: string;
  }) => Promise<Id<"bulkUploadItems">>;
  
  updateItemAnalysis: (args: {
    itemId: Id<"bulkUploadItems">;
    fileStorageId?: Id<"_storage">;
    summary: string;
    fileTypeDetected: string;
    category: string;
    targetFolder?: string;
    confidence: number;
    generatedDocumentCode?: string;
    version?: string;
    isDuplicate?: boolean;
    duplicateOfDocumentId?: Id<"documents">;
    suggestedChecklistItems?: SuggestedChecklistItem[];
    extractedIntelligence?: ExtractedIntelligence;
    documentAnalysis?: DocumentAnalysis;
    classificationReasoning?: string;
    textContent?: string;
  }) => Promise<Id<"bulkUploadItems">>;
  
  updateBatchStatus: (args: {
    batchId: Id<"bulkUploadBatches">;
    status: "uploading" | "processing" | "review" | "completed" | "partial";
    processedFiles?: number;
    errorFiles?: number;
  }) => Promise<Id<"bulkUploadBatches">>;
  
  checkForDuplicates: (args: {
    originalFileName: string;
    clientId: string;
    projectId?: string;
  }) => Promise<{
    isDuplicate: boolean;
    hasExactMatch?: boolean;
    hasSimilarMatch?: boolean;
    existingDocuments: Array<{
      documentId: string;
      fileName: string;
      matchType: 'exact' | 'similar';
      uploadedAt?: string;
      folder?: string;
    }>;
    message?: string | null;
  }>;
  
  // File storage
  generateUploadUrl: () => Promise<string>;
  
  // Progress callback
  onProgress?: (processed: number, total: number, currentFile: string) => void;
  onError?: (itemId: Id<"bulkUploadItems">, error: string) => void;
  onComplete?: (batchId: Id<"bulkUploadBatches">) => void;
}

export interface BatchInfo {
  batchId: Id<"bulkUploadBatches">;
  clientId: Id<"clients">;
  clientName: string;
  clientType?: string;
  projectId?: Id<"projects">;
  projectShortcode?: string;
  isInternal: boolean;
  instructions?: string;
  uploaderInitials: string;
  /** Missing checklist items for the target project/client — enables AI matching */
  checklistItems?: Array<{
    id: string;
    name: string;
    category: string;
    status: string;
    matchingDocumentTypes?: string[];
  }>;
  /** Available folders for filing — enables AI folder suggestions */
  availableFolders?: Array<{
    folderKey: string;
    name: string;
    level: 'client' | 'project';
  }>;
}

export class BulkQueueProcessor {
  private queue: BulkQueueItem[] = [];
  private processing: boolean = false;
  private aborted: boolean = false;
  private callbacks: BulkQueueProcessorCallbacks;
  private batchInfo: BatchInfo | null = null;
  private processedCount: number = 0;
  private errorCount: number = 0;

  constructor(callbacks: BulkQueueProcessorCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Initialize the processor with batch information
   */
  setBatchInfo(info: BatchInfo) {
    this.batchInfo = info;
  }

  /**
   * Add an item to the processing queue
   */
  addItem(itemId: Id<"bulkUploadItems">, file: File) {
    this.queue.push({ itemId, file });
  }

  /**
   * Get the current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Check if processing is in progress
   */
  isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Abort processing (after current file completes)
   */
  abort() {
    this.aborted = true;
  }

  /**
   * Start processing all queued items
   */
  async processQueue(): Promise<{ processed: number; errors: number }> {
    if (this.processing || this.queue.length === 0 || !this.batchInfo) {
      return { processed: this.processedCount, errors: this.errorCount };
    }

    this.processing = true;
    this.aborted = false;
    this.processedCount = 0;
    this.errorCount = 0;
    const totalItems = this.queue.length;

    // Update batch status to processing
    await this.callbacks.updateBatchStatus({
      batchId: this.batchInfo.batchId,
      status: "processing",
      processedFiles: 0,
    });

    while (this.queue.length > 0 && !this.aborted) {
      const item = this.queue.shift()!;
      
      try {
        await this.processItem(item);
        this.processedCount++;
      } catch (error) {
        this.errorCount++;
        console.error(`[BulkQueue] Error processing ${item.file.name}:`, error);
        
        // Update item status to error
        await this.callbacks.updateItemStatus({
          itemId: item.itemId,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
        
        this.callbacks.onError?.(
          item.itemId,
          error instanceof Error ? error.message : "Unknown error"
        );
      }

      // Report progress
      this.callbacks.onProgress?.(
        this.processedCount + this.errorCount,
        totalItems,
        item.file.name
      );

      // Update batch processed count
      await this.callbacks.updateBatchStatus({
        batchId: this.batchInfo.batchId,
        status: "processing",
        processedFiles: this.processedCount,
        errorFiles: this.errorCount,
      });
    }

    // Final batch status update
    const finalStatus = this.queue.length === 0 ? "review" : "processing";
    await this.callbacks.updateBatchStatus({
      batchId: this.batchInfo.batchId,
      status: finalStatus,
      processedFiles: this.processedCount,
      errorFiles: this.errorCount,
    });

    this.processing = false;
    
    if (finalStatus === "review") {
      this.callbacks.onComplete?.(this.batchInfo.batchId);
    }

    return { processed: this.processedCount, errors: this.errorCount };
  }

  /**
   * Process a single item
   */
  private async processItem(item: BulkQueueItem): Promise<void> {
    if (!this.batchInfo) {
      throw new Error("Batch info not set");
    }

    // Update status to processing
    await this.callbacks.updateItemStatus({
      itemId: item.itemId,
      status: "processing",
    });

    // Upload file to storage
    const uploadUrl = await this.callbacks.generateUploadUrl();
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": item.file.type },
      body: item.file,
    });

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload file to storage");
    }

    const { storageId } = await uploadResponse.json();

    // Call V4 analyze API
    const formData = new FormData();
    formData.append("file", item.file);
    if (this.batchInfo.clientType) {
      formData.append("clientType", this.batchInfo.clientType);
    }

    // Pass rich metadata to V4 pipeline
    const metadata: Record<string, any> = {};
    if (this.batchInfo.clientName) {
      metadata.clientName = this.batchInfo.clientName;
      metadata.clientContext = {
        clientType: this.batchInfo.clientType,
        clientName: this.batchInfo.clientName,
      };
    }
    if (this.batchInfo.projectShortcode) {
      metadata.projectShortcode = this.batchInfo.projectShortcode;
    }
    if (this.batchInfo.isInternal) {
      metadata.isInternal = this.batchInfo.isInternal;
    }
    if (this.batchInfo.uploaderInitials) {
      metadata.uploaderInitials = this.batchInfo.uploaderInitials;
    }
    if (this.batchInfo.instructions) {
      metadata.instructions = this.batchInfo.instructions;
    }
    if (this.batchInfo.checklistItems && this.batchInfo.checklistItems.length > 0) {
      metadata.checklistItems = this.batchInfo.checklistItems;
    }
    if (this.batchInfo.availableFolders && this.batchInfo.availableFolders.length > 0) {
      metadata.availableFolders = this.batchInfo.availableFolders;
    }
    formData.append("metadata", JSON.stringify(metadata));

    const analyzeResponse = await fetch("/api/v4-analyze", {
      method: "POST",
      body: formData,
    });

    if (!analyzeResponse.ok) {
      const errorData = await analyzeResponse.json().catch(() => ({}));
      throw new Error(errorData.error || "Analysis failed");
    }

    const v4Data = await analyzeResponse.json();

    if (!v4Data.success || !v4Data.documents || v4Data.documents.length === 0) {
      const errorMsg = v4Data.errors?.[0]?.error || "V4 analysis returned no results";
      throw new Error(errorMsg);
    }

    // Map V4 response to the expected format
    const doc = v4Data.documents[0];
    const result: BulkAnalysisResult = {
      summary: doc.summary || "",
      fileType: doc.fileType || "Unknown",
      category: doc.category || "miscellaneous",
      confidence: doc.confidence || 0,
      suggestedFolder: doc.suggestedFolder || "",
      typeAbbreviation: doc.typeAbbreviation || "",
      suggestedChecklistItems: doc.checklistMatches || undefined,
    };
    // Prefer dedicated intelligence extraction fields (from Stage 5.5),
    // fall back to classification's extractedData for backward compat.
    // Always sanitize to normalize AI-generated values (e.g. valueType) to match Convex schema.
    const rawFields = doc.intelligenceFields && doc.intelligenceFields.length > 0
      ? doc.intelligenceFields
      : doc.extractedData
        ? flattenV4ExtractedData(doc.extractedData)
        : null;
    const extractedIntelligence = rawFields
      ? { fields: sanitizeIntelligenceFields(rawFields) }
      : undefined;
    const documentAnalysis = doc.documentAnalysis || undefined;
    const classificationReasoning = doc.classificationReasoning || undefined;
    console.log(`[BulkQueueProcessor] V4 result: ${doc.fileType} (${(doc.confidence * 100).toFixed(0)}% confidence, mock=${v4Data.isMock})`);
    if (extractedIntelligence) {
      console.log(`[BulkQueueProcessor] Intelligence fields: ${extractedIntelligence.fields.length}`);
    }

    // Generate document code
    let generatedDocumentCode: string | undefined;
    let version = "V1.0";
    let isDuplicate = false;
    let duplicateOfDocumentId: Id<"documents"> | undefined;

    // Use project shortcode if available, otherwise generate from client name
    const shortcode = this.batchInfo.projectShortcode ||
      this.batchInfo.clientName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) ||
      'CLIENT';

    // Check for duplicates by original filename
    console.log(`[BulkQueueProcessor] Checking duplicates for "${item.file.name}"...`);
    const duplicateCheck = await this.callbacks.checkForDuplicates({
      originalFileName: item.file.name,
      clientId: this.batchInfo.clientId,
      projectId: this.batchInfo.projectId,
    });

    if (duplicateCheck.isDuplicate && duplicateCheck.existingDocuments.length > 0) {
      isDuplicate = true;
      // Store the first duplicate document ID for reference
      duplicateOfDocumentId = duplicateCheck.existingDocuments[0].documentId as Id<"documents">;
      // Log duplicate detection for visibility
      console.log(`[Duplicate Check] ${item.file.name}: ${duplicateCheck.hasExactMatch ? 'EXACT MATCH' : 'SIMILAR MATCH'} found - ${duplicateCheck.message}`);
    }

    // Use V4-generated document code if available, otherwise generate locally
    generatedDocumentCode = doc.generatedDocumentCode || generateDocumentName({
      projectShortcode: shortcode,
      category: result.category,
      isInternal: this.batchInfo.isInternal,
      uploaderInitials: this.batchInfo.uploaderInitials,
      version,
    });

    // Update item with analysis results
    const updateArgs = {
      itemId: item.itemId,
      fileStorageId: storageId,
      summary: result.summary,
      fileTypeDetected: result.fileType,
      category: result.category,
      targetFolder: result.suggestedFolder,
      confidence: result.confidence,
      generatedDocumentCode,
      version: isDuplicate ? undefined : version, // Don't set version for duplicates
      isDuplicate,
      duplicateOfDocumentId,
      suggestedChecklistItems: result.suggestedChecklistItems,
      extractedIntelligence: extractedIntelligence,
      documentAnalysis: documentAnalysis,
      classificationReasoning: classificationReasoning,
    };

    console.log(`[BulkQueueProcessor] Saving to Convex:`, JSON.stringify({
      fileType: updateArgs.fileTypeDetected,
      category: updateArgs.category,
      confidence: updateArgs.confidence,
      targetFolder: updateArgs.targetFolder,
      hasStorageId: !!updateArgs.fileStorageId,
      hasIntelligence: !!updateArgs.extractedIntelligence,
      intelligenceFieldCount: updateArgs.extractedIntelligence?.fields?.length ?? 0,
      generatedDocumentCode: updateArgs.generatedDocumentCode,
    }));

    try {
      await this.callbacks.updateItemAnalysis(updateArgs);
      console.log(`[BulkQueueProcessor] Successfully saved to Convex`);
    } catch (convexError) {
      console.error(`[BulkQueueProcessor] Convex updateItemAnalysis FAILED:`, convexError);
      console.error(`[BulkQueueProcessor] Full args:`, JSON.stringify(updateArgs, null, 2));
      throw convexError;
    }
  }
}

/**
 * Flatten V4's nested extractedData back into the ExtractedIntelligenceField[] format
 * that the Convex schema expects. V4 nests by fieldPath (e.g., kyc.identity.fullName),
 * but Convex stores them as a flat fields array.
 */
function flattenV4ExtractedData(data: Record<string, any>): ExtractedIntelligenceField[] {
  const fields: ExtractedIntelligenceField[] = [];

  function walk(obj: Record<string, any>, pathParts: string[]) {
    for (const [key, val] of Object.entries(obj)) {
      if (val && typeof val === 'object' && 'value' in val && ('type' in val || 'confidence' in val)) {
        // This is a leaf field node: { value, type, confidence, label }
        fields.push({
          fieldPath: [...pathParts, key].join('.'),
          value: val.value,
          label: val.label || key,
          category: pathParts[0] || 'general',
          valueType: val.type || 'text',
          isCanonical: false,
          confidence: val.confidence || 0,
          sourceText: val.sourceText,
          originalLabel: val.originalLabel || val.label || key,
          templateTags: val.templateTags || ['general'],
          pageReference: val.pageReference,
        });
      } else if (val && typeof val === 'object') {
        walk(val, [...pathParts, key]);
      }
    }
  }

  walk(data, []);
  return fields;
}

/**
 * Create a bulk queue processor with Convex mutations
 */
export function createBulkQueueProcessor(
  convexMutations: {
    updateItemStatus: BulkQueueProcessorCallbacks['updateItemStatus'];
    updateItemAnalysis: BulkQueueProcessorCallbacks['updateItemAnalysis'];
    updateBatchStatus: BulkQueueProcessorCallbacks['updateBatchStatus'];
    checkForDuplicates: BulkQueueProcessorCallbacks['checkForDuplicates'];
    generateUploadUrl: BulkQueueProcessorCallbacks['generateUploadUrl'];
  },
  options?: {
    onProgress?: BulkQueueProcessorCallbacks['onProgress'];
    onError?: BulkQueueProcessorCallbacks['onError'];
    onComplete?: BulkQueueProcessorCallbacks['onComplete'];
  }
): BulkQueueProcessor {
  return new BulkQueueProcessor({
    ...convexMutations,
    ...options,
  });
}
