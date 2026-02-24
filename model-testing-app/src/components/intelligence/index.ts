// Intelligence UI Components
// These components implement the "known vs unknown" pattern for displaying
// client and project intelligence data with source attribution

// Core intelligence section components
export { CompletenessIndicator, CompletenessBar } from './CompletenessIndicator';
export { KnownDataCard, KnownDataInline } from './KnownDataCard';
export type { SourceInfo } from './KnownDataCard';
export { MissingDataList, MissingDataCompact } from './MissingDataList';
export type { MissingField } from './MissingDataList';
export {
  IntelligenceSection,
  SectionSummary,
  categorizeFields,
} from './IntelligenceSection';
export type { KnownField } from './IntelligenceSection';

// Shared UI components
export {
  Field,
  KeyPersonRow,
  DocumentSummaryCard,
  MeetingSummaryCard,
  SidebarItem,
  formatCurrency,
} from './SharedComponents';

// Type definitions
export type {
  SourceInfo as SourceInfoType,
  KnownField as KnownFieldType,
  MissingField as MissingFieldType,
  FieldDefinition,
  SectionCompleteness,
} from './types';

export {
  getNestedValue,
  setNestedValue,
  categorizeFields as categorizeFieldsFromDefs,
  calculateCompleteness,
} from './types';

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
