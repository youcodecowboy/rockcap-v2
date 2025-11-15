"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { EmailTemplate } from '@/types';

// Template hooks
export function useTemplates(category?: EmailTemplate['category'], activeOnly?: boolean) {
  return useQuery(api.templates.list, { category, activeOnly });
}

export function useTemplate(id: Id<"emailTemplates"> | undefined) {
  return useQuery(api.templates.get, id ? { id } : "skip");
}

export function useTemplatesByCategory(category: EmailTemplate['category']) {
  return useQuery(api.templates.getByCategory, { category });
}

export function useCreateTemplate() {
  return useMutation(api.templates.create);
}

export function useUpdateTemplate() {
  return useMutation(api.templates.update);
}

export function useDeleteTemplate() {
  return useMutation(api.templates.remove);
}

// Legacy compatibility functions
export function getTemplates(): EmailTemplate[] {
  console.warn("getTemplates() is deprecated. Use useTemplates() hook instead.");
  return [];
}

export function getAllTemplates(): EmailTemplate[] {
  console.warn("getAllTemplates() is deprecated. Use useTemplates() hook with activeOnly=false instead.");
  return [];
}

export function getTemplateById(id: string): EmailTemplate | null {
  console.warn("getTemplateById() is deprecated. Use useTemplate() hook instead.");
  return null;
}

export function getTemplatesByCategory(category: EmailTemplate['category']): EmailTemplate[] {
  console.warn("getTemplatesByCategory() is deprecated. Use useTemplatesByCategory() hook instead.");
  return [];
}

export function saveTemplate(template: EmailTemplate): void {
  console.warn("saveTemplate() is deprecated. Use useCreateTemplate() or useUpdateTemplate() hook instead.");
}

export function deleteTemplate(id: string): void {
  console.warn("deleteTemplate() is deprecated. Use useDeleteTemplate() hook instead.");
}
