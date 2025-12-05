/**
 * Dynamic Sheet Generator
 * 
 * Handles the generation of dynamic sheets for multi-site templates.
 * Takes template sheets with placeholders (e.g., {N}) and generates
 * concrete sheets with the placeholder replaced by actual values.
 */

import { SheetData } from './templateLoader';

/**
 * Configuration for a dynamic group
 */
export interface DynamicGroupConfig {
  groupId: string;
  label: string;
  sheetIds: string[];
  min: number;
  max: number;
  defaultCount: number;
  namePlaceholder: string;
}

/**
 * Result of sheet generation
 */
export interface GenerationResult {
  sheets: SheetData[];
  generatedSheetNames: string[];
  coreSheetNames: string[];
  dynamicSheetsByGroup: Record<string, string[]>;
  totalCount: number;
}

/**
 * Generate all sheets for a model run
 * 
 * @param coreSheets - Sheets that are always included unchanged
 * @param dynamicTemplates - Map of groupId to template sheets
 * @param dynamicGroups - Configuration for each dynamic group
 * @param groupCounts - How many copies of each group to create
 * @returns Generated sheets ready for use in WorkbookEditor
 */
export function generateModelSheets(
  coreSheets: SheetData[],
  dynamicTemplates: Map<string, SheetData[]>,
  dynamicGroups: DynamicGroupConfig[],
  groupCounts: Record<string, number>
): GenerationResult {
  console.log('[DynamicSheetGenerator] Starting sheet generation');
  console.log(`[DynamicSheetGenerator] Core sheets: ${coreSheets.length}`);
  console.log(`[DynamicSheetGenerator] Dynamic groups: ${dynamicGroups.length}`);
  
  const result: GenerationResult = {
    sheets: [],
    generatedSheetNames: [],
    coreSheetNames: [],
    dynamicSheetsByGroup: {},
    totalCount: 0,
  };

  // Add core sheets first (unchanged)
  for (const sheet of coreSheets) {
    result.sheets.push({ ...sheet });
    result.coreSheetNames.push(sheet.name);
  }

  // Process each dynamic group
  for (const group of dynamicGroups) {
    const count = groupCounts[group.groupId] ?? group.defaultCount;
    const templateSheets = dynamicTemplates.get(group.groupId) || [];
    
    console.log(`[DynamicSheetGenerator] Generating group "${group.label}": ${count} copies of ${templateSheets.length} templates`);
    
    result.dynamicSheetsByGroup[group.groupId] = [];

    // Generate N copies
    for (let n = 1; n <= count; n++) {
      for (const template of templateSheets) {
        const newSheet = cloneSheetWithReplacement(
          template,
          group.namePlaceholder,
          n.toString()
        );
        result.sheets.push(newSheet);
        result.generatedSheetNames.push(newSheet.name);
        result.dynamicSheetsByGroup[group.groupId].push(newSheet.name);
      }
    }
  }

  result.totalCount = result.sheets.length;
  console.log(`[DynamicSheetGenerator] Generated ${result.totalCount} total sheets`);
  
  return result;
}

/**
 * Clone a sheet and replace all occurrences of a placeholder
 * Handles sheet name, cell values, and formulas
 */
function cloneSheetWithReplacement(
  sheet: SheetData,
  placeholder: string,
  replacement: string
): SheetData {
  const regex = new RegExp(escapeRegExp(placeholder), 'g');

  // Replace in sheet name
  const newName = sheet.name.replace(regex, replacement);

  // Deep clone and replace in data
  const newData = sheet.data.map(row =>
    row.map(cell => {
      if (typeof cell === 'string') {
        return cell.replace(regex, replacement);
      }
      return cell;
    })
  );

  // Replace in formulas
  let newFormulas: { [key: string]: string } | undefined;
  if (sheet.formulas) {
    newFormulas = {};
    for (const [cellAddress, formula] of Object.entries(sheet.formulas)) {
      newFormulas[cellAddress] = formula.replace(regex, replacement);
    }
  }

  // Styles and column widths are structural - clone without replacement
  const newStyles = sheet.styles ? deepClone(sheet.styles) : undefined;
  const newColumnWidths = sheet.columnWidths ? { ...sheet.columnWidths } : undefined;

  return {
    name: newName,
    data: newData,
    formulas: newFormulas,
    styles: newStyles,
    columnWidths: newColumnWidths,
  };
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deep clone an object (simple implementation for styles)
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }
  const cloned: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone((obj as Record<string, unknown>)[key]);
    }
  }
  return cloned as T;
}

