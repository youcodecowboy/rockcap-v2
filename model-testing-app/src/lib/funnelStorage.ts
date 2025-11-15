"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { EmailFunnel } from '@/types';

// Funnel hooks
export function useFunnels(prospectType?: EmailFunnel['prospectType'], activeOnly?: boolean) {
  return useQuery(api.funnels.list, { prospectType, activeOnly });
}

export function useFunnel(id: Id<"emailFunnels"> | undefined) {
  return useQuery(api.funnels.get, id ? { id } : "skip");
}

export function useFunnelsByProspectType(prospectType: EmailFunnel['prospectType']) {
  return useQuery(api.funnels.getByProspectType, { prospectType });
}

export function useCreateFunnel() {
  return useMutation(api.funnels.create);
}

export function useUpdateFunnel() {
  return useMutation(api.funnels.update);
}

export function useDeleteFunnel() {
  return useMutation(api.funnels.remove);
}

// Legacy compatibility functions
export function getFunnels(): EmailFunnel[] {
  console.warn("getFunnels() is deprecated. Use useFunnels() hook instead.");
  return [];
}

export function getAllFunnels(): EmailFunnel[] {
  console.warn("getAllFunnels() is deprecated. Use useFunnels() hook with activeOnly=false instead.");
  return [];
}

export function getFunnelsByType(prospectType: EmailFunnel['prospectType']): EmailFunnel[] {
  console.warn("getFunnelsByType() is deprecated. Use useFunnelsByProspectType() hook instead.");
  return [];
}

export function getFunnelById(id: string): EmailFunnel | null {
  console.warn("getFunnelById() is deprecated. Use useFunnel() hook instead.");
  return null;
}

export function saveFunnel(funnel: EmailFunnel): void {
  console.warn("saveFunnel() is deprecated. Use useCreateFunnel() or useUpdateFunnel() hook instead.");
}

export function createFunnel(data: Omit<EmailFunnel, 'id' | 'createdAt' | 'updatedAt'>): EmailFunnel {
  console.warn("createFunnel() is deprecated. Use useCreateFunnel() hook instead.");
  throw new Error("createFunnel() is deprecated. Use useCreateFunnel() hook in a React component.");
}

export function deleteFunnel(id: string): void {
  console.warn("deleteFunnel() is deprecated. Use useDeleteFunnel() hook instead.");
}
