"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useRef, useEffect, useMemo } from "react";
import { FileQueueProcessor, QueueProcessorCallbacks } from "./fileQueueProcessor";
import { useCreateDocument } from "./documentStorage";
import { useSaveProspectingContext } from "./prospectingStorage";
import { useCreateEnrichment } from "./clientStorage";

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
  const recentJobs = useQuery(api.fileQueue.getRecentJobs, { includeRead: false });
  const unreadCount = useQuery(api.fileQueue.getUnreadCount);
  const pendingJobs = useQuery(api.fileQueue.getPendingJobs);

  // Create callbacks object that's stable
  // Convex mutations are always available, so we can create callbacks immediately
  const callbacks = useMemo<QueueProcessorCallbacks>(() => {
    return {
      createJob: async (args) => {
        return await createJob(args);
      },
      updateJobStatus: async (args) => {
        return await updateJobStatus(args);
      },
      generateUploadUrl: async () => {
        return await generateUploadUrl();
      },
      createDocument: async (args) => {
        return await createDocument(args);
      },
      saveProspectingContext: async (args) => {
        return await saveProspectingContext(args);
      },
      createEnrichment: async (args) => {
        return await createEnrichment(args);
      },
    };
  }, [createJob, updateJobStatus, generateUploadUrl, createDocument, saveProspectingContext, createEnrichment]);

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
    addFile: async (file: File) => {
      if (!isReady || !processor) {
        throw new Error("Queue processor not initialized. Please wait a moment and try again.");
      }
      return await processor.addFile(file);
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
    // Queue state
    recentJobs: recentJobs || [],
    unreadCount: unreadCount || 0,
    pendingJobs: pendingJobs || [],
    isReady, // Expose readiness state
  };
}

