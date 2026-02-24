// =============================================================================
// V4 BATCH QUEUE PROCESSOR
// =============================================================================
// Replaces the legacy BulkQueueProcessor's per-file serial approach with
// true batch processing via the V4 pipeline.
//
// LEGACY FLOW (per file, serial):
//   File₁ → upload → /api/bulk-analyze → update item
//   File₂ → upload → /api/bulk-analyze → update item
//   File₃ → upload → /api/bulk-analyze → update item
//   ...15 files = 15 API calls, ~45 seconds
//
// V4 FLOW (batch, parallel uploads):
//   [File₁, File₂, ... File₁₅] → parallel upload → /api/v4-analyze (batched) → update all items
//   ...15 files = 2 API calls, ~10 seconds
//
// This processor:
// 1. Uploads all files to Convex storage in parallel
// 2. Sends the entire batch to /api/v4-analyze
// 3. Maps results back to individual Convex bulkUploadItems
// 4. Handles per-document errors gracefully (partial success)
//
// It uses the SAME Convex callbacks as the legacy processor, so the
// BulkReviewTable and filing flow don't need to change.

import type { Id } from '../../../convex/_generated/dataModel';

// =============================================================================
// TYPES (compatible with legacy BulkQueueProcessor)
// =============================================================================

interface V4QueueItem {
  itemId: Id<'bulkUploadItems'>;
  file: File;
}

export interface V4BatchProcessorCallbacks {
  // Convex mutations (same interface as legacy)
  updateItemStatus: (args: {
    itemId: Id<'bulkUploadItems'>;
    status: 'pending' | 'processing' | 'ready_for_review' | 'filed' | 'error';
    error?: string;
  }) => Promise<Id<'bulkUploadItems'>>;

  updateItemAnalysis: (args: {
    itemId: Id<'bulkUploadItems'>;
    fileStorageId?: Id<'_storage'>;
    summary: string;
    fileTypeDetected: string;
    category: string;
    targetFolder?: string;
    confidence: number;
    generatedDocumentCode?: string;
    version?: string;
    isDuplicate?: boolean;
    duplicateOfDocumentId?: Id<'documents'>;
  }) => Promise<Id<'bulkUploadItems'>>;

  updateBatchStatus: (args: {
    batchId: Id<'bulkUploadBatches'>;
    status: 'uploading' | 'processing' | 'review' | 'completed' | 'partial';
    processedFiles?: number;
    errorFiles?: number;
  }) => Promise<Id<'bulkUploadBatches'>>;

  checkForDuplicates: (args: {
    projectShortcode: string;
    category: string;
    isInternal: boolean;
  }) => Promise<{
    isDuplicate: boolean;
    existingDocuments: Array<{
      _id: Id<'documents'>;
      documentCode?: string;
      version?: string;
      fileName: string;
      uploadedAt: string;
    }>;
    latestVersion?: string;
  }>;

  generateUploadUrl: () => Promise<string>;
}

export interface V4BatchInfo {
  batchId: Id<'bulkUploadBatches'>;
  clientName: string;
  clientType?: string;
  projectShortcode?: string;
  isInternal: boolean;
  instructions?: string;
  uploaderInitials: string;
}

export interface V4BatchProcessorOptions {
  onProgress?: (processed: number, total: number, currentFile: string, phase: 'uploading' | 'analyzing' | 'mapping') => void;
  onError?: (itemId: Id<'bulkUploadItems'>, error: string) => void;
  onComplete?: (batchId: Id<'bulkUploadBatches'>) => void;
  /** Maximum concurrent file uploads (default: 5) */
  maxConcurrentUploads?: number;
}

// =============================================================================
// V4 BATCH PROCESSOR
// =============================================================================

export class V4BatchProcessor {
  private queue: V4QueueItem[] = [];
  private processing = false;
  private aborted = false;
  private callbacks: V4BatchProcessorCallbacks;
  private options: V4BatchProcessorOptions;
  private batchInfo: V4BatchInfo | null = null;
  private processedCount = 0;
  private errorCount = 0;

  constructor(callbacks: V4BatchProcessorCallbacks, options: V4BatchProcessorOptions = {}) {
    this.callbacks = callbacks;
    this.options = options;
  }

  setBatchInfo(info: V4BatchInfo) {
    this.batchInfo = info;
  }

