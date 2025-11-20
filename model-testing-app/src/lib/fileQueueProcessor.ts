import { Id } from '../../convex/_generated/dataModel';
import { AnalysisResult } from '@/types';
import { shouldAutoFile, needsConfirmation } from './autoFiling';

interface QueueJob {
  jobId: Id<"fileUploadQueue">;
  file: File;
  hasCustomInstructions?: boolean;
}

export interface QueueProcessorCallbacks {
  createJob: (args: { fileName: string; fileSize: number; fileType: string; hasCustomInstructions?: boolean }) => Promise<Id<"fileUploadQueue">>;
  updateJobStatus: (args: {
    jobId: Id<"fileUploadQueue">;
    status?: "pending" | "uploading" | "analyzing" | "completed" | "error" | "needs_confirmation";
    progress?: number;
    fileStorageId?: Id<"_storage">;
    analysisResult?: any;
    documentId?: Id<"documents">;
    error?: string;
    customInstructions?: string;
  }) => Promise<Id<"fileUploadQueue">>;
  generateUploadUrl: () => Promise<string>;
  getFileUrl: (storageId: Id<"_storage">) => Promise<string | null>;
  getJob: (jobId: Id<"fileUploadQueue">) => Promise<any>;
  createDocument: (args: any) => Promise<Id<"documents">>;
  saveProspectingContext: (args: any) => Promise<void>;
  createEnrichment: (args: any) => Promise<void>;
}

/**
 * Client-side queue processor for background file processing
 * Processes files sequentially to avoid API rate limits
 */
export class FileQueueProcessor {
  private queue: QueueJob[] = [];
  private processing: boolean = false;
  private maxQueueSize: number = 15;
  private callbacks: QueueProcessorCallbacks | null = null;

  constructor(callbacks: QueueProcessorCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Add a file to the queue
   */
  async addFile(file: File, hasCustomInstructions?: boolean): Promise<Id<"fileUploadQueue"> | null> {
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(`Queue is full. Maximum ${this.maxQueueSize} files allowed.`);
    }

    if (!this.callbacks) {
      throw new Error('Queue processor not initialized');
    }

    // Create queue job in Convex
    const jobId = await this.callbacks.createJob({
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      hasCustomInstructions: hasCustomInstructions || false,
    });

    // Add to local queue
    this.queue.push({ jobId, file, hasCustomInstructions: hasCustomInstructions || false });

    // Start processing if not already processing
    if (!this.processing) {
      this.processQueue();
    }

    return jobId;
  }

