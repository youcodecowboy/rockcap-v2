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

interface BulkAnalysisResult {
  summary: string;
  fileType: string;
  category: string;
  confidence: number;
  suggestedFolder: string;
  typeAbbreviation: string;
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
  }) => Promise<Id<"bulkUploadItems">>;
  
  updateBatchStatus: (args: {
    batchId: Id<"bulkUploadBatches">;
    status: "uploading" | "processing" | "review" | "completed" | "partial";
    processedFiles?: number;
    errorFiles?: number;
  }) => Promise<Id<"bulkUploadBatches">>;
  
  checkForDuplicates: (args: {
    projectShortcode: string;
    category: string;
    isInternal: boolean;
  }) => Promise<{
    isDuplicate: boolean;
    existingDocuments: Array<{
      _id: Id<"documents">;
      documentCode?: string;
      version?: string;
      fileName: string;
      uploadedAt: string;
    }>;
    latestVersion?: string;
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
  clientName: string;
  clientType?: string;
  projectShortcode?: string;
  isInternal: boolean;
  instructions?: string;
  uploaderInitials: string;
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

    // Call bulk-analyze API
    const formData = new FormData();
    formData.append("file", item.file);
    if (this.batchInfo.instructions) {
      formData.append("instructions", this.batchInfo.instructions);
    }
    if (this.batchInfo.clientType) {
      formData.append("clientType", this.batchInfo.clientType);
    }

    const analyzeResponse = await fetch("/api/bulk-analyze", {
      method: "POST",
      body: formData,
    });

    if (!analyzeResponse.ok) {
      const errorData = await analyzeResponse.json().catch(() => ({}));
      throw new Error(errorData.error || "Analysis failed");
    }

    const analyzeData = await analyzeResponse.json();
    const result: BulkAnalysisResult = analyzeData.result;

    // Generate document code
    let generatedDocumentCode: string | undefined;
    let version = "V1.0";
    let isDuplicate = false;
    let duplicateOfDocumentId: Id<"documents"> | undefined;

    // Use project shortcode if available, otherwise generate from client name
    const shortcode = this.batchInfo.projectShortcode || 
      this.batchInfo.clientName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 
      'CLIENT';

    // Check for duplicates
    const duplicateCheck = await this.callbacks.checkForDuplicates({
      projectShortcode: shortcode,
      category: result.category,
      isInternal: this.batchInfo.isInternal,
    });

    if (duplicateCheck.isDuplicate && duplicateCheck.existingDocuments.length > 0) {
      isDuplicate = true;
      duplicateOfDocumentId = duplicateCheck.existingDocuments[0]._id;
      // Don't set version yet - user needs to choose minor/significant
    }

    // Always generate document name
    generatedDocumentCode = generateDocumentName({
      projectShortcode: shortcode,
      category: result.category,
      isInternal: this.batchInfo.isInternal,
      uploaderInitials: this.batchInfo.uploaderInitials,
      version,
    });

    // Update item with analysis results
    await this.callbacks.updateItemAnalysis({
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
    });
  }
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
