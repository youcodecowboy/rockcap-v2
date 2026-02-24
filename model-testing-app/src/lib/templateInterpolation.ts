/**
 * Template Interpolation Utility
 *
 * Provides functions to interpolate document templates with values from
 * the knowledge library, using {{client.fieldPath}} and {{project.fieldPath}} syntax.
 *
 * Example:
 *   "Dear {{client.contact.primaryName}}, regarding {{project.overview.projectName}}..."
 *   → "Dear John Smith, regarding 123 High Street Development..."
 */

import { CLIENT_CANONICAL_FIELDS, PROJECT_CANONICAL_FIELDS } from './canonicalFields';

export interface KnowledgeItemForTemplate {
  fieldPath: string;
  value: unknown;
  status: string;
  label: string;
}

export interface InterpolationResult {
  text: string;
  missingFields: MissingField[];
  populatedFields: string[];
  completeness: number; // 0-100 percentage
}

export interface MissingField {
  placeholder: string;
  type: 'client' | 'project';
  fieldPath: string;
  label: string;
  isCanonical: boolean;
}

/**
 * Get a specific field value from knowledge items
 */
export function getFieldValue(
  items: KnowledgeItemForTemplate[],
  fieldPath: string
): unknown | null {
  const item = items.find(i => i.fieldPath === fieldPath && i.status === 'active');
  return item?.value ?? null;
}

/**
 * Get all fields in a category
 */
export function getCategoryFields(
  items: KnowledgeItemForTemplate[],
  category: string
): KnowledgeItemForTemplate[] {
  return items.filter(i =>
    i.fieldPath.startsWith(`${category}.`) &&
    i.status === 'active'
  );
}

/**
 * Format a value for display in a template
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    // Format numbers with commas if they're large
    if (Number.isInteger(value) && value >= 1000) {
      return value.toLocaleString();
    }
    // Format decimal numbers
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (value instanceof Date) {
    return value.toLocaleDateString();
  }

  if (Array.isArray(value)) {
    return value.map(v => formatValue(v)).join(', ');
  }

  if (typeof value === 'object') {
    // For objects, try to get a display-friendly representation
    const obj = value as Record<string, unknown>;
    if ('name' in obj && typeof obj.name === 'string') {
      return obj.name;
    }
    if ('label' in obj && typeof obj.label === 'string') {
      return obj.label;
    }
    if ('value' in obj) {
      return formatValue(obj.value);
    }
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Get the label for a field path
 */
function getFieldLabel(fieldPath: string, type: 'client' | 'project'): string {
  const fields = type === 'client' ? CLIENT_CANONICAL_FIELDS : PROJECT_CANONICAL_FIELDS;
  const field = fields[fieldPath];
  if (field) {
    return field.label;
  }
  // For custom fields, derive label from path
  const parts = fieldPath.split('.');
  return parts[parts.length - 1]
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Check if a field path is canonical
 */
function isCanonicalField(fieldPath: string, type: 'client' | 'project'): boolean {
  const fields = type === 'client' ? CLIENT_CANONICAL_FIELDS : PROJECT_CANONICAL_FIELDS;
  return fieldPath in fields;
}

/**
 * Extract all placeholders from a template string
 */
export function extractPlaceholders(template: string): Array<{
  placeholder: string;
  type: 'client' | 'project';
  fieldPath: string;
}> {
  const regex = /\{\{(client|project)\.([^}]+)\}\}/g;
  const placeholders: Array<{
    placeholder: string;
    type: 'client' | 'project';
    fieldPath: string;
  }> = [];

  let match;
  while ((match = regex.exec(template)) !== null) {
    placeholders.push({
      placeholder: match[0],
      type: match[1] as 'client' | 'project',
      fieldPath: match[2],
    });
  }

  return placeholders;
}

/**
 * Interpolate a template with knowledge item values
 *
 * @param template - The template string with {{client.path}} and {{project.path}} placeholders
 * @param clientItems - Client-level knowledge items
 * @param projectItems - Project-level knowledge items
 * @param options - Options for interpolation behavior
 * @returns InterpolationResult with the interpolated text and metadata
 */
