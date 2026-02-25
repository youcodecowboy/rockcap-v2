"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { FileMetadata, AnalysisResult, SavedDocument } from '@/types';

// Re-export SavedDocument for backward compatibility
export type { SavedDocument };

// Document hooks
export function useDocuments(clientId?: Id<"clients">, projectId?: Id<"projects">, category?: string, status?: string) {
  const statusEnum = status as 'completed' | 'pending' | 'processing' | 'error' | undefined;
  return useQuery(api.documents.list, { clientId, projectId, category, status: statusEnum });
}

export function useDocument(id: Id<"documents"> | undefined) {
  return useQuery(api.documents.get, id ? { id } : "skip");
}

export function useDocumentsByClient(clientId: Id<"clients"> | undefined) {
  return useQuery(api.documents.getByClient, clientId ? { clientId } : "skip");
}

export function useDocumentsByProject(projectId: Id<"projects"> | undefined) {
  return useQuery(api.documents.getByProject, projectId ? { projectId } : "skip");
}

export function useUnfiledDocuments() {
  return useQuery(api.documents.getInternal);
}

export function useSearchDocuments(query: string, fileType?: string, category?: string) {
  return useQuery(api.documents.search, { query, fileType, category });
}

export function useUniqueFileTypes() {
  return useQuery(api.documents.getUniqueFileTypes);
}

export function useUniqueCategories() {
  return useQuery(api.documents.getUniqueCategories);
}

export function useCreateDocument() {
  return useMutation(api.documents.create);
}

export function useUpdateDocument() {
  return useMutation(api.documents.update);
}

export function useDeleteDocument() {
  return useMutation(api.documents.remove);
}

export function useGetFileUrl(storageId: Id<"_storage"> | undefined) {
  return useQuery(api.documents.getFileUrl, storageId ? { storageId } : "skip");
}

export function useUnclassifiedDocuments() {
  return useQuery(api.documents.getUnclassified);
}

export function useFolderStats() {
  return useQuery(api.documents.getFolderStats);
}

export function useUpdateDocumentCode() {
  return useMutation(api.documents.updateDocumentCode);
}

// Internal Documents hooks
export function useInternalDocuments(linkedClientId?: Id<"clients">) {
  return useQuery(api.internalDocuments.list, linkedClientId ? { linkedClientId } : {});
}

export function useInternalDocument(id: Id<"internalDocuments"> | undefined) {
  return useQuery(api.internalDocuments.get, id ? { id } : "skip");
}

export function useInternalDocumentsByClient(clientId: Id<"clients"> | undefined) {
  return useQuery(api.internalDocuments.getByClient, clientId ? { clientId } : "skip");
}

export function useInternalDocumentsByProject(projectId: Id<"projects"> | undefined) {
  return useQuery(api.internalDocuments.getByProject, projectId ? { projectId } : "skip");
}

export function useCreateInternalDocument() {
  return useMutation(api.internalDocuments.create);
}

export function useUpdateInternalDocument() {
  return useMutation(api.internalDocuments.update);
}

export function useUpdateInternalDocumentCode() {
  return useMutation(api.internalDocuments.updateDocumentCode);
}

export function useDeleteInternalDocument() {
  return useMutation(api.internalDocuments.remove);
}

export function useInternalDocumentsByFolder(folderId?: string) {
  return useQuery(api.internalDocuments.getByFolder, { folderId });
}

export function useInternalDocumentFolders() {
  return useQuery(api.internalDocuments.getFolders);
}

export function useUpdateInternalDocumentFolder() {
  return useMutation(api.internalDocuments.updateFolder);
}

export function useCreateInternalDocumentFolder() {
  return useMutation(api.internalDocuments.createFolder);
}

export function useDeleteInternalDocumentFolder() {
  return useMutation(api.internalDocuments.deleteFolder);
}

// =============================================================================
// DEPRECATED: Legacy plain functions (V3 era)
// =============================================================================
// Still exported because legacy pages (prospects/, dataAggregation) import them.
// They are no-ops returning empty data. New code must use the Convex hooks above.
// TODO: Remove once legacy pages are migrated to Convex hooks.

/** @deprecated Use useDocuments() hook */ export function getLibrary(): SavedDocument[] { return []; }
/** @deprecated Use useCreateDocument() hook */ export function saveDocument(_file: FileMetadata, _analysisResult: AnalysisResult, _fileContent?: string, _fileContentType?: string): SavedDocument { throw new Error("Deprecated"); }
/** @deprecated Use useDeleteDocument() hook */ export function deleteDocument(_id: string): void {}
/** @deprecated Use useDocument() hook */ export function getDocumentById(_id: string): SavedDocument | undefined { return undefined; }
/** @deprecated Use useSearchDocuments() hook */ export function searchLibrary(_query: string, _fileType?: string, _category?: string): SavedDocument[] { return []; }
/** @deprecated Use useUniqueFileTypes() hook */ export function getUniqueFileTypes(): string[] { return []; }
/** @deprecated Use useUniqueCategories() hook */ export function getUniqueCategories(): string[] { return []; }
/** @deprecated Use useDocumentsByClient() hook */ export function getDocumentsByClient(_clientId: string): SavedDocument[] { return []; }
/** @deprecated Use useDocumentsByProject() hook */ export function getDocumentsByProject(_projectId: string): SavedDocument[] { return []; }
/** @deprecated Use useInternalDocuments() hook */ export function getInternalDocuments(): SavedDocument[] { return []; }
/** @deprecated Use useUpdateDocument() hook */ export function updateDocumentClientProject(_documentId: string, _clientId: string | null, _projectId: string | null): void {}
/** @deprecated Use Convex file storage API */ export function getDocumentFileContent(_documentId: string): { content: string; contentType: string } | null { return null; }
/** @deprecated Use Convex file storage API */ export function getDocumentFileUrl(_documentId: string): string | null { return null; }
