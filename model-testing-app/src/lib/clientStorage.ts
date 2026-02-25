"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Client, Project, Contact, EnrichmentSuggestion } from '@/types';

// Client hooks
export function useClients(status?: Client['status'], type?: string) {
  return useQuery(api.clients.list, { status, type });
}

export function useClient(id: Id<"clients"> | undefined) {
  return useQuery(api.clients.get, id ? { id } : "skip");
}

export function useClientsByStatus(status: Client['status'] | undefined) {
  return useQuery(api.clients.getByStatus, status ? { status } : "skip");
}

export function useClientsByType(type: string) {
  return useQuery(api.clients.getByType, { type });
}

export function useCreateClient() {
  return useMutation(api.clients.create);
}

export function useUpdateClient() {
  return useMutation(api.clients.update);
}

export function useDeleteClient() {
  return useMutation(api.clients.remove);
}

export function useClientStats(clientId: Id<"clients"> | undefined) {
  return useQuery(api.clients.getStats, clientId ? { clientId } : "skip");
}

// Project hooks
export function useProjects(clientId?: Id<"clients">, status?: Project['status']) {
  return useQuery(api.projects.list, { clientId, status });
}

export function useProject(id: Id<"projects"> | undefined) {
  return useQuery(api.projects.get, id ? { id } : "skip");
}

export function useProjectsByClient(clientId: Id<"clients"> | undefined) {
  return useQuery(api.projects.getByClient, clientId ? { clientId } : "skip");
}

export function useCreateProject() {
  return useMutation(api.projects.create);
}

export function useUpdateProject() {
  return useMutation(api.projects.update);
}

export function useDeleteProject() {
  return useMutation(api.projects.remove);
}

export function useProjectStats(projectId: Id<"projects"> | undefined) {
  return useQuery(api.projects.getStats, projectId ? { projectId } : "skip");
}

// Contact hooks
export function useContactsByClient(clientId: Id<"clients"> | undefined) {
  return useQuery(api.contacts.getByClient, clientId ? { clientId } : "skip");
}

export function useContactsByProject(projectId: Id<"projects"> | undefined) {
  return useQuery(api.contacts.getByProject, projectId ? { projectId } : "skip");
}

export function useCreateContact() {
  return useMutation(api.contacts.create);
}

export function useUpdateContact() {
  return useMutation(api.contacts.update);
}

export function useDeleteContact() {
  return useMutation(api.contacts.remove);
}

// Enrichment hooks
export function useEnrichmentByClient(clientId: Id<"clients"> | undefined) {
  return useQuery(api.enrichment.getByClient, clientId ? { clientId } : "skip");
}

export function useEnrichmentByProject(projectId: Id<"projects"> | undefined) {
  return useQuery(api.enrichment.getByProject, projectId ? { projectId } : "skip");
}

export function useEnrichmentByDocument(documentId: Id<"documents"> | undefined) {
  return useQuery(api.enrichment.getByDocument, documentId ? { documentId } : "skip");
}

export function usePendingEnrichment(clientId?: Id<"clients">, projectId?: Id<"projects">) {
  return useQuery(api.enrichment.getPending, { clientId, projectId });
}

export function useCreateEnrichment() {
  return useMutation(api.enrichment.create);
}

export function useAcceptEnrichment() {
  return useMutation(api.enrichment.accept);
}

export function useRejectEnrichment() {
  return useMutation(api.enrichment.reject);
}

export function useSkipEnrichment() {
  return useMutation(api.enrichment.skip);
}

// =============================================================================
// DEPRECATED: Legacy plain functions (V3 era)
// =============================================================================
// Still exported because legacy pages (prospects/, ClientManager, demoData,
// dataAggregation) import them. They are no-ops returning empty data.
// New code must use the Convex hooks above.
// TODO: Remove once legacy pages are migrated to Convex hooks.

