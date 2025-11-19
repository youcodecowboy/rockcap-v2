"use client";

// Prospect storage is now merged into clientStorage
// Prospects are just clients with status="prospect"
// Use useClientsByStatus("prospect") instead

import { useClientsByStatus } from './clientStorage';

export function useProspects() {
  return useClientsByStatus("prospect");
}

// Legacy compatibility - these will redirect to client hooks
export function getProspects() {
  console.warn("getProspects() is deprecated. Use useProspects() hook instead.");
  return [];
}

export function getProspectById(id: string) {
  console.warn("getProspectById() is deprecated. Use useClient() hook instead.");
  return undefined;
}

export function updateProspect(id: string, updates: any) {
  console.warn("updateProspect() is deprecated. Use useUpdateClient() hook instead.");
}

export function deleteProspect(id: string) {
  console.warn("deleteProspect() is deprecated. Use useDeleteClient() hook instead.");
}

// Convert prospect (client with status="prospect") to active client
export function convertProspectToClient(prospectId: string): string {
  // Prospects are just clients, so we just return the same ID
  // The actual conversion (status change) should be done via updateClient mutation
  return prospectId;
}
