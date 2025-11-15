"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ProspectingContext } from '@/types';

// Prospecting context hooks
export function useProspectingContext(documentId: Id<"documents"> | undefined) {
  return useQuery(api.prospecting.getByDocument, documentId ? { documentId } : "skip");
}

export function useProspectingContextsByClient(clientId: Id<"clients"> | undefined) {
  return useQuery(api.prospecting.getByClient, clientId ? { clientId } : "skip");
}

export function useProspectingContextsByProject(projectId: Id<"projects"> | undefined) {
  return useQuery(api.prospecting.getByProject, projectId ? { projectId } : "skip");
}

export function useSaveProspectingContext() {
  return useMutation(api.prospecting.save);
}

export function useDeleteProspectingContext() {
  return useMutation(api.prospecting.remove);
}

// Legacy compatibility functions
export function saveProspectingContext(context: ProspectingContext): void {
  console.warn("saveProspectingContext() is deprecated. Use useSaveProspectingContext() hook instead.");
}

export function getProspectingContext(documentId: string): ProspectingContext | null {
  console.warn("getProspectingContext() is deprecated. Use useProspectingContext() hook instead.");
  return null;
}

export function getProspectingContextByClient(clientId: string): ProspectingContext[] {
  console.warn("getProspectingContextByClient() is deprecated. Use useProspectingContextsByClient() hook instead.");
  return [];
}

export function getProspectingContextByProject(projectId: string): ProspectingContext[] {
  console.warn("getProspectingContextByProject() is deprecated. Use useProspectingContextsByProject() hook instead.");
  return [];
}

export function deleteProspectingContext(documentId: string): void {
  console.warn("deleteProspectingContext() is deprecated. Use useDeleteProspectingContext() hook instead.");
}
