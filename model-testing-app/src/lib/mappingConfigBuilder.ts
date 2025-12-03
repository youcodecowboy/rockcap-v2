import { PlaceholderConfig, PlaceholderMapping } from './placeholderMapper';

/**
 * Convert database code mappings to PlaceholderConfig format
 */
export function buildPlaceholderConfigFromMappings(
  mappings: Array<{
    categoryCode: string;
    inputCode: string;
    dataType: 'string' | 'number' | 'date' | 'boolean' | 'array';
    format?: string;
    priority: number;
  }>
): PlaceholderConfig {
  const config: PlaceholderConfig = {};
  
  // Group mappings by inputCode (placeholder)
  const mappingsByInputCode = new Map<string, typeof mappings>();
  
  mappings.forEach(mapping => {
    if (!mappingsByInputCode.has(mapping.inputCode)) {
      mappingsByInputCode.set(mapping.inputCode, []);
    }
    mappingsByInputCode.get(mapping.inputCode)!.push(mapping);
  });
  
  // Build config
  mappingsByInputCode.forEach((mappingList, inputCode) => {
    if (mappingList.length === 1) {
      // Single mapping
      const mapping = mappingList[0];
      config[inputCode] = {
        placeholder: inputCode,
        source: mapping.categoryCode,
        type: mapping.dataType === 'array' ? 'string' : mapping.dataType,
        format: mapping.format,
        priority: mapping.priority,
      } as PlaceholderMapping;
    } else {
      // Multiple mappings - create array sorted by priority
      const sortedMappings = [...mappingList].sort((a, b) => b.priority - a.priority);
      config[inputCode] = sortedMappings.map(mapping => ({
        placeholder: inputCode,
        source: mapping.categoryCode,
        type: mapping.dataType === 'array' ? 'string' : mapping.dataType,
        format: mapping.format,
        priority: mapping.priority,
      })) as PlaceholderMapping[];
    }
  });
  
  return config;
}

