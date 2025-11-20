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

// Legacy compatibility functions
export function getLibrary(): SavedDocument[] {
  console.warn("getLibrary() is deprecated. Use useDocuments() hook instead.");
  return [];
}

export function saveDocument(
  file: FileMetadata,
  analysisResult: AnalysisResult,
  fileContent?: string,
  fileContentType?: string
): SavedDocument {
  console.warn("saveDocument() is deprecated. Use useCreateDocument() hook instead.");
  throw new Error("saveDocument() is deprecated. Use useCreateDocument() hook in a React component.");
}

export function deleteDocument(id: string): void {
  console.warn("deleteDocument() is deprecated. Use useDeleteDocument() hook instead.");
}

export function getDocumentById(id: string): SavedDocument | undefined {
  console.warn("getDocumentById() is deprecated. Use useDocument() hook instead.");
  return undefined;
}

export function searchLibrary(query: string, fileType?: string, category?: string): SavedDocument[] {
  console.warn("searchLibrary() is deprecated. Use useSearchDocuments() hook instead.");
  return [];
}

export function getUniqueFileTypes(): string[] {
  console.warn("getUniqueFileTypes() is deprecated. Use useUniqueFileTypes() hook instead.");
  return [];
}

export function getUniqueCategories(): string[] {
  console.warn("getUniqueCategories() is deprecated. Use useUniqueCategories() hook instead.");
  return [];
}

export function getDocumentsByClient(clientId: string): SavedDocument[] {
  console.warn("getDocumentsByClient() is deprecated. Use useDocumentsByClient() hook instead.");
  return [];
}

export function getDocumentsByProject(projectId: string): SavedDocument[] {
  console.warn("getDocumentsByProject() is deprecated. Use useDocumentsByProject() hook instead.");
  return [];
}

export function getInternalDocuments(): SavedDocument[] {
  console.warn("getInternalDocuments() is deprecated. Use useInternalDocuments() hook instead.");
  return [];
}

export function updateDocumentClientProject(
  documentId: string,
  clientId: string | null,
  projectId: string | null
): void {
  console.warn("updateDocumentClientProject() is deprecated. Use useUpdateDocument() hook instead.");
}

export function getDocumentFileContent(documentId: string): { content: string; contentType: string } | null {
  console.warn("getDocumentFileContent() is deprecated. Use Convex file storage API directly.");
  return null;
}

export function getDocumentFileUrl(documentId: string): string | null {
  console.warn("getDocumentFileUrl() is deprecated. Use Convex file storage API directly.");
  return null;
}
