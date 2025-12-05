"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useRef, useEffect, useMemo } from "react";
import { FileQueueProcessor, QueueProcessorCallbacks } from "./fileQueueProcessor";
import { useCreateDocument } from "./documentStorage";
import { useSaveProspectingContext } from "./prospectingStorage";
import { useCreateEnrichment } from "./clientStorage";
import { ConvexHttpClient } from "convex/browser";

/**
 * Hook for managing file upload queue
 * Provides queue state and functions to add/remove files
 */
export function useFileQueue() {
  const processorRef = useRef<FileQueueProcessor | null>(null);

  // Convex mutations
  const createJob = useMutation(api.fileQueue.createJob);
  const updateJobStatus = useMutation(api.fileQueue.updateJobStatus);
  const deleteJob = useMutation(api.fileQueue.deleteJob);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const createDocument = useCreateDocument();
  const saveProspectingContext = useSaveProspectingContext();
  const createEnrichment = useCreateEnrichment();

  // Convex queries
  const recentJobs = useQuery(
    api.fileQueue.getRecentJobs, 
    { includeRead: false }
  ) as any;
  const unreadCount = useQuery(api.fileQueue.getUnreadCount);
  const pendingJobs = useQuery(api.fileQueue.getPendingJobs);
  
  // Create a Convex HTTP client for queries (since we can't use hooks conditionally)
  const convexClient = useMemo(() => {
    if (typeof window !== 'undefined') {
      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      if (convexUrl) {
        return new ConvexHttpClient(convexUrl);
      }
    }
    return null;
  }, []);

  // Create callbacks object that's stable
  // Convex mutations are always available, so we can create callbacks immediately
  const callbacks = useMemo(() => {
    const callbacksObj: QueueProcessorCallbacks = {
      createJob: async (args: { fileName: string; fileSize: number; fileType: string; hasCustomInstructions?: boolean; forceExtraction?: boolean }) => {
        return await createJob(args) as Id<"fileUploadQueue">;
      },
      updateJobStatus: async (args: {
        jobId: Id<"fileUploadQueue">;
        status?: "pending" | "uploading" | "analyzing" | "completed" | "error" | "needs_confirmation";
        progress?: number;
        fileStorageId?: Id<"_storage">;
        analysisResult?: any;
        documentId?: Id<"documents">;
        error?: string;
        customInstructions?: string;
      }) => {
        return await updateJobStatus(args);
      },
      generateUploadUrl: async () => {
        return await generateUploadUrl();
      },
      getFileUrl: async (storageId: Id<"_storage">) => {
        if (!convexClient) {
          throw new Error('Convex client not initialized');
        }
        return await convexClient.query(api.fileQueue.getFileUrl, { storageId });
      },
      getJob: async (jobId: Id<"fileUploadQueue">) => {
        if (!convexClient) {
          throw new Error('Convex client not initialized');
        }
        return await convexClient.query(api.fileQueue.getJob, { jobId });
      },
      createDocument: async (args: any) => {
        return await createDocument(args);
      },
      saveProspectingContext: async (args: any) => {
        await saveProspectingContext(args);
      },
      createEnrichment: async (args: any) => {
        await createEnrichment(args);
      },
    };
    return callbacksObj;
  }, [createJob, updateJobStatus, generateUploadUrl, createDocument, saveProspectingContext, createEnrichment, convexClient]);

  // Initialize processor once callbacks are ready
  // Use a ref to ensure we only create one instance
  useEffect(() => {
    if (!processorRef.current) {
      processorRef.current = new FileQueueProcessor(callbacks);
    }
  }, [callbacks]);

  const processor = processorRef.current;
  const isReady = !!processor;

  return {
    // Queue operations
    addFile: async (file: File, hasCustomInstructions?: boolean, forceExtraction?: boolean) => {
      if (!isReady || !processor) {
        throw new Error("Queue processor not initialized. Please wait a moment and try again.");
      }
      return await processor.addFile(file, hasCustomInstructions, forceExtraction);
    },
    removeFile: async (jobId: Id<"fileUploadQueue">) => {
      if (!isReady || !processor) return false;
      
      // Remove from local queue
      const removed = processor.removeFile(jobId);
      
      // Also delete from Convex if it's an errored job or pending job
      // This ensures errored items are properly cleaned up
      try {
        await deleteJob({ jobId });
      } catch (error) {
        console.error('Error deleting job from Convex:', error);
        // Don't throw - local removal is still successful
      }
      
      return removed;
    },
    getQueueSize: () => {
      if (!isReady || !processor) return 0;
      return processor.getQueueSize();
    },
    isProcessing: () => {
      if (!isReady || !processor) return false;
      return processor.isProcessing();
    },
    analyzeWithInstructions: async (
      jobId: Id<"fileUploadQueue">,
      fileStorageId: Id<"_storage">,
      customInstructions: string
    ) => {
      if (!isReady || !processor) {
        throw new Error("Queue processor not initialized. Please wait a moment and try again.");
      }
      return await processor.analyzeWithInstructions(jobId, fileStorageId, customInstructions);
    },
    // Queue state
    recentJobs: recentJobs || [],
    unreadCount: unreadCount || 0,
    pendingJobs: pendingJobs || [],
    isReady, // Expose readiness state
  };
}

