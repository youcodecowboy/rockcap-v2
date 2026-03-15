// Intelligence UI Components
// New component architecture replacing the old "known vs unknown" pattern

// Core display components
export { IntelligenceCard } from './IntelligenceCard';
export { IntelligenceCardExpanded } from './IntelligenceCardExpanded';
export { IntelligenceSidebar } from './IntelligenceSidebar';
export type { CategorySummary } from './IntelligenceSidebar';
export { IntelligenceCardList } from './IntelligenceCardList';
export type { IntelligenceItem } from './IntelligenceCardList';
export { IntelligenceMissingFields } from './IntelligenceMissingFields';

// Utility functions
export {
  getCategoryForField,
  getCategoryIcon,
  getRelativeTimeString,
  detectConflicts,
} from './intelligenceUtils';
export type { EvidenceEntry } from './intelligenceUtils';

// Field definitions
export {
  clientBasicFields,
  clientFinancialFields,
  borrowerProfileFields,
  lenderProfileFields,
  projectOverviewFields,
  projectLocationFields,
  projectFinancialsFields,
  projectTimelineFields,
  projectDevelopmentFields,
  keyPartiesFields,
  clientInsightsFields,
  projectInsightsFields,
  getAllClientFields,
  getAllProjectFields,
} from './fieldDefinitions';

// Type definitions
export type {
  FieldDefinition,
  SectionCompleteness,
} from './types';

export {
  getNestedValue,
  setNestedValue,
  categorizeFields,
  calculateCompleteness,
} from './types';