/**
 * Validate a template's dynamic configuration
 * Checks that placeholders are present where expected
 */
export function validateDynamicConfig(
  dynamicTemplates: Map<string, SheetData[]>,
  dynamicGroups: DynamicGroupConfig[]
): { valid: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const group of dynamicGroups) {
    const templates = dynamicTemplates.get(group.groupId) || [];
    
    if (templates.length === 0) {
      errors.push(`Group "${group.label}" has no template sheets`);
      continue;
    }

    for (const template of templates) {
      // Check sheet name contains placeholder
      if (!template.name.includes(group.namePlaceholder)) {
        warnings.push(
          `Sheet "${template.name}" in group "${group.label}" doesn't contain placeholder "${group.namePlaceholder}" in its name. ` +
          `This might be intentional, but dynamic naming won't work for this sheet.`
        );
      }

      // Check formulas for placeholder (just informational)
      let formulasWithPlaceholder = 0;
      if (template.formulas) {
        for (const formula of Object.values(template.formulas)) {
          if (formula.includes(group.namePlaceholder)) {
            formulasWithPlaceholder++;
          }
        }
      }

      if (formulasWithPlaceholder > 0) {
        console.log(
          `[DynamicSheetGenerator] Sheet "${template.name}" has ${formulasWithPlaceholder} formulas with placeholder "${group.namePlaceholder}"`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Calculate what sheets will be generated for a given configuration
 * Useful for preview purposes
 */
export function previewGeneratedSheets(
  coreSheetNames: string[],
  dynamicGroups: Array<{
    groupId: string;
    label: string;
    sheetNames: string[];
    namePlaceholder: string;
  }>,
  groupCounts: Record<string, number>
): Array<{ name: string; type: 'core' | 'dynamic'; groupId?: string; groupLabel?: string }> {
  const preview: Array<{ 
    name: string; 
    type: 'core' | 'dynamic'; 
    groupId?: string; 
    groupLabel?: string 
  }> = [];

  // Add core sheets
  for (const name of coreSheetNames) {
    preview.push({ name, type: 'core' });
  }

  // Add dynamic sheets
  for (const group of dynamicGroups) {
    const count = groupCounts[group.groupId] ?? 1;
    const regex = new RegExp(escapeRegExp(group.namePlaceholder), 'g');

    for (let n = 1; n <= count; n++) {
      for (const templateName of group.sheetNames) {
        const name = templateName.replace(regex, n.toString());
        preview.push({
          name,
          type: 'dynamic',
          groupId: group.groupId,
          groupLabel: group.label,
        });
      }
    }
  }

  return preview;
}

/**
 * Get the recommended sheet order for generated sheets
 * Core sheets first, then dynamic sheets in group order, then by number
 */
export function getOptimalSheetOrder(
  generatedSheets: Array<{ 
    name: string; 
    type: 'core' | 'dynamic'; 
    groupId?: string;
  }>,
  groupOrder: string[]
): string[] {
  // Core sheets first
  const coreSheets = generatedSheets
    .filter(s => s.type === 'core')
    .map(s => s.name);

  // Dynamic sheets grouped by group ID
  const dynamicByGroup: Record<string, string[]> = {};
  for (const sheet of generatedSheets) {
    if (sheet.type === 'dynamic' && sheet.groupId) {
      if (!dynamicByGroup[sheet.groupId]) {
        dynamicByGroup[sheet.groupId] = [];
      }
      dynamicByGroup[sheet.groupId].push(sheet.name);
    }
  }

  // Build final order
  const order: string[] = [...coreSheets];
  
  for (const groupId of groupOrder) {
    if (dynamicByGroup[groupId]) {
      // Sort within group by the number suffix
      dynamicByGroup[groupId].sort((a, b) => {
        const numA = parseInt(a.match(/\d+$/)?.[0] || '0', 10);
        const numB = parseInt(b.match(/\d+$/)?.[0] || '0', 10);
        return numA - numB;
      });
      order.push(...dynamicByGroup[groupId]);
    }
  }

  return order;
}

