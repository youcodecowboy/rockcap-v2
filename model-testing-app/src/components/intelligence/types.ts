// Intelligence Component Types

export interface SourceInfo {
  sourceType: 'document' | 'manual' | 'ai' | 'hubspot';
  sourceName?: string;
  sourceId?: string;
  extractedAt?: string;
  confidence?: number;
}

export interface KnownField {
  key: string;
  label: string;
  value: string | number | undefined;
  source?: SourceInfo;
  editable?: boolean;
  multiline?: boolean;
  type?: 'text' | 'email' | 'tel' | 'url' | 'number';
  secondaryValue?: string;
  isCritical?: boolean;
}

export interface MissingField {
  key: string;
  label: string;
  description?: string;
  priority?: 'critical' | 'important' | 'optional';
  expectedSource?: string;
  multiline?: boolean;
  type?: 'text' | 'email' | 'tel' | 'url' | 'number';
}

export interface FieldDefinition {
  key: string;
  label: string;
  priority?: 'critical' | 'important' | 'optional';
  expectedSource?: string;
  multiline?: boolean;
  type?: 'text' | 'number' | 'email' | 'tel' | 'url';
  isCritical?: boolean;
}

export interface SectionCompleteness {
  filled: number;
  total: number;
  criticalMissing: number;
}

// Helper to get nested value from object
export function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Helper to set nested value in object
export function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

// Categorize fields based on data
export function categorizeFields(
  data: any,
  fieldDefs: FieldDefinition[]
): { known: KnownField[]; missing: MissingField[] } {
  const known: KnownField[] = [];
  const missing: MissingField[] = [];

  for (const field of fieldDefs) {
    const value = getNestedValue(data, field.key);
    const hasValue = value !== undefined && value !== null && value !== '';

    if (hasValue) {
      known.push({
        key: field.key,
        label: field.label,
        value: value,
        multiline: field.multiline,
        type: field.type || 'text',
        isCritical: field.isCritical,
      });
    } else {
      missing.push({
        key: field.key,
        label: field.label,
        priority: field.priority,
        expectedSource: field.expectedSource,
        multiline: field.multiline,
        type: field.type || 'text',
      });
    }
  }

  return { known, missing };
}

// Calculate completeness from field definitions and data
export function calculateCompleteness(
  data: any,
  fieldDefs: FieldDefinition[]
): SectionCompleteness {
  const { known, missing } = categorizeFields(data, fieldDefs);
  const criticalMissing = missing.filter(f => f.priority === 'critical').length;
  return {
    filled: known.length,
    total: fieldDefs.length,
    criticalMissing,
  };
}