  addItem(itemId: Id<'bulkUploadItems'>, file: File) {
    this.queue.push({ itemId, file });
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  abort() {
    this.aborted = true;
  }

  /**
   * Process the entire queue as a batch.
   *
   * Phase 1: Upload all files to Convex storage (parallel, throttled)
   * Phase 2: Send batch to /api/v4-analyze
   * Phase 3: Map results back to Convex items
   */
  async processQueue(): Promise<{ processed: number; errors: number }> {
    if (this.processing || this.queue.length === 0 || !this.batchInfo) {
      return { processed: this.processedCount, errors: this.errorCount };
    }

    this.processing = true;
    this.aborted = false;
    this.processedCount = 0;
    this.errorCount = 0;

    const items = [...this.queue];
    this.queue = [];
    const totalItems = items.length;

    // Track which items completed successfully (for cleanup on fatal error)
    const completedItemIds = new Set<string>();

    try {
      // Update batch status to processing
      await this.callbacks.updateBatchStatus({
        batchId: this.batchInfo.batchId,
        status: 'processing',
        processedFiles: 0,
      });

      // Mark all items as processing
      await Promise.all(
        items.map(item =>
          this.callbacks.updateItemStatus({
            itemId: item.itemId,
            status: 'processing',
          })
        )
      );

      // ── PHASE 1: Upload files to storage (parallel, throttled) ──
      const maxConcurrent = this.options.maxConcurrentUploads || 5;
      const storageIds = new Map<string, Id<'_storage'>>();

      for (let i = 0; i < items.length; i += maxConcurrent) {
        if (this.aborted) break;

        const batch = items.slice(i, i + maxConcurrent);
        const uploadResults = await Promise.allSettled(
          batch.map(async (item) => {
            const uploadUrl = await this.callbacks.generateUploadUrl();
            const response = await fetch(uploadUrl, {
              method: 'POST',
              headers: { 'Content-Type': item.file.type },
              body: item.file,
            });

            if (!response.ok) {
              throw new Error(`Upload failed for ${item.file.name}`);
            }

            const { storageId } = await response.json();
            return { itemId: item.itemId, storageId, fileName: item.file.name };
          })
        );

        // Collect results
        for (const result of uploadResults) {
          if (result.status === 'fulfilled') {
            storageIds.set(result.value.itemId as string, result.value.storageId);
          } else {
            console.error('[V4 Batch] Upload failed:', result.reason);
          }
        }

        this.options.onProgress?.(
          Math.min(i + maxConcurrent, totalItems),
          totalItems,
          batch[batch.length - 1].file.name,
          'uploading',
        );
      }

      console.log(`[V4 Batch] Uploaded ${storageIds.size}/${totalItems} files to storage`);

      // ── PHASE 2: Send batch to V4 pipeline ──
      this.options.onProgress?.(0, totalItems, 'Analyzing batch...', 'analyzing');

      const formData = new FormData();

      // Add files in order
      items.forEach((item, index) => {
        formData.append(`file_${index}`, item.file);
      });

      // Add metadata
      formData.append('metadata', JSON.stringify({
        clientContext: {
          clientName: this.batchInfo!.clientName,
          clientType: this.batchInfo!.clientType,
        },
        projectShortcode: this.batchInfo!.projectShortcode,
        clientName: this.batchInfo!.clientName,
        isInternal: this.batchInfo!.isInternal,
        uploaderInitials: this.batchInfo!.uploaderInitials,
        checklistItems: [],
        availableFolders: [],
      }));

      if (this.batchInfo!.clientType) {
        formData.append('clientType', this.batchInfo!.clientType);
      }

      const analyzeResponse = await fetch('/api/v4-analyze', {
        method: 'POST',
        body: formData,
      });

      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'V4 analysis failed');
      }

      const analyzeResult = await analyzeResponse.json();

      console.log(`[V4 Batch] V4 pipeline returned ${analyzeResult.documents?.length || 0} classifications`);
      if (analyzeResult.isMock) {
        console.log(`[V4 Batch] Running in MOCK mode`);
      }

      // ── PHASE 3: Map results to Convex items ──
      this.options.onProgress?.(0, totalItems, 'Mapping results...', 'mapping');

      const documentResults: Array<{
        documentIndex: number;
        summary: string;
        fileType: string;
        category: string;
        confidence: number;
        suggestedFolder: string;
        generatedDocumentCode: string;
        version: string;
        extractedData?: any;
      }> = analyzeResult.documents || [];

      // Map each result back to its Convex item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Find the matching classification result
        const docResult = documentResults.find(d => d.documentIndex === i);

        if (!docResult) {
          // Document wasn't classified (error in pipeline)
          this.errorCount++;
          await this.callbacks.updateItemStatus({
            itemId: item.itemId,
            status: 'error',
            error: 'Document not classified by V4 pipeline',
          });
          this.options.onError?.(item.itemId, 'Document not classified by V4 pipeline');
          continue;
        }

        try {
          // Check for duplicates
          const shortcode = this.batchInfo!.projectShortcode ||
            this.batchInfo!.clientName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) ||
            'CLIENT';

          let isDuplicate = false;
          let duplicateOfDocumentId: Id<'documents'> | undefined;
          let version = docResult.version || 'V1.0';

          const duplicateCheck = await this.callbacks.checkForDuplicates({
            projectShortcode: shortcode,
            category: docResult.category,
            isInternal: this.batchInfo!.isInternal,
          });

          if (duplicateCheck.isDuplicate && duplicateCheck.existingDocuments.length > 0) {
            isDuplicate = true;
            duplicateOfDocumentId = duplicateCheck.existingDocuments[0]._id;
            // Don't set version yet — user chooses minor/significant in review
            version = '';
          }

          // Update item with analysis results
          await this.callbacks.updateItemAnalysis({
            itemId: item.itemId,
            fileStorageId: storageIds.get(item.itemId as string),
            summary: docResult.summary,
            fileTypeDetected: docResult.fileType,
            category: docResult.category,
            targetFolder: docResult.suggestedFolder,
            confidence: docResult.confidence,
            generatedDocumentCode: docResult.generatedDocumentCode,
            version: isDuplicate ? undefined : version,
            isDuplicate,
            duplicateOfDocumentId,
          });

          this.processedCount++;
          completedItemIds.add(item.itemId as string);
        } catch (error) {
          this.errorCount++;
          await this.callbacks.updateItemStatus({
            itemId: item.itemId,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          this.options.onError?.(
            item.itemId,
            error instanceof Error ? error.message : 'Unknown error',
          );
        }

        this.options.onProgress?.(
          this.processedCount + this.errorCount,
          totalItems,
          item.file.name,
          'mapping',
        );

        // Update batch progress
        await this.callbacks.updateBatchStatus({
          batchId: this.batchInfo!.batchId,
          status: 'processing',
          processedFiles: this.processedCount,
          errorFiles: this.errorCount,
        });
      }

      // Final batch status
      const finalStatus = this.processedCount > 0 ? 'review' : 'partial';
      await this.callbacks.updateBatchStatus({
        batchId: this.batchInfo!.batchId,
        status: finalStatus,
        processedFiles: this.processedCount,
        errorFiles: this.errorCount,
      });

      if (finalStatus === 'review') {
        this.options.onComplete?.(this.batchInfo!.batchId);
      }
    } catch (error) {
      console.error('[V4 Batch] Fatal error:', error);

      // Mark only unprocessed items as error (skip items that already succeeded)
      for (const item of items) {
        if (!completedItemIds.has(item.itemId as string)) {
          await this.callbacks.updateItemStatus({
            itemId: item.itemId,
            status: 'error',
            error: error instanceof Error ? error.message : 'Batch processing failed',
          }).catch(() => {}); // Don't throw on cleanup
        }
      }

      // Update batch to partial
      if (this.batchInfo) {
        await this.callbacks.updateBatchStatus({
          batchId: this.batchInfo.batchId,
          status: 'partial',
          processedFiles: this.processedCount,
          errorFiles: this.errorCount || items.length,
        }).catch(() => {});
      }
    }

    this.processing = false;
    return { processed: this.processedCount, errors: this.errorCount };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a V4 batch processor with the same Convex callback interface
 * as the legacy BulkQueueProcessor.
 */
export function createV4BatchProcessor(
  convexMutations: {
    updateItemStatus: V4BatchProcessorCallbacks['updateItemStatus'];
    updateItemAnalysis: V4BatchProcessorCallbacks['updateItemAnalysis'];
    updateBatchStatus: V4BatchProcessorCallbacks['updateBatchStatus'];
    checkForDuplicates: V4BatchProcessorCallbacks['checkForDuplicates'];
    generateUploadUrl: V4BatchProcessorCallbacks['generateUploadUrl'];
  },
  options?: V4BatchProcessorOptions,
): V4BatchProcessor {
  return new V4BatchProcessor(convexMutations, options);
}