/** @deprecated Use useClients() hook */ export function getClients(): Client[] { return []; }
/** @deprecated Use useCreateClient() hook */ export function addClient(_name: string, _data?: Partial<Client>): Client { throw new Error("Deprecated"); }
/** @deprecated Use useClient() hook */ export function getClientById(_id: string): Client | undefined { return undefined; }
/** @deprecated Use useDeleteClient() hook */ export function deleteClient(_id: string): void {}
/** @deprecated Use useProjects() hook */ export function getProjects(): Project[] { return []; }
/** @deprecated Use useProjectsByClient() hook */ export function getProjectsByClient(_clientId: string): Project[] { return []; }
/** @deprecated Use useCreateProject() hook */ export function addProject(_clientId: string, _name: string): Project { throw new Error("Deprecated"); }
/** @deprecated Use useProject() hook */ export function getProjectById(_id: string): Project | undefined { return undefined; }
/** @deprecated Use useDeleteProject() hook */ export function deleteProject(_id: string): void {}
/** @deprecated Use useUpdateClient() hook */ export function updateClient(_clientId: string, _updates: Partial<Client>): Client | null { return null; }
/** @deprecated Use useUpdateProject() hook */ export function updateProject(_projectId: string, _updates: Partial<Project>): Project | null { return null; }
/** @deprecated Use useContactsByClient() hook */ export function getContactsByClient(_clientId: string): Contact[] { return []; }
/** @deprecated Use useCreateContact() hook */ export function addContactToClient(_clientId: string, _contact: Omit<Contact, 'id' | 'createdAt'>): Contact { throw new Error("Deprecated"); }
/** @deprecated Use useEnrichmentByClient() hook */ export function getEnrichmentSuggestions(_clientId: string): EnrichmentSuggestion[] { return []; }
/** @deprecated Use useCreateEnrichment() hook */ export function addEnrichmentSuggestion(_clientId: string, _suggestion: Omit<EnrichmentSuggestion, 'id' | 'createdAt' | 'status'>): EnrichmentSuggestion { throw new Error("Deprecated"); }
/** @deprecated Use useContactsByProject() hook */ export function getContactsByProject(_projectId: string): Contact[] { return []; }
/** @deprecated Use useCreateContact() hook */ export function addContactToProject(_projectId: string, _contact: Omit<Contact, 'id' | 'createdAt'>): Contact { throw new Error("Deprecated"); }
/** @deprecated Use useEnrichmentByProject() hook */ export function getProjectEnrichmentSuggestions(_projectId: string): EnrichmentSuggestion[] { return []; }
/** @deprecated Use useCreateEnrichment() hook */ export function addProjectEnrichmentSuggestion(_projectId: string, _suggestion: Omit<EnrichmentSuggestion, 'id' | 'createdAt' | 'status'>): EnrichmentSuggestion { throw new Error("Deprecated"); }
/** @deprecated Use useAcceptEnrichment() hook */ export function acceptEnrichmentSuggestion(_clientId: string, _suggestionId: string): boolean { return false; }
/** @deprecated Use useRejectEnrichment() hook */ export function rejectEnrichmentSuggestion(_clientId: string, _suggestionId: string): boolean { return false; }
/** @deprecated Use useClientStats() hook */ export function getClientStats(_clientId: string) { return { totalProjects: 0, activeProjects: 0, totalDocuments: 0 }; }
/** @deprecated Use useProjectStats() hook */ export function getProjectStats(_projectId: string) { return { totalDocuments: 0 }; }
/** @deprecated Use useClients() hook */ export function clientExists(_name: string): boolean { return false; }
/** @deprecated Use useProjects() hook */ export function projectExists(_clientId: string, _name: string): boolean { return false; }
/** @deprecated Use useClients() hook */ export function getClientsByLifecycleStage(_lifecycleStage: string): Client[] { return []; }
/** @deprecated Use useUpdateProject() hook */ export function setProjectStatus(_projectId: string, _status: Project['status']): Project | null { return null; }
/** @deprecated Use useUpdateContact() hook */ export function updateContact(_clientId: string, _contactId: string, _updates: Partial<Contact>): Contact | null { return null; }
/** @deprecated Use useDeleteContact() hook */ export function deleteContact(_clientId: string, _contactId: string): void {}
/** @deprecated Use useUpdateContact() hook */ export function updateProjectContact(_projectId: string, _contactId: string, _updates: Partial<Contact>): Contact | null { return null; }
/** @deprecated Use useDeleteContact() hook */ export function deleteProjectContact(_projectId: string, _contactId: string): void {}
/** @deprecated Use useAcceptEnrichment() hook */ export function acceptProjectEnrichmentSuggestion(_projectId: string, _suggestionId: string): boolean { return false; }
/** @deprecated Use useRejectEnrichment() hook */ export function rejectProjectEnrichmentSuggestion(_projectId: string, _suggestionId: string): boolean { return false; }
/** @deprecated */ export function updateEnrichmentDocumentId(_clientId: string, _oldDocumentId: string, _newDocumentId: string): void {}
/** @deprecated */ export function updateProjectEnrichmentDocumentId(_projectId: string, _oldDocumentId: string, _newDocumentId: string): void {}
/** @deprecated Use useProjects() hook */ export function getProjectByName(_clientId: string, _name: string): Project | undefined { return undefined; }