  /**
   * Remove a file from the queue (if not yet processing)
   */
  removeFile(jobId: Id<"fileUploadQueue">): boolean {
    const index = this.queue.findIndex(job => job.jobId === jobId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Process the queue sequentially
   */
  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      try {
        await this.processFile(job.jobId, job.file, job.hasCustomInstructions);
      } catch (error) {
        console.error('Error processing file:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Check if this was a retry exhaustion (all retries failed)
        const isRetryExhausted = errorMessage.includes('500') || 
                                  errorMessage.includes('502') || 
                                  errorMessage.includes('503') || 
                                  errorMessage.includes('504') ||
                                  errorMessage.includes('Internal Server Error');
        
        if (this.callbacks) {
          await this.callbacks.updateJobStatus({
            jobId: job.jobId,
            status: 'error',
            error: isRetryExhausted 
              ? `${errorMessage} (All retry attempts exhausted)`
              : errorMessage,
            progress: 0,
          });
        }
      }
    }

    this.processing = false;
  }

  /**
   * Retry a function with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    retryableStatusCodes: number[] = [500, 502, 503, 504]
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Check if this is a retryable error
        const isRetryable = error?.status && retryableStatusCodes.includes(error.status) ||
                           error?.message?.includes('500') ||
                           error?.message?.includes('502') ||
                           error?.message?.includes('503') ||
                           error?.message?.includes('504') ||
                           error?.message?.includes('Internal Server Error');
        
        // If not retryable or we've exhausted retries, throw
        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }
        
        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError || new Error('Retry failed');
  }

  /**
   * Process a single file through the pipeline
   */
  private async processFile(jobId: Id<"fileUploadQueue">, file: File, hasCustomInstructions?: boolean) {
    if (!this.callbacks) {
      throw new Error('Queue processor not initialized');
    }

    try {
      // Step 1: Upload to Convex storage
      await this.callbacks.updateJobStatus({
        jobId,
        status: 'uploading',
        progress: 10,
      });

      const uploadUrl = await this.callbacks.generateUploadUrl();
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to Convex storage');
      }

      const responseText = await uploadResponse.text();
      let fileStorageId: Id<"_storage">;
      try {
        const responseData = JSON.parse(responseText);
        fileStorageId = responseData.storageId as Id<"_storage">;
      } catch {
        fileStorageId = responseText.trim() as Id<"_storage">;
      }

      await this.callbacks.updateJobStatus({
        jobId,
        status: 'uploading',
        progress: 30,
        fileStorageId,
      });

      // Step 2: Check if custom instructions are needed BEFORE analysis
      // If custom instructions were requested, skip analysis and wait for instructions
      if (hasCustomInstructions) {
        await this.callbacks.updateJobStatus({
          jobId,
          status: 'needs_confirmation',
          progress: 100,
          fileStorageId,
        });
        return; // Stop here - analysis will happen after instructions are provided
      }

      // Step 3: Analyze file with retry logic (only if no custom instructions needed)
      await this.callbacks.updateJobStatus({
        jobId,
        status: 'analyzing',
        progress: 40,
      });

      // Retry analysis API call on server errors
      // Note: FormData must be recreated for each retry attempt since it can only be read once
      const analysisResult: AnalysisResult = await this.retryWithBackoff(async () => {
        // Create fresh FormData for each retry attempt
        const formData = new FormData();
        formData.append('file', file);

        const analysisResponse = await fetch('/api/analyze-file', {
          method: 'POST',
          body: formData,
        });

        if (!analysisResponse.ok) {
          const errorData = await analysisResponse.json().catch(() => ({ error: `HTTP ${analysisResponse.status}` }));
          const error = new Error(errorData.error || `Failed to analyze file (${analysisResponse.status})`);
          (error as any).status = analysisResponse.status;
          throw error;
        }

        return await analysisResponse.json();
      }, 3, 2000); // 3 retries, 2 second base delay (2s, 4s, 8s delays)

      await this.callbacks.updateJobStatus({
        jobId,
        status: 'analyzing',
        progress: 70,
        analysisResult,
      });

      // Step 4: Determine if auto-filing or needs confirmation
      if (shouldAutoFile(analysisResult)) {
        // Auto-file the document
        await this.autoFileDocument(jobId, file, fileStorageId, analysisResult);
      } else if (needsConfirmation(analysisResult)) {
        // Mark as needing confirmation
        await this.callbacks.updateJobStatus({
          jobId,
          status: 'needs_confirmation',
          progress: 100,
          analysisResult,
        });
      } else {
        // Default: mark as completed (will be handled manually)
        await this.callbacks.updateJobStatus({
          jobId,
          status: 'completed',
          progress: 100,
          analysisResult,
        });
      }
    } catch (error) {
      console.error('Error processing file:', error);
      await this.callbacks.updateJobStatus({
        jobId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        progress: 0,
      });
    }
  }

