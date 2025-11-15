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

export function useClientsByStatus(status: Client['status']) {
  return useQuery(api.clients.getByStatus, { status });
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

// Legacy compatibility functions (for gradual migration)
// These will be removed once all components are migrated
export function getClients(): Client[] {
  console.warn("getClients() is deprecated. Use useClients() hook instead.");
  return [];
}

export function addClient(name: string, additionalData?: Partial<Client>): Client {
  console.warn("addClient() is deprecated. Use useCreateClient() hook instead.");
  throw new Error("addClient() is deprecated. Use useCreateClient() hook in a React component.");
}

export function getClientById(id: string): Client | undefined {
  console.warn("getClientById() is deprecated. Use useClient() hook instead.");
  return undefined;
}

export function deleteClient(id: string): void {
  console.warn("deleteClient() is deprecated. Use useDeleteClient() hook instead.");
}

export function getProjects(): Project[] {
  console.warn("getProjects() is deprecated. Use useProjects() hook instead.");
  return [];
}

export function getProjectsByClient(clientId: string): Project[] {
  console.warn("getProjectsByClient() is deprecated. Use useProjectsByClient() hook instead.");
  return [];
}

export function addProject(clientId: string, name: string): Project {
  console.warn("addProject() is deprecated. Use useCreateProject() hook instead.");
  throw new Error("addProject() is deprecated. Use useCreateProject() hook in a React component.");
}

export function getProjectById(id: string): Project | undefined {
  console.warn("getProjectById() is deprecated. Use useProject() hook instead.");
  return undefined;
}

export function deleteProject(id: string): void {
  console.warn("deleteProject() is deprecated. Use useDeleteProject() hook instead.");
}

export function updateClient(clientId: string, updates: Partial<Client>): Client | null {
  console.warn("updateClient() is deprecated. Use useUpdateClient() hook instead.");
  return null;
}

export function updateProject(projectId: string, updates: Partial<Project>): Project | null {
  console.warn("updateProject() is deprecated. Use useUpdateProject() hook instead.");
  return null;
}

export function getContactsByClient(clientId: string): Contact[] {
  console.warn("getContactsByClient() is deprecated. Use useContactsByClient() hook instead.");
  return [];
}

export function addContactToClient(clientId: string, contact: Omit<Contact, 'id' | 'createdAt'>): Contact {
  console.warn("addContactToClient() is deprecated. Use useCreateContact() hook instead.");
  throw new Error("addContactToClient() is deprecated. Use useCreateContact() hook in a React component.");
}

export function getEnrichmentSuggestions(clientId: string): EnrichmentSuggestion[] {
  console.warn("getEnrichmentSuggestions() is deprecated. Use useEnrichmentByClient() hook instead.");
  return [];
}

export function addEnrichmentSuggestion(clientId: string, suggestion: Omit<EnrichmentSuggestion, 'id' | 'createdAt' | 'status'>): EnrichmentSuggestion {
  console.warn("addEnrichmentSuggestion() is deprecated. Use useCreateEnrichment() hook instead.");
  throw new Error("addEnrichmentSuggestion() is deprecated. Use useCreateEnrichment() hook in a React component.");
}

// Re-export all the project contact and enrichment functions for compatibility
export function getContactsByProject(projectId: string): Contact[] {
  console.warn("getContactsByProject() is deprecated. Use useContactsByProject() hook instead.");
  return [];
}

export function addContactToProject(projectId: string, contact: Omit<Contact, 'id' | 'createdAt'>): Contact {
  console.warn("addContactToProject() is deprecated. Use useCreateContact() hook instead.");
  throw new Error("addContactToProject() is deprecated. Use useCreateContact() hook in a React component.");
}

export function getProjectEnrichmentSuggestions(projectId: string): EnrichmentSuggestion[] {
  console.warn("getProjectEnrichmentSuggestions() is deprecated. Use useEnrichmentByProject() hook instead.");
  return [];
}

export function addProjectEnrichmentSuggestion(projectId: string, suggestion: Omit<EnrichmentSuggestion, 'id' | 'createdAt' | 'status'>): EnrichmentSuggestion {
  console.warn("addProjectEnrichmentSuggestion() is deprecated. Use useCreateEnrichment() hook instead.");
  throw new Error("addProjectEnrichmentSuggestion() is deprecated. Use useCreateEnrichment() hook in a React component.");
}

export function acceptEnrichmentSuggestion(clientId: string, suggestionId: string): boolean {
  console.warn("acceptEnrichmentSuggestion() is deprecated. Use useAcceptEnrichment() hook instead.");
  return false;
}

export function rejectEnrichmentSuggestion(clientId: string, suggestionId: string): boolean {
  console.warn("rejectEnrichmentSuggestion() is deprecated. Use useRejectEnrichment() hook instead.");
  return false;
}

export function getClientStats(clientId: string) {
  console.warn("getClientStats() is deprecated. Use useClientStats() hook instead.");
  return { totalProjects: 0, activeProjects: 0, totalDocuments: 0 };
}

export function getProjectStats(projectId: string) {
  console.warn("getProjectStats() is deprecated. Use useProjectStats() hook instead.");
  return { totalDocuments: 0 };
}

// Keep other utility functions that don't need Convex
export function clientExists(name: string): boolean {
  console.warn("clientExists() is deprecated. Check clients in component using useClients() hook.");
  return false;
}

export function projectExists(clientId: string, name: string): boolean {
  console.warn("projectExists() is deprecated. Check projects in component using useProjects() hook.");
  return false;
}

export function getClientsByLifecycleStage(lifecycleStage: Client['lifecycleStage']): Client[] {
  console.warn("getClientsByLifecycleStage() is deprecated. Filter clients in component using useClients() hook.");
  return [];
}

export function setProjectStatus(projectId: string, status: Project['status']): Project | null {
  console.warn("setProjectStatus() is deprecated. Use useUpdateProject() hook instead.");
  return null;
}

export function updateContact(clientId: string, contactId: string, updates: Partial<Contact>): Contact | null {
  console.warn("updateContact() is deprecated. Use useUpdateContact() hook instead.");
  return null;
}

export function deleteContact(clientId: string, contactId: string): void {
  console.warn("deleteContact() is deprecated. Use useDeleteContact() hook instead.");
}

export function updateProjectContact(projectId: string, contactId: string, updates: Partial<Contact>): Contact | null {
  console.warn("updateProjectContact() is deprecated. Use useUpdateContact() hook instead.");
  return null;
}

export function deleteProjectContact(projectId: string, contactId: string): void {
  console.warn("deleteProjectContact() is deprecated. Use useDeleteContact() hook instead.");
}

export function acceptProjectEnrichmentSuggestion(projectId: string, suggestionId: string): boolean {
  console.warn("acceptProjectEnrichmentSuggestion() is deprecated. Use useAcceptEnrichment() hook instead.");
  return false;
}

export function rejectProjectEnrichmentSuggestion(projectId: string, suggestionId: string): boolean {
  console.warn("rejectProjectEnrichmentSuggestion() is deprecated. Use useRejectEnrichment() hook instead.");
  return false;
}

export function updateEnrichmentDocumentId(clientId: string, oldDocumentId: string, newDocumentId: string): void {
  console.warn("updateEnrichmentDocumentId() is deprecated. Use useUpdateEnrichmentDocumentId() hook instead.");
}

export function updateProjectEnrichmentDocumentId(projectId: string, oldDocumentId: string, newDocumentId: string): void {
  console.warn("updateProjectEnrichmentDocumentId() is deprecated. Use useUpdateEnrichmentDocumentId() hook instead.");
}

export function getProjectByName(clientId: string, name: string): Project | undefined {
  console.warn("getProjectByName() is deprecated. Filter projects in component using useProjects() hook.");
  return undefined;
}
