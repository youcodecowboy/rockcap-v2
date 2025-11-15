/**
 * Shared utilities for HubSpot sync operations
 */

/**
 * Parse a date string or timestamp to ISO string
 * Handles ISO strings, timestamps in milliseconds/seconds, validates 1970 dates
 */
export function parseDate(dateValue?: string | number | null): string {
  if (!dateValue) {
    return new Date().toISOString();
  }

  // If it's already an ISO string, validate and return
  if (typeof dateValue === 'string' && dateValue.includes('T')) {
    const testDate = new Date(dateValue);
    if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 1970) {
      return dateValue;
    }
    return new Date().toISOString();
  }

  // Try parsing as timestamp
  const timestamp = typeof dateValue === 'string' ? parseInt(dateValue) : dateValue;
  if (!isNaN(timestamp) && timestamp > 0) {
    // If timestamp is less than year 2000, it's likely in seconds
    const date = timestamp < 946684800000 ? new Date(timestamp * 1000) : new Date(timestamp);
    if (!isNaN(date.getTime()) && date.getFullYear() > 1970) {
      return date.toISOString();
    }
  }

  return new Date().toISOString();
}

/**
 * Parse createdAt date (with fallback to current time)
 */
export function parseCreatedAt(createdAt?: string | null): string {
  if (!createdAt) {
    return new Date().toISOString();
  }
  return parseDate(createdAt);
}

/**
 * Parse updatedAt date (with fallback to current time)
 */
export function parseUpdatedAt(updatedAt?: string | null): string {
  if (!updatedAt) {
    return new Date().toISOString();
  }
  return parseDate(updatedAt);
}

/**
 * Merge metadata objects, preserving existing metadata
 */
export function mergeMetadata(
  existingMetadata?: any,
  customProperties?: any,
  newMetadata?: any
): any {
  const metadata = existingMetadata ? { ...existingMetadata } : {};
  
  if (customProperties) {
    Object.assign(metadata, { hubspotCustomProperties: customProperties });
  }
  
  if (newMetadata) {
    Object.assign(metadata, newMetadata);
  }
  
  return metadata;
}

/**
 * Filter out null/undefined/empty string values
 * Convex doesn't accept null for optional fields
 */
export function hasValue<T>(val: T | null | undefined | ''): val is T {
  return val != null && val !== '';
}

/**
 * Clean args object by removing null/undefined/empty values
 */
export function cleanArgs<T extends Record<string, any>>(args: T): Partial<T> {
  const cleaned: any = {};
  Object.keys(args).forEach(key => {
    const value = (args as any)[key];
    if (value != null && value !== '') {
      cleaned[key] = value;
    }
  });
  return cleaned;
}

/**
 * Map HubSpot lifecycle stage to client status
 */
export function mapLifecycleStageToStatus(
  lifecycleStage?: string
): 'prospect' | 'active' | 'archived' | 'past' {
  if (!lifecycleStage) {
    return 'active';
  }
  
  const stage = lifecycleStage.toLowerCase();
  
  // Prospect stages
  if (
    stage === 'lead' ||
    stage === 'marketingqualifiedlead' ||
    stage === 'salesqualifiedlead' ||
    stage === 'opportunity'
  ) {
    return 'prospect';
  }
  
  // Active stages
  if (
    stage === 'customer' ||
    stage === 'evangelist' ||
    stage === 'other'
  ) {
    return 'active';
  }
  
  // Default to active
  return 'active';
}

/**
 * Map HubSpot lifecycle stage to lead lifecycle stage
 */
export function mapToLeadLifecycleStage(
  lifecycleStage?: string
): "lead" | "opportunity" | "marketingqualifiedlead" | "salesqualifiedlead" | null {
  if (!lifecycleStage) return null;
  
  const stage = lifecycleStage.toLowerCase();
  
  if (stage === 'lead') return "lead";
  if (stage === 'opportunity') return "opportunity";
  if (stage === 'marketingqualifiedlead' || stage === 'mql') return "marketingqualifiedlead";
  if (stage === 'salesqualifiedlead' || stage === 'sql') return "salesqualifiedlead";
  
  return null;
}

/**
 * Check if lifecycle stage indicates a lead
 */
export function isLeadLifecycleStage(lifecycleStage?: string): boolean {
  return mapToLeadLifecycleStage(lifecycleStage) !== null;
}

/**
 * Deduplicate an array of IDs
 */
export function deduplicateIds<T>(ids: T[]): T[] {
  const seen = new Set<T>();
  return ids.filter(id => {
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