  /**
   * Auto-file a document that meets the criteria
   */
  private async autoFileDocument(
    jobId: Id<"fileUploadQueue">,
    file: File,
    fileStorageId: Id<"_storage">,
    analysisResult: AnalysisResult
  ) {
    if (!this.callbacks) {
      throw new Error('Queue processor not initialized');
    }

    try {
      // Create document record
      const documentId = await this.callbacks.createDocument({
        fileStorageId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        summary: analysisResult.summary,
        fileTypeDetected: analysisResult.fileType,
        category: analysisResult.category,
        reasoning: analysisResult.reasoning,
        confidence: analysisResult.confidence,
        tokensUsed: analysisResult.tokensUsed,
        clientId: analysisResult.clientId ? (analysisResult.clientId as Id<"clients">) : undefined,
        clientName: analysisResult.clientName || undefined,
        projectId: analysisResult.projectId ? (analysisResult.projectId as Id<"projects">) : undefined,
        projectName: analysisResult.projectName || undefined,
        suggestedClientName: analysisResult.suggestedClientName || undefined,
        suggestedProjectName: analysisResult.suggestedProjectName || undefined,
        extractedData: analysisResult.extractedData || undefined,
        status: 'completed',
      });

      // Create enrichment suggestions if any
      if (analysisResult.enrichmentSuggestions && analysisResult.enrichmentSuggestions.length > 0) {
        for (const suggestion of analysisResult.enrichmentSuggestions) {
          try {
            let suggestionType: 'email' | 'phone' | 'address' | 'company' | 'contact' | 'date' | 'other' = 'other';
            
            if (suggestion.type === 'email') {
              suggestionType = 'email';
            } else if (suggestion.type === 'phone') {
              suggestionType = 'phone';
            } else if (suggestion.type === 'address') {
              suggestionType = 'address';
            } else {
              const typeStr = suggestion.type as string;
              if (typeStr === 'company' || typeStr === 'website') {
                suggestionType = 'company';
              } else if (typeStr === 'contactName' || typeStr === 'contact') {
                suggestionType = 'contact';
              } else if (typeStr === 'date') {
                suggestionType = 'date';
              }
            }

            if (this.callbacks.createEnrichment) {
              await this.callbacks.createEnrichment({
                type: suggestionType,
                field: suggestion.field,
                value: suggestion.value,
                source: suggestion.context || file.name,
                documentId: documentId,
                clientId: analysisResult.clientId ? (analysisResult.clientId as Id<"clients">) : undefined,
                projectId: analysisResult.projectId ? (analysisResult.projectId as Id<"projects">) : undefined,
                confidence: suggestion.confidence || 0.8,
              });
            }
          } catch (err) {
            console.error('Failed to create enrichment suggestion:', err);
          }
        }
      }

      // Trigger prospecting context extraction (non-blocking)
      if (analysisResult.clientId && this.callbacks.saveProspectingContext) {
        fetch('/api/extract-prospecting-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: documentId,
            clientId: analysisResult.clientId,
            projectId: analysisResult.projectId,
            fileName: file.name,
            analysisResult: analysisResult,
            textContent: '',
            clientName: analysisResult.clientName || null,
            projectName: analysisResult.projectName || null,
            clientHistory: '',
          }),
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (data.success && data.prospectingContext && this.callbacks?.saveProspectingContext) {
            // Sanitize and save prospecting context (similar to FileUpload component)
            const sanitizedRelationshipContext = data.prospectingContext.relationshipContext ? {
              sentiment: data.prospectingContext.relationshipContext.sentiment && 
                         data.prospectingContext.relationshipContext.sentiment.trim() !== '' &&
                         ['positive', 'neutral', 'negative'].includes(data.prospectingContext.relationshipContext.sentiment.toLowerCase())
                ? data.prospectingContext.relationshipContext.sentiment.toLowerCase() as 'positive' | 'neutral' | 'negative'
                : undefined,
              currentStage: data.prospectingContext.relationshipContext.currentStage || undefined,
              relationshipStrength: data.prospectingContext.relationshipContext.relationshipStrength || undefined,
              lastInteraction: data.prospectingContext.relationshipContext.lastInteraction || undefined,
            } : undefined;

            const sanitizedTimeline = data.prospectingContext.timeline ? {
              urgency: data.prospectingContext.timeline.urgency && 
                       ['high', 'medium', 'low'].includes(data.prospectingContext.timeline.urgency.toLowerCase())
                ? data.prospectingContext.timeline.urgency.toLowerCase() as 'high' | 'medium' | 'low'
                : undefined,
              deadlines: data.prospectingContext.timeline.deadlines || undefined,
              milestones: data.prospectingContext.timeline.milestones || undefined,
            } : undefined;

            const sanitizedFinancialContext = data.prospectingContext.financialContext ? {
              budgetMentioned: data.prospectingContext.financialContext.budgetMentioned ?? undefined,
              budgetRange: data.prospectingContext.financialContext.budgetRange || undefined,
              investmentLevel: data.prospectingContext.financialContext.investmentLevel || undefined,
              timeline: data.prospectingContext.financialContext.timeline || undefined,
            } : undefined;

            const sanitizedBusinessContext = data.prospectingContext.businessContext ? {
              industry: data.prospectingContext.businessContext.industry || undefined,
              companySize: data.prospectingContext.businessContext.companySize || undefined,
              growthIndicators: data.prospectingContext.businessContext.growthIndicators || undefined,
              challenges: data.prospectingContext.businessContext.challenges || undefined,
              goals: data.prospectingContext.businessContext.goals || undefined,
            } : undefined;

            const sanitizedCompetitiveMentions = data.prospectingContext.competitiveMentions || undefined;
            const sanitizedTemplateSnippets = data.prospectingContext.templateSnippets ? {
              opening: data.prospectingContext.templateSnippets.opening || undefined,
              valueProposition: data.prospectingContext.templateSnippets.valueProposition || undefined,
              callToAction: data.prospectingContext.templateSnippets.callToAction || undefined,
            } : undefined;

            this.callbacks?.saveProspectingContext?.({
              documentId: documentId,
              clientId: analysisResult.clientId ? (analysisResult.clientId as Id<"clients">) : null,
              projectId: analysisResult.projectId ? (analysisResult.projectId as Id<"projects">) : null,
              keyPoints: data.prospectingContext.keyPoints || [],
              painPoints: data.prospectingContext.painPoints || [],
              opportunities: data.prospectingContext.opportunities || [],
              decisionMakers: data.prospectingContext.decisionMakers || [],
              businessContext: sanitizedBusinessContext,
              financialContext: sanitizedFinancialContext,
              relationshipContext: sanitizedRelationshipContext,
              competitiveMentions: sanitizedCompetitiveMentions,
              timeline: sanitizedTimeline,
              templateSnippets: sanitizedTemplateSnippets,
              confidence: data.prospectingContext.confidence || 0,
              tokensUsed: data.prospectingContext.tokensUsed,
            });
          }
        })
        .catch(err => {
          console.error('Failed to extract prospecting context:', err);
        });
      }

      // Update job status to completed
      await this.callbacks.updateJobStatus({
        jobId,
        status: 'completed',
        progress: 100,
        documentId,
        analysisResult,
      });
    } catch (error) {
      console.error('Error auto-filing document:', error);
      await this.callbacks.updateJobStatus({
        jobId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to auto-file document',
        progress: 0,
      });
    }
  }

  /**
   * Analyze a file with custom instructions
   * Called after instructions are provided
   */
  async analyzeWithInstructions(
    jobId: Id<"fileUploadQueue">,
    fileStorageId: Id<"_storage">,
    customInstructions: string
  ): Promise<void> {
    if (!this.callbacks) {
      throw new Error('Queue processor not initialized');
    }

    // Find the job in queue to get the file
    let file: File | null = null;
    const queueJob = this.queue.find(job => job.jobId === jobId);
    
    if (queueJob) {
      file = queueJob.file;
    } else {
      // File not in queue - fetch from storage
      // Get job data to get fileName and fileType
      const jobData = await this.callbacks.getJob(jobId);
      if (!jobData || !jobData.fileStorageId) {
        throw new Error('Job not found or file storage ID missing');
      }

      // Get file URL from storage
      const fileUrl = await this.callbacks.getFileUrl(jobData.fileStorageId);
      
      if (!fileUrl) {
        throw new Error('Failed to get file URL from storage');
      }
      
      // Fetch the file from storage
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) {
        throw new Error('Failed to fetch file from storage');
      }

      // Convert blob to File object
      const blob = await fileResponse.blob();
      file = new File([blob], jobData.fileName, { type: jobData.fileType });
    }

    if (!file) {
      throw new Error('File object is missing');
    }

    try {
      await this.callbacks.updateJobStatus({
        jobId,
        status: 'analyzing',
        progress: 40,
      });

      // Analyze file with custom instructions
      console.log('[FileQueueProcessor] Analyzing with instructions:', customInstructions ? `"${customInstructions.substring(0, 100)}${customInstructions.length > 100 ? '...' : ''}"` : 'none');
      
      const analysisResult: AnalysisResult = await this.retryWithBackoff(async () => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('customInstructions', customInstructions);
        
        console.log('[FileQueueProcessor] Sending FormData with customInstructions:', customInstructions ? 'yes' : 'no');

        const analysisResponse = await fetch('/api/analyze-file', {
          method: 'POST',
          body: formData,
        });

        if (!analysisResponse.ok) {
          const errorData = await analysisResponse.json().catch(() => ({ error: `HTTP ${analysisResponse.status}` }));
          const error = new Error(errorData.error || `Failed to analyze file (${analysisResponse.status})`);
          (error as any).status = analysisResponse.status;
          throw error;
        }

        return await analysisResponse.json();
      }, 3, 2000);

      await this.callbacks.updateJobStatus({
        jobId,
        status: 'analyzing',
        progress: 70,
        analysisResult,
      });

      // Determine if auto-filing or needs confirmation
      if (shouldAutoFile(analysisResult)) {
        await this.autoFileDocument(jobId, file, fileStorageId, analysisResult);
      } else {
        // Mark as needing confirmation (user can review and file manually)
        await this.callbacks.updateJobStatus({
          jobId,
          status: 'needs_confirmation',
          progress: 100,
          analysisResult,
        });
      }
    } catch (error) {
      console.error('Error analyzing file with instructions:', error);
      await this.callbacks.updateJobStatus({
        jobId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to analyze file with instructions',
        progress: 0,
      });
    }
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Check if processing
   */
  isProcessing(): boolean {
    return this.processing;
  }
}

// Note: Processor instances should be created via useFileQueue hook
// This ensures proper initialization with Convex mutations