export function interpolateTemplate(
  template: string,
  clientItems: KnowledgeItemForTemplate[],
  projectItems: KnowledgeItemForTemplate[],
  options: {
    markMissing?: boolean; // Add [MISSING: ...] markers for missing fields
    missingMarker?: string; // Custom marker format, use {placeholder} for the original
  } = {}
): InterpolationResult {
  const { markMissing = true, missingMarker = '[MISSING: {placeholder}]' } = options;

  const placeholders = extractPlaceholders(template);
  const missingFields: MissingField[] = [];
  const populatedFields: string[] = [];

  const text = template.replace(
    /\{\{(client|project)\.([^}]+)\}\}/g,
    (match, type: string, fieldPath: string) => {
      const itemType = type as 'client' | 'project';
      const items = itemType === 'client' ? clientItems : projectItems;
      const value = getFieldValue(items, fieldPath);

      if (value !== null && value !== undefined && value !== '') {
        populatedFields.push(`${type}.${fieldPath}`);
        return formatValue(value);
      } else {
        missingFields.push({
          placeholder: match,
          type: itemType,
          fieldPath,
          label: getFieldLabel(fieldPath, itemType),
          isCanonical: isCanonicalField(fieldPath, itemType),
        });

        if (markMissing) {
          return missingMarker.replace('{placeholder}', match);
        }
        return '';
      }
    }
  );

  const totalPlaceholders = placeholders.length;
  const completeness = totalPlaceholders > 0
    ? Math.round((populatedFields.length / totalPlaceholders) * 100)
    : 100;

  return {
    text,
    missingFields,
    populatedFields,
    completeness,
  };
}

/**
 * Analyze a template to identify required fields without performing interpolation
 *
 * @param template - The template string to analyze
 * @returns Analysis of required fields by type and category
 */
export function analyzeTemplate(template: string): {
  clientFields: Array<{ fieldPath: string; label: string; isCanonical: boolean }>;
  projectFields: Array<{ fieldPath: string; label: string; isCanonical: boolean }>;
  totalFields: number;
} {
  const placeholders = extractPlaceholders(template);

  const clientFields = placeholders
    .filter(p => p.type === 'client')
    .map(p => ({
      fieldPath: p.fieldPath,
      label: getFieldLabel(p.fieldPath, 'client'),
      isCanonical: isCanonicalField(p.fieldPath, 'client'),
    }));

  const projectFields = placeholders
    .filter(p => p.type === 'project')
    .map(p => ({
      fieldPath: p.fieldPath,
      label: getFieldLabel(p.fieldPath, 'project'),
      isCanonical: isCanonicalField(p.fieldPath, 'project'),
    }));

  // Deduplicate
  const uniqueClientFields = clientFields.filter(
    (field, index, self) => index === self.findIndex(f => f.fieldPath === field.fieldPath)
  );
  const uniqueProjectFields = projectFields.filter(
    (field, index, self) => index === self.findIndex(f => f.fieldPath === field.fieldPath)
  );

  return {
    clientFields: uniqueClientFields,
    projectFields: uniqueProjectFields,
    totalFields: uniqueClientFields.length + uniqueProjectFields.length,
  };
}

/**
 * Check template readiness - determine what percentage of required fields are available
 *
 * @param template - The template string
 * @param clientItems - Available client knowledge items
 * @param projectItems - Available project knowledge items
 * @returns Readiness analysis
 */
export function checkTemplateReadiness(
  template: string,
  clientItems: KnowledgeItemForTemplate[],
  projectItems: KnowledgeItemForTemplate[]
): {
  ready: boolean;
  completeness: number;
  missingFields: MissingField[];
  availableFields: string[];
  threshold: number;
} {
  const threshold = 90; // Consider template "ready" at 90%+ completeness
  const result = interpolateTemplate(template, clientItems, projectItems, { markMissing: false });

  return {
    ready: result.completeness >= threshold,
    completeness: result.completeness,
    missingFields: result.missingFields,
    availableFields: result.populatedFields,
    threshold,
  };
}

/**
 * Generate a summary of missing fields grouped by category
 */
export function getMissingFieldsSummary(
  missingFields: MissingField[]
): Record<string, MissingField[]> {
  const summary: Record<string, MissingField[]> = {};

  for (const field of missingFields) {
    const category = field.fieldPath.split('.')[0];
    const key = `${field.type}.${category}`;
    if (!summary[key]) {
      summary[key] = [];
    }
    summary[key].push(field);
  }

  return summary;
}
