"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ProspectingEmail } from '@/types';

// Email hooks
export function useEmails(prospectId?: Id<"clients">, clientId?: Id<"clients">, status?: ProspectingEmail['status']) {
  return useQuery(api.emails.list, { prospectId, clientId, status });
}

export function useEmail(id: Id<"prospectingEmails"> | undefined) {
  return useQuery(api.emails.get, id ? { id } : "skip");
}

export function useEmailDrafts(prospectId?: Id<"clients">) {
  return useQuery(api.emails.getDrafts, { prospectId });
}

export function useEmailsByProspect(prospectId: Id<"clients"> | undefined) {
  return useQuery(api.emails.getByProspect, prospectId ? { prospectId } : "skip");
}

export function useEmailsByClient(clientId: Id<"clients"> | undefined) {
  return useQuery(api.emails.getByClient, clientId ? { clientId } : "skip");
}

export function useCreateEmail() {
  return useMutation(api.emails.create);
}

export function useUpdateEmail() {
  return useMutation(api.emails.update);
}

export function useApproveEmail() {
  return useMutation(api.emails.approve);
}

export function useDeleteEmail() {
  return useMutation(api.emails.remove);
}

// Legacy compatibility functions
export function createEmailDraft(
  prospectId: string | undefined,
  clientId: string | undefined,
  templateId: string | undefined,
  enrichmentData?: {
    keyPoints?: string[];
    painPoints?: string[];
    opportunities?: string[];
  }
): ProspectingEmail {
  console.warn("createEmailDraft() is deprecated. Use useCreateEmail() hook instead.");
  throw new Error("createEmailDraft() is deprecated. Use useCreateEmail() hook in a React component.");
}

export function getEmailDrafts(): ProspectingEmail[] {
  console.warn("getEmailDrafts() is deprecated. Use useEmailDrafts() hook instead.");
  return [];
}

export function getAllEmails(): ProspectingEmail[] {
  console.warn("getAllEmails() is deprecated. Use useEmails() hook instead.");
  return [];
}

export function getEmailDraftsByProspect(prospectId: string): ProspectingEmail[] {
  console.warn("getEmailDraftsByProspect() is deprecated. Use useEmailDrafts() hook instead.");
  return [];
}

export function getEmailsByProspect(prospectId: string): ProspectingEmail[] {
  console.warn("getEmailsByProspect() is deprecated. Use useEmailsByProspect() hook instead.");
  return [];
}

export function getEmailsByClient(clientId: string): ProspectingEmail[] {
  console.warn("getEmailsByClient() is deprecated. Use useEmailsByClient() hook instead.");
  return [];
}

export function getEmailById(id: string): ProspectingEmail | null {
  console.warn("getEmailById() is deprecated. Use useEmail() hook instead.");
  return null;
}

export function updateEmailDraft(id: string, data: Partial<ProspectingEmail>): void {
  console.warn("updateEmailDraft() is deprecated. Use useUpdateEmail() hook instead.");
}

export function approveEmailDraft(id: string): void {
  console.warn("approveEmailDraft() is deprecated. Use useApproveEmail() hook instead.");
}

export function deleteEmail(id: string): void {
  console.warn("deleteEmail() is deprecated. Use useDeleteEmail() hook instead.");
}
