/**
 * Shared Validation Helpers
 *
 * Moved from chatTools.ts — used by the tool executor for
 * parameter validation before calling Convex.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

// ---------------------------------------------------------------------------
// ISO Date validation
// ---------------------------------------------------------------------------

export function validateISODate(
  dateString: string
): { valid: boolean; error?: string; date?: Date } {
  if (!dateString || typeof dateString !== "string") {
    return { valid: false, error: "Date is required and must be a string" };
  }

  // Check for shell command syntax (like $(date +'%Y-%m-%dT15:00:00Z'))
  if (dateString.includes("$(") || dateString.includes("date +")) {
    return {
      valid: false,
      error:
        "Invalid date format: shell command syntax detected. Use ISO 8601 format (e.g., 2025-11-20T15:00:00Z)",
    };
  }

  // Try to parse as ISO date
  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    return {
      valid: false,
      error: `Invalid date format: "${dateString}". Use ISO 8601 format (e.g., 2025-11-20T15:00:00Z)`,
    };
  }

  // Check if it's a valid ISO string format (more lenient - allow various ISO formats)
  const isoRegex =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$/;
  if (!isoRegex.test(dateString)) {
    const parsedDate = new Date(dateString);
    if (!isNaN(parsedDate.getTime())) {
      return { valid: true, date: parsedDate };
    }
    return {
      valid: false,
      error: `Invalid ISO timestamp format: "${dateString}". Use format: YYYY-MM-DDTHH:mm:ssZ`,
    };
  }

  return { valid: true, date };
}

// ---------------------------------------------------------------------------
// Client name search (fuzzy matching)
// ---------------------------------------------------------------------------

export async function searchClientByName(
  clientName: string,
  client: ConvexHttpClient
): Promise<{ found: boolean; clientId?: Id<"clients">; matches?: any[] }> {
  if (!clientName || typeof clientName !== "string") {
    return { found: false };
  }

  try {
    const allClients = await client.query(api.clients.list, {});
    const normalizedSearch = clientName.toLowerCase().trim();

    // Try exact match first
    const exactMatch = allClients.find(
      (c: any) =>
        c.name?.toLowerCase() === normalizedSearch ||
        c.companyName?.toLowerCase() === normalizedSearch
    );

    if (exactMatch) {
      return { found: true, clientId: exactMatch._id };
    }

    // Try partial match
    const partialMatches = allClients.filter(
      (c: any) =>
        c.name?.toLowerCase().includes(normalizedSearch) ||
        c.companyName?.toLowerCase().includes(normalizedSearch) ||
        normalizedSearch.includes(c.name?.toLowerCase() || "") ||
        normalizedSearch.includes(c.companyName?.toLowerCase() || "")
    );

    if (partialMatches.length === 1) {
      return {
        found: true,
        clientId: partialMatches[0]._id,
        matches: partialMatches,
      };
    }

    if (partialMatches.length > 1) {
      return { found: false, matches: partialMatches };
    }

    return { found: false };
  } catch (error) {
    console.error("Error searching for client:", error);
    return { found: false };
  }
}

// ---------------------------------------------------------------------------
// Resolve a clientId param that might be a Convex ID or a client name
// ---------------------------------------------------------------------------

export async function resolveClientId(
  clientIdOrName: string | undefined,
  fallbackText: string | undefined,
  client: ConvexHttpClient
): Promise<Id<"clients"> | undefined> {
  if (clientIdOrName) {
    // Valid Convex ID format (starts with 'j')
    if (typeof clientIdOrName === "string" && clientIdOrName.startsWith("j")) {
      return clientIdOrName as Id<"clients">;
    }
    // Might be a client name
    const search = await searchClientByName(clientIdOrName, client);
    if (search.found && search.clientId) return search.clientId;
    if (search.matches?.length === 1) return search.matches[0]._id;
  } else if (fallbackText) {
    const search = await searchClientByName(fallbackText, client);
    if (search.found && search.clientId) return search.clientId;
    if (search.matches?.length === 1) return search.matches[0]._id;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Reminder parameter validation
// ---------------------------------------------------------------------------

export async function parseAndValidateReminderParams(
  params: any,
  client: ConvexHttpClient
): Promise<{
  valid: boolean;
  error?: string;
  validatedParams?: any;
}> {
  if (!params.title || typeof params.title !== "string" || !params.title.trim()) {
    return { valid: false, error: "Reminder title is required" };
  }

  if (!params.scheduledFor) {
    return { valid: false, error: "Scheduled date/time is required" };
  }

  const dateValidation = validateISODate(params.scheduledFor);
  if (!dateValidation.valid) {
    return { valid: false, error: dateValidation.error };
  }

  const validatedParams: any = {
    title: params.title.trim(),
    description: params.description,
    scheduledFor: params.scheduledFor,
    projectId: params.projectId,
    taskId: params.taskId,
  };

  validatedParams.clientId = await resolveClientId(
    params.clientId,
    `${params.title} ${params.description || ""}`,
    client
  );

  return { valid: true, validatedParams };
}

// ---------------------------------------------------------------------------
// Task parameter validation
// ---------------------------------------------------------------------------

export async function parseAndValidateTaskParams(
  params: any,
  client: ConvexHttpClient
): Promise<{
  valid: boolean;
  error?: string;
  validatedParams?: any;
}> {
  if (!params.title || typeof params.title !== "string" || !params.title.trim()) {
    return { valid: false, error: "Task title is required" };
  }

  const validatedParams: any = {
    title: params.title.trim(),
    description: params.description,
    notes: params.notes,
    priority: params.priority || "medium",
    tags: params.tags || [],
    assignedTo: params.assignedTo,
    projectId: params.projectId,
  };

  if (params.dueDate) {
    const dateValidation = validateISODate(params.dueDate);
    if (!dateValidation.valid) {
      return { valid: false, error: dateValidation.error };
    }
    validatedParams.dueDate = params.dueDate;
  }

  validatedParams.clientId = await resolveClientId(
    params.clientId,
    `${params.title} ${params.description || ""}`,
    client
  );

  return { valid: true, validatedParams };
}
