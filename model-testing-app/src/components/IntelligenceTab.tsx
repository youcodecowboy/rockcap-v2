'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id, Doc } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Brain,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  FileText,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  Banknote,
  Clock,
  Users,
  Sparkles,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Star,
  Tag,
  CircleDashed,
  FolderKanban,
  Calendar,
  DollarSign,
  FileStack,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Scale,
  TrendingUp,
  Shield,
  AlertTriangle,
  ListChecks,
} from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import FileDetailPanel from '@/app/docs/components/FileDetailPanel';
import {
  CLIENT_CANONICAL_FIELDS,
  PROJECT_CANONICAL_FIELDS,
  getFieldsByCategory,
  CanonicalFieldConfig,
} from '@/lib/canonicalFields';
import { IntelligenceSidebar, CategorySummary } from './intelligence/IntelligenceSidebar';
import { IntelligenceCardList, IntelligenceItem } from './intelligence/IntelligenceCardList';
import { IntelligenceMissingFields } from './intelligence/IntelligenceMissingFields';
import { getCategoryForField, detectConflicts, EvidenceEntry } from './intelligence/intelligenceUtils';
import { DocumentFilterDropdown } from './intelligence/DocumentFilterDropdown';
import { DocumentFilteredView, type DocumentFilterItem } from './intelligence/DocumentFilteredView';
import { deriveContributingDocuments } from './intelligence/intelligenceUtils';
import { categorizeAttribute } from '@/lib/intelligenceCategorizer';
import {
  getAllClientFields,
  getAllProjectFields,
  clientKycFields,
  clientLegalFields,
  projectLoanTermsFields,
  projectConstructionFields,
  projectTitleFields,
  projectExitFields,
} from './intelligence/fieldDefinitions';
import { getNestedValue, type FieldDefinition } from './intelligence/types';

// ============================================================================
// TYPES
// ============================================================================

// UI representation of a knowledge item
export interface KnowledgeItemUI {
  _id: Id<"knowledgeItems">;
  fieldPath: string;
  isCanonical: boolean;
  category: string;
  label: string;
  value: unknown;
  valueType: string;
  sourceType: string;
  sourceDocumentId?: Id<"documents">;
  sourceDocumentName?: string;
  normalizationConfidence?: number;
  status: string;
  addedAt: string;
  addedBy?: string;
  tags?: string[];
}

// Unfilled canonical field placeholder
interface UnfilledCanonicalField {
  fieldPath: string;
  label: string;
  type: string;
  description?: string;
  category: string;
}

// Combined type for display
type DisplayItem =
  | { type: 'filled'; item: KnowledgeItemUI }
  | { type: 'unfilled'; field: UnfilledCanonicalField };

interface CategoryConfig {
  key: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CLIENT_CATEGORIES: CategoryConfig[] = [
  { key: 'contact', label: 'Contact Info', icon: <User className="w-4 h-4" />, description: 'Names, emails, phones, addresses' },
  { key: 'company', label: 'Company', icon: <Building2 className="w-4 h-4" />, description: 'Registration, structure, legal' },
  { key: 'financial', label: 'Financial', icon: <Banknote className="w-4 h-4" />, description: 'Net worth, assets, banking' },
  { key: 'experience', label: 'Experience', icon: <FileText className="w-4 h-4" />, description: 'Track record, past projects' },
  { key: 'preferences', label: 'Preferences', icon: <Sparkles className="w-4 h-4" />, description: 'Deal types, regions, requirements' },
  { key: 'relationships', label: 'Relationships', icon: <Users className="w-4 h-4" />, description: 'Key people, contacts' },
  { key: 'extracted', label: 'Extracted Data', icon: <Tag className="w-4 h-4" />, description: 'AI-extracted values from documents' },
  { key: 'insights', label: 'Insights', icon: <Brain className="w-4 h-4" />, description: 'Summaries, key findings, observations' },
  { key: 'custom', label: 'Custom', icon: <CircleDashed className="w-4 h-4" />, description: 'Other custom fields' },
];

const PROJECT_CATEGORIES: CategoryConfig[] = [
  { key: 'overview', label: 'Overview', icon: <Building2 className="w-4 h-4" />, description: 'Type, description, status' },
  { key: 'location', label: 'Location', icon: <MapPin className="w-4 h-4" />, description: 'Address, region, authority' },
  { key: 'financials', label: 'Financials', icon: <Banknote className="w-4 h-4" />, description: 'Costs, values, loan terms' },
  { key: 'timeline', label: 'Timeline', icon: <Clock className="w-4 h-4" />, description: 'Key dates and milestones' },
  { key: 'development', label: 'Development', icon: <Building2 className="w-4 h-4" />, description: 'Units, size, specifications' },
  { key: 'legal', label: 'Legal', icon: <Scale className="w-4 h-4" />, description: 'Title, charges, covenants, conditions' },
  { key: 'valuation', label: 'Valuation', icon: <TrendingUp className="w-4 h-4" />, description: 'Values, assumptions, comparables' },
  { key: 'insurance', label: 'Insurance', icon: <Shield className="w-4 h-4" />, description: 'Policies, cover, expiry' },
  { key: 'risk', label: 'Risk', icon: <AlertTriangle className="w-4 h-4" />, description: 'Risks, severity, mitigants' },
  { key: 'conditions', label: 'Conditions', icon: <ListChecks className="w-4 h-4" />, description: 'Precedent, subsequent, waivers' },
  { key: 'parties', label: 'Key Parties', icon: <Users className="w-4 h-4" />, description: 'Professionals involved' },
  { key: 'planning', label: 'Planning', icon: <FileText className="w-4 h-4" />, description: 'Permissions, references' },
  { key: 'extracted', label: 'Extracted Data', icon: <Tag className="w-4 h-4" />, description: 'AI-extracted values from documents' },
  { key: 'insights', label: 'Insights', icon: <Brain className="w-4 h-4" />, description: 'Summaries, key findings, observations' },
  { key: 'custom', label: 'Custom', icon: <CircleDashed className="w-4 h-4" />, description: 'Other custom fields' },
];

// ============================================================================
// CATEGORY COMPUTATION HELPERS
// ============================================================================

/**
 * Given an intelligence record (knowledge items) and field definitions,
 * compute CategorySummary[] for the sidebar.
 */
function computeClientCategories(
  knowledgeItems: KnowledgeItemUI[],
  isLender: boolean,
  evidenceTrail: EvidenceEntry[],
): CategorySummary[] {
  const allFields = getAllClientFields(isLender);
  return computeCategoriesFromFields(allFields, knowledgeItems, evidenceTrail);
}

function computeProjectCategories(
  knowledgeItems: KnowledgeItemUI[],
  evidenceTrail: EvidenceEntry[],
): CategorySummary[] {
  const allFields = getAllProjectFields();
  return computeCategoriesFromFields(allFields, knowledgeItems, evidenceTrail);
}

function computeCategoriesFromFields(
  fieldDefs: FieldDefinition[],
  knowledgeItems: KnowledgeItemUI[],
  evidenceTrail: EvidenceEntry[],
): CategorySummary[] {
  const categoryMap = new Map<string, {
    filled: number;
    total: number;
    hasCriticalMissing: boolean;
    hasConflicts: boolean;
    recentlyUpdated: boolean;
  }>();

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  // Build a set of filled field paths from knowledge items
  const filledPaths = new Set(knowledgeItems.map(item => item.fieldPath));

  // Walk all field definitions and group by category
  for (const field of fieldDefs) {
    const category = getCategoryForField(field.key);
    if (!categoryMap.has(category)) {
      categoryMap.set(category, {
        filled: 0,
        total: 0,
        hasCriticalMissing: false,
        hasConflicts: false,
        recentlyUpdated: false,
      });
    }
    const cat = categoryMap.get(category)!;
    cat.total++;

    if (filledPaths.has(field.key)) {
      cat.filled++;
      // Check if recently updated
      const item = knowledgeItems.find(ki => ki.fieldPath === field.key);
      if (item?.addedAt) {
        const addedTime = new Date(item.addedAt).getTime();
        if (addedTime > oneDayAgo) {
          cat.recentlyUpdated = true;
        }
      }
      // Check for conflicts
      const conflicts = detectConflicts(evidenceTrail, field.key);
      if (conflicts.length > 0) {
        cat.hasConflicts = true;
      }
    } else {
      // Check if missing field is critical
      if (field.priority === 'critical') {
        cat.hasCriticalMissing = true;
      }
    }
  }

  // Also account for knowledge items that don't match any field definition
  // (custom/extracted items categorized by their stored category key)
  for (const item of knowledgeItems) {
    const matchesFieldDef = fieldDefs.some(f => f.key === item.fieldPath);
    if (!matchesFieldDef) {
      const category = getCategoryForField(item.fieldPath) !== 'Other'
        ? getCategoryForField(item.fieldPath)
        : categorizeAttribute(item.label);
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          filled: 0,
          total: 0,
          hasCriticalMissing: false,
          hasConflicts: false,
          recentlyUpdated: false,
        });
      }
      const cat = categoryMap.get(category)!;
      cat.filled++;
      cat.total++;

      if (item.addedAt) {
        const addedTime = new Date(item.addedAt).getTime();
        if (addedTime > oneDayAgo) {
          cat.recentlyUpdated = true;
        }
      }
    }
  }

  // Convert to sorted array
  const result: CategorySummary[] = [];
  for (const [name, data] of categoryMap.entries()) {
    result.push({
      name,
      filled: data.filled,
      total: data.total,
      hasCriticalMissing: data.hasCriticalMissing,
      hasConflicts: data.hasConflicts,
      recentlyUpdated: data.recentlyUpdated,
    });
  }

  // Sort: categories with items first, then alphabetical
  result.sort((a, b) => {
    if (a.name === 'Other') return 1;
    if (b.name === 'Other') return -1;
    if (a.filled > 0 && b.filled === 0) return -1;
    if (a.filled === 0 && b.filled > 0) return 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}

/**
 * Transform knowledge items for a given category into IntelligenceItem[]
 * for the IntelligenceCardList component.
 */
function buildIntelligenceItems(
  knowledgeItems: KnowledgeItemUI[],
  fieldDefs: FieldDefinition[],
  categoryName: string,
  evidenceTrail: EvidenceEntry[],
): IntelligenceItem[] {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  // Filter knowledge items to those belonging to this category
  const itemsInCategory = knowledgeItems.filter(item => {
    const fieldCategory = getCategoryForField(item.fieldPath);
    if (fieldCategory !== 'Other') return fieldCategory === categoryName;
    // Fallback to label-based categorization
    return categorizeAttribute(item.label) === categoryName;
  });

  return itemsInCategory.map(item => {
    const conflicts = detectConflicts(evidenceTrail, item.fieldPath);
    const allEntries = evidenceTrail.filter(e => e.fieldPath === item.fieldPath);
    const priorValues = allEntries.length > 1
      ? allEntries.filter(e =>
          String(e.value).toLowerCase() === String(item.value).toLowerCase()
        ).length - 1
      : 0;

    const isCore = item.isCanonical || fieldDefs.some(f => f.key === item.fieldPath);
    const isRecentlyUpdated = item.addedAt
      ? new Date(item.addedAt).getTime() > oneDayAgo
      : false;

    return {
      fieldKey: item.fieldPath,
      fieldLabel: item.label,
      fieldValue: formatDisplayValue(item.value, item.valueType) as string,
      confidence: item.normalizationConfidence ?? 0.9,
      sourceDocumentName: item.sourceDocumentName,
      sourceDocumentId: item.sourceDocumentId ? String(item.sourceDocumentId) : undefined,
      extractedAt: item.addedAt,
      isCore,
      conflictCount: conflicts.length,
      priorValueCount: Math.max(0, priorValues),
      isRecentlyUpdated,
    };
  });
}

/**
 * Build the list of missing fields for a given category.
 */
function buildMissingFields(
  knowledgeItems: KnowledgeItemUI[],
  fieldDefs: FieldDefinition[],
  categoryName: string,
): { key: string; label: string; priority: 'critical' | 'important' | 'optional' }[] {
  const filledPaths = new Set(knowledgeItems.map(item => item.fieldPath));

  return fieldDefs
    .filter(field => {
      const fieldCategory = getCategoryForField(field.key);
      return fieldCategory === categoryName && !filledPaths.has(field.key);
    })
    .map(field => ({
      key: field.key,
      label: field.label,
      priority: (field.priority ?? 'optional') as 'critical' | 'important' | 'optional',
    }));
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function formatDisplayValue(value: unknown, valueType: string): string {
  if (value === null || value === undefined || value === '') return '-';

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (valueType === 'currency' && typeof value === 'number') {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: 0
    }).format(value);
  }

  if (valueType === 'percentage' && typeof value === 'number') {
    return `${value}%`;
  }

  if (valueType === 'date' && typeof value === 'string') {
    try {
      return new Date(value).toLocaleDateString('en-GB');
    } catch {
      return String(value);
    }
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

// History item type for displaying superseded values
interface HistoryItem {
  _id: Id<"knowledgeItems">;
  value: unknown;
  valueType: string;
  sourceDocumentName?: string;
  sourceDocumentId?: string;
  addedAt: string;
  status: string;
}

// Type for add/edit item data
interface AddItemData {
  _id?: Id<"knowledgeItems">;
  category: string;
  label: string;
  value: string;
  valueType: "string" | "number" | "currency" | "date" | "percentage" | "array" | "text" | "boolean";
}

function AddItemModal({
  isOpen,
  onClose,
  onSave,
  categories,
  initialCategory,
  editItem,
  fillingCanonicalField,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: AddItemData) => void;
  categories: CategoryConfig[];
  initialCategory?: string;
  editItem?: KnowledgeItemUI;
  fillingCanonicalField?: UnfilledCanonicalField;
}) {
  const isFillingCanonical = !!fillingCanonicalField;
  const [category, setCategory] = useState(
    fillingCanonicalField?.category || editItem?.category || initialCategory || categories[0]?.key
  );
  const [label, setLabel] = useState(fillingCanonicalField?.label || editItem?.label || '');
  const [value, setValue] = useState(editItem?.value ? formatDisplayValue(editItem.value, editItem.valueType) : '');
  const [valueType, setValueType] = useState<AddItemData['valueType']>(
    (fillingCanonicalField?.type as AddItemData['valueType']) ||
    (editItem?.valueType as AddItemData['valueType']) ||
    'string'
  );

  // Reset form when modal opens with new context
  useMemo(() => {
    if (isOpen) {
      setCategory(fillingCanonicalField?.category || editItem?.category || initialCategory || categories[0]?.key);
      setLabel(fillingCanonicalField?.label || editItem?.label || '');
      setValue(editItem?.value ? formatDisplayValue(editItem.value, editItem.valueType) : '');
      setValueType(
        (fillingCanonicalField?.type as AddItemData['valueType']) ||
        (editItem?.valueType as AddItemData['valueType']) ||
        'string'
      );
    }
  }, [isOpen, fillingCanonicalField, editItem, initialCategory, categories]);

  const handleSave = () => {
    const effectiveLabel = fillingCanonicalField?.label || label;
    if (!effectiveLabel.trim() || !value.trim()) return;

    // Parse value based on type
    let parsedValue: unknown = value.trim();
    if (valueType === 'number' || valueType === 'currency' || valueType === 'percentage') {
      const num = parseFloat(value.replace(/[£$,]/g, ''));
      parsedValue = isNaN(num) ? value.trim() : num;
    } else if (valueType === 'boolean') {
      parsedValue = value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
    } else if (valueType === 'array') {
      parsedValue = value.split(',').map((v) => v.trim()).filter(Boolean);
    }

    onSave({
      _id: editItem?._id,
      category,
      label: effectiveLabel.trim(),
      value: String(parsedValue),
      valueType,
    });
    setLabel('');
    setValue('');
    setValueType('string');
    onClose();
  };

  if (!isOpen) return null;

  const modalTitle = editItem
    ? 'Edit Item'
    : isFillingCanonical
    ? `Add ${fillingCanonicalField.label}`
    : 'Add Custom Field';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-1">{modalTitle}</h3>
        {isFillingCanonical && fillingCanonicalField.description && (
          <p className="text-sm text-gray-500 mb-4">{fillingCanonicalField.description}</p>
        )}
        {!isFillingCanonical && !editItem && (
          <p className="text-sm text-gray-500 mb-4">Add a custom field to track additional information</p>
        )}

        <div className="space-y-4">
          {/* Only show category/label for custom fields, not for canonical field filling */}
          {!isFillingCanonical && (
            <>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Category</label>
                <Select value={category} onValueChange={setCategory} disabled={!!editItem}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.key} value={cat.key}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Label</label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g., Net Worth, Primary Contact, Key Risk..."
                  disabled={!!editItem}
                />
              </div>
            </>
          )}

          {/* Show canonical field info badge when filling */}
          {isFillingCanonical && (
            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
              <Star className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-blue-700">Core field: {fillingCanonicalField.label}</span>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Value Type</label>
            <Select
              value={valueType}
              onValueChange={(v) => setValueType(v as AddItemData['valueType'])}
              disabled={isFillingCanonical}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">Text</SelectItem>
                <SelectItem value="text">Long Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="currency">Currency (GBP)</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="boolean">Yes/No</SelectItem>
                <SelectItem value="array">List (comma separated)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Value</label>
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                valueType === 'currency' ? 'e.g., 1500000'
                : valueType === 'percentage' ? 'e.g., 65'
                : valueType === 'date' ? 'e.g., 2024-01-15'
                : valueType === 'array' ? 'Item 1, Item 2, Item 3'
                : valueType === 'boolean' ? 'yes or no'
                : 'The information...'
              }
              rows={valueType === 'text' ? 5 : 3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={(!isFillingCanonical && !label.trim()) || !value.trim()}
          >
            {editItem ? 'Save Changes' : isFillingCanonical ? 'Save' : 'Add Item'}
          </Button>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// DOCUMENT SUMMARY VIEW
// ============================================================================

interface DocumentAnalysis {
  documentDescription: string;
  documentPurpose: string;
  entities: {
    people: string[];
    companies: string[];
    locations: string[];
    projects: string[];
  };
  keyTerms: string[];
  keyDates: string[];
  keyAmounts: string[];
  executiveSummary: string;
  detailedSummary: string;
  sectionBreakdown?: string[];
  documentCharacteristics: {
    isFinancial: boolean;
    isLegal: boolean;
    isIdentity: boolean;
    isReport: boolean;
    isDesign: boolean;
    isCorrespondence: boolean;
    hasMultipleProjects: boolean;
    isInternal: boolean;
  };
  rawContentType: string;
  confidenceInAnalysis: number;
}

interface DocumentWithAnalysis {
  _id: Id<"documents">;
  fileName: string;
  documentCode?: string;
  category: string;
  fileTypeDetected?: string;
  uploadedAt: string;
  folderId?: string;
  documentAnalysis?: DocumentAnalysis;
  summary?: string;
}

function DocumentSummaryCard({ document, onOpen }: { document: DocumentWithAnalysis; onOpen: (doc: DocumentWithAnalysis) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const analysis = document.documentAnalysis;

  const hasAnalysis = !!analysis;
  const hasEntities = analysis && (
    analysis.entities.people.length > 0 ||
    analysis.entities.companies.length > 0 ||
    analysis.entities.locations.length > 0 ||
    analysis.entities.projects.length > 0
  );
  const hasKeyData = analysis && (
    analysis.keyTerms.length > 0 ||
    analysis.keyDates.length > 0 ||
    analysis.keyAmounts.length > 0
  );

  const handleOpenClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen(document);
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <CollapsibleTrigger asChild>
          <div className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left cursor-pointer" role="button" tabIndex={0}>
            <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 truncate">
                  {document.documentCode || document.fileName}
                </span>
                <Badge variant="outline" className="text-xs flex-shrink-0">
                  {document.category}
                </Badge>
              </div>
              {hasAnalysis && (
                <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
                  {analysis.executiveSummary}
                </p>
              )}
              {!hasAnalysis && document.summary && (
                <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
                  {document.summary}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                onClick={handleOpenClick}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1" />
                Open
              </Button>
              <span className="text-xs text-gray-400">
                {new Date(document.uploadedAt).toLocaleDateString('en-GB')}
              </span>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-gray-100">
            {hasAnalysis ? (
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="w-full justify-start h-10 bg-gray-50 rounded-none border-b px-4">
                  <TabsTrigger value="summary" className="text-xs">
                    <FileText className="w-3 h-3 mr-1" />
                    Summary
                  </TabsTrigger>
                  {hasEntities && (
                    <TabsTrigger value="entities" className="text-xs">
                      <Building2 className="w-3 h-3 mr-1" />
                      Entities
                    </TabsTrigger>
                  )}
                  {hasKeyData && (
                    <TabsTrigger value="keydata" className="text-xs">
                      <Tag className="w-3 h-3 mr-1" />
                      Key Data
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="characteristics" className="text-xs">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Characteristics
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="p-4 space-y-4 mt-0">
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Executive Summary</div>
                    <p className="text-sm text-gray-900">{analysis.executiveSummary}</p>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Detailed Summary</div>
                    <p className="text-sm text-gray-700">{analysis.detailedSummary}</p>
                  </div>
                  {analysis.sectionBreakdown && analysis.sectionBreakdown.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Section Breakdown</div>
                      <ul className="text-sm text-gray-600 list-disc list-inside space-y-0.5">
                        {analysis.sectionBreakdown.map((section, i) => (
                          <li key={i}>{section}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </TabsContent>

                {hasEntities && (
                  <TabsContent value="entities" className="p-4 mt-0">
                    <div className="grid grid-cols-2 gap-4">
                      {analysis.entities.people.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <User className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">People</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {analysis.entities.people.map((person, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{person}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {analysis.entities.companies.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <Building2 className="w-3.5 h-3.5 text-purple-600" />
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Companies</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {analysis.entities.companies.map((company, i) => (
                              <Badge key={i} variant="secondary" className="text-xs bg-purple-50">{company}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {analysis.entities.locations.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <MapPin className="w-3.5 h-3.5 text-green-600" />
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Locations</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {analysis.entities.locations.map((location, i) => (
                              <Badge key={i} variant="secondary" className="text-xs bg-green-50">{location}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {analysis.entities.projects.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <FolderKanban className="w-3.5 h-3.5 text-amber-600" />
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Projects</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {analysis.entities.projects.map((project, i) => (
                              <Badge key={i} variant="secondary" className="text-xs bg-amber-50">{project}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                )}

                {hasKeyData && (
                  <TabsContent value="keydata" className="p-4 mt-0">
                    <div className="space-y-4">
                      {analysis.keyTerms.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <Tag className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Key Terms</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {analysis.keyTerms.map((term, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{term}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {analysis.keyDates.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <Calendar className="w-3.5 h-3.5 text-green-600" />
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Key Dates</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {analysis.keyDates.map((date, i) => (
                              <Badge key={i} variant="outline" className="text-xs bg-green-50">{date}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {analysis.keyAmounts.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Key Amounts</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {analysis.keyAmounts.map((amount, i) => (
                              <Badge key={i} variant="outline" className="text-xs bg-amber-50 font-mono">{amount}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                )}

                <TabsContent value="characteristics" className="p-4 mt-0">
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Document Type</div>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.documentCharacteristics.isFinancial && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700">Financial</Badge>
                        )}
                        {analysis.documentCharacteristics.isLegal && (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">Legal</Badge>
                        )}
                        {analysis.documentCharacteristics.isIdentity && (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">Identity</Badge>
                        )}
                        {analysis.documentCharacteristics.isReport && (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700">Report</Badge>
                        )}
                        {analysis.documentCharacteristics.isDesign && (
                          <Badge variant="outline" className="text-xs bg-pink-50 text-pink-700">Design</Badge>
                        )}
                        {analysis.documentCharacteristics.isCorrespondence && (
                          <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700">Correspondence</Badge>
                        )}
                        {analysis.documentCharacteristics.hasMultipleProjects && (
                          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700">Multi-Project</Badge>
                        )}
                        {analysis.documentCharacteristics.isInternal && (
                          <Badge variant="outline" className="text-xs bg-gray-100 text-gray-700">Internal</Badge>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-xs text-gray-500">Content Type</span>
                        <p className="font-medium">{analysis.rawContentType}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Analysis Confidence</span>
                        <p className="font-medium">{(analysis.confidenceInAnalysis * 100).toFixed(0)}%</p>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="p-4 text-center text-sm text-gray-500">
                <p>This document has not been analyzed yet.</p>
                {document.summary && (
                  <p className="mt-2 text-gray-600">{document.summary}</p>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface DocumentsSummaryViewProps {
  documents: DocumentWithAnalysis[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenDocument: (doc: DocumentWithAnalysis) => void;
  title: string;
}

function DocumentsSummaryView({ documents, searchQuery, onSearchChange, onOpenDocument, title }: DocumentsSummaryViewProps) {
  const filteredDocs = useMemo(() => {
    let docs = [...documents];
    // Sort most recent first
    docs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    if (!searchQuery.trim()) return docs;
    const query = searchQuery.toLowerCase();
    return docs.filter(doc =>
      doc.fileName.toLowerCase().includes(query) ||
      doc.documentCode?.toLowerCase().includes(query) ||
      doc.category.toLowerCase().includes(query) ||
      doc.documentAnalysis?.executiveSummary?.toLowerCase().includes(query) ||
      doc.summary?.toLowerCase().includes(query)
    );
  }, [documents, searchQuery]);

  const analyzedCount = documents.filter(d => d.documentAnalysis).length;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileStack className="w-5 h-5" />
            {title}
            <Badge variant="outline" className="text-xs font-normal">
              {analyzedCount}/{documents.length} analyzed
            </Badge>
          </h2>
          <p className="text-sm text-gray-500">Browse document summaries, entities, and key data</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileStack className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-gray-500 mb-2">
              {documents.length === 0 ? 'No documents found' : 'No matching documents'}
            </p>
            <p className="text-sm text-gray-400">
              {documents.length === 0
                ? 'Upload documents to see their summaries here'
                : 'Try adjusting your search terms'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDocs.map((doc) => (
              <DocumentSummaryCard key={doc._id} document={doc} onOpen={onOpenDocument} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface ClientIntelligenceTabProps {
  clientId: Id<"clients">;
  clientName?: string;
  clientType?: string;
  projects?: Array<{
    _id: Id<"projects">;
    name: string;
    status?: string;
    dealPhase?: string;
  }>;
}

type ViewScope = 'client' | { projectId: Id<"projects">; projectName: string };

interface ProjectIntelligenceTabProps {
  projectId: Id<"projects">;
}

export function ClientIntelligenceTab({ clientId, clientName, clientType, projects = [] }: ClientIntelligenceTabProps) {
  // Scope: client-level or a specific project
  const [viewScope, setViewScope] = useState<ViewScope>('client');
  const isClientScope = viewScope === 'client';
  const currentProjectId = isClientScope ? undefined : viewScope.projectId;

  // Use the new knowledge items query - conditionally based on scope
  const clientKnowledgeItemsRaw = useQuery(
    // @ts-ignore - Convex type instantiation is excessively deep
    api.knowledgeLibrary.getKnowledgeItemsByClient,
    isClientScope ? { clientId } : 'skip'
  );
  const projectKnowledgeItemsRaw = useQuery(
    // @ts-ignore - Convex type instantiation is excessively deep
    api.knowledgeLibrary.getKnowledgeItemsByProject,
    currentProjectId ? { projectId: currentProjectId } : 'skip'
  );
  const knowledgeItemsRaw = isClientScope ? clientKnowledgeItemsRaw : projectKnowledgeItemsRaw;

  const clientStats = useQuery(
    api.knowledgeLibrary.getKnowledgeStats,
    isClientScope ? { clientId } : 'skip'
  );
  const projectStats = useQuery(
    api.knowledgeLibrary.getKnowledgeStats,
    currentProjectId ? { projectId: currentProjectId } : 'skip'
  );
  const stats = isClientScope ? clientStats : projectStats;

  // Query for superseded items (to show history)
  const clientSupersededItems = useQuery(
    // @ts-ignore - Convex type instantiation is excessively deep
    api.knowledgeLibrary.getKnowledgeItemsByClient,
    isClientScope ? { clientId, status: 'superseded' as const } : 'skip'
  );
  const projectSupersededItems = useQuery(
    // @ts-ignore - Convex type instantiation is excessively deep
    api.knowledgeLibrary.getKnowledgeItemsByProject,
    currentProjectId ? { projectId: currentProjectId, status: 'superseded' as const } : 'skip'
  );
  const supersededItemsRaw = isClientScope ? clientSupersededItems : projectSupersededItems;

  // Mutations
  const addKnowledgeItem = useMutation(api.knowledgeLibrary.addKnowledgeItem);
  const updateKnowledgeItem = useMutation(api.knowledgeLibrary.updateKnowledgeItem);
  const archiveKnowledgeItem = useMutation(api.knowledgeLibrary.archiveKnowledgeItem);

  // Categories depend on scope
  const categories = isClientScope ? CLIENT_CATEGORIES : PROJECT_CATEGORIES;
  const canonicalFieldsTarget = isClientScope ? 'client' : 'project';

  const [activeCategory, setActiveCategory] = useState<string>(isClientScope ? 'contact' : 'overview');
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItemUI | undefined>();
  const [searchQuery, setSearchQuery] = useState('');

  // View mode: intelligence data or document summaries
  const [viewMode, setViewMode] = useState<'intelligence' | 'documents'>('intelligence');
  const [documentSearchQuery, setDocumentSearchQuery] = useState('');
  const [documentFilter, setDocumentFilter] = useState<{
    documentId: string;
    documentName: string;
  } | null>(null);

  // Document detail panel state
  const [selectedDocForPanel, setSelectedDocForPanel] = useState<DocumentWithAnalysis | null>(null);
  const [isDocPanelOpen, setIsDocPanelOpen] = useState(false);

  const handleOpenDocument = (doc: DocumentWithAnalysis) => {
    setSelectedDocForPanel(doc);
    setIsDocPanelOpen(true);
  };

  const handleCloseDocPanel = () => {
    setIsDocPanelOpen(false);
    setSelectedDocForPanel(null);
  };

  // Documents query for the Documents Summary view
  const clientDocuments = useQuery(
    api.documents.getByClient,
    isClientScope ? { clientId } : 'skip'
  );
  const projectDocuments = useQuery(
    api.documents.getByProject,
    currentProjectId ? { projectId: currentProjectId } : 'skip'
  );
  const documents = (isClientScope ? clientDocuments : projectDocuments) as DocumentWithAnalysis[] | undefined;

  // Reset category when scope changes
  useMemo(() => {
    setActiveCategory(isClientScope ? 'contact' : 'overview');
    setSearchQuery('');
  }, [isClientScope]);

  // Transform to UI items format
  const knowledgeItems: KnowledgeItemUI[] = useMemo(() => {
    if (!knowledgeItemsRaw) return [];

    return knowledgeItemsRaw.map((item) => ({
      _id: item._id,
      fieldPath: item.fieldPath,
      isCanonical: item.isCanonical,
      category: item.category,
      label: item.label,
      value: item.value,
      valueType: item.valueType,
      sourceType: item.sourceType,
      sourceDocumentId: item.sourceDocumentId,
      sourceDocumentName: item.sourceDocumentName,
      normalizationConfidence: item.normalizationConfidence,
      status: item.status,
      addedAt: item.addedAt,
      addedBy: item.addedBy,
      tags: (item as any).tags,
    }));
  }, [knowledgeItemsRaw]);

  // Get unfilled canonical fields for current category
  const unfilledCanonicalFields = useMemo((): UnfilledCanonicalField[] => {
    const categoryFields = getFieldsByCategory(activeCategory, canonicalFieldsTarget);
    const filledPaths = new Set(knowledgeItems.map((item) => item.fieldPath));

    return Object.entries(categoryFields)
      .filter(([path]) => !filledPaths.has(path))
      .map(([path, config]) => ({
        fieldPath: path,
        label: config.label,
        type: config.type,
        description: config.description,
        category: activeCategory,
      }));
  }, [activeCategory, knowledgeItems, canonicalFieldsTarget]);

  // Combine filled items with unfilled placeholders for display
  const displayItems = useMemo((): DisplayItem[] => {
    let filledItems = knowledgeItems.filter((item) => item.category === activeCategory);

    // Apply search filter to filled items only
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filledItems = filledItems.filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          formatDisplayValue(item.value, item.valueType).toLowerCase().includes(query)
      );
    }

    // Convert to display items
    const filled: DisplayItem[] = filledItems.map((item) => ({ type: 'filled', item }));
    const unfilled: DisplayItem[] = unfilledCanonicalFields
      .filter((field) =>
        !searchQuery.trim() ||
        field.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .map((field) => ({ type: 'unfilled', field }));

    // Show filled items first, then unfilled
    return [...filled, ...unfilled];
  }, [knowledgeItems, activeCategory, searchQuery, unfilledCanonicalFields]);

  // Count items by category (only filled items)
  const countsByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    categories.forEach((cat) => {
      counts[cat.key] = knowledgeItems.filter((item) => item.category === cat.key).length;
    });
    return counts;
  }, [knowledgeItems, categories]);

  // Map of history by fieldPath (combines active + superseded items)
  const historyByFieldPath = useMemo(() => {
    const historyMap: Record<string, HistoryItem[]> = {};

    // Add active items
    for (const item of knowledgeItems) {
      if (!historyMap[item.fieldPath]) {
        historyMap[item.fieldPath] = [];
      }
      historyMap[item.fieldPath].push({
        _id: item._id,
        value: item.value,
        valueType: item.valueType,
        sourceDocumentName: item.sourceDocumentName,
        sourceDocumentId: item.sourceDocumentId ? String(item.sourceDocumentId) : undefined,
        addedAt: item.addedAt,
        status: item.status,
      });
    }

    // Add superseded items
    if (supersededItemsRaw) {
      for (const item of supersededItemsRaw) {
        if (!historyMap[item.fieldPath]) {
          historyMap[item.fieldPath] = [];
        }
        historyMap[item.fieldPath].push({
          _id: item._id,
          value: item.value,
          valueType: item.valueType,
          sourceDocumentName: item.sourceDocumentName,
          sourceDocumentId: item.sourceDocumentId ? String(item.sourceDocumentId) : undefined,
          addedAt: item.addedAt,
          status: item.status,
        });
      }
    }

    // Sort each history by date descending, active first
    for (const fieldPath of Object.keys(historyMap)) {
      historyMap[fieldPath].sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        const dateA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
        const dateB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
        return dateB - dateA;
      });
    }

    return historyMap;
  }, [knowledgeItems, supersededItemsRaw]);

  const totalItems = knowledgeItems.length;
  const activeCategoryConfig = categories.find((c) => c.key === activeCategory);
  const filledInCategory = displayItems.filter((d) => d.type === 'filled').length;
  const totalInCategory = displayItems.length;

  // State for filling canonical fields
  const [fillingCanonicalField, setFillingCanonicalField] = useState<UnfilledCanonicalField | undefined>();

  const handleAddItem = () => {
    setEditingItem(undefined);
    setFillingCanonicalField(undefined);
    setShowAddItemModal(true);
  };

  const handleEditItem = (item: KnowledgeItemUI) => {
    setEditingItem(item);
    setFillingCanonicalField(undefined);
    setShowAddItemModal(true);
  };

  const handleFillCanonicalField = (field: UnfilledCanonicalField) => {
    setEditingItem(undefined);
    setFillingCanonicalField(field);
    setShowAddItemModal(true);
  };

  const handleDeleteItem = async (id: Id<"knowledgeItems">) => {
    try {
      await archiveKnowledgeItem({ itemId: id });
    } catch (error) {
      console.error('Failed to archive item:', error);
    }
  };

  const handleSaveItem = async (data: AddItemData) => {
    try {
      // Determine target: client or project based on scope
      const targetArgs = isClientScope
        ? { clientId }
        : { projectId: currentProjectId! };

      if (data._id) {
        // Update existing item
        await updateKnowledgeItem({
          itemId: data._id,
          value: data.value,
          updatedBy: 'manual',
        });
      } else if (fillingCanonicalField) {
        // Filling a canonical field
        await addKnowledgeItem({
          ...targetArgs,
          fieldPath: fillingCanonicalField.fieldPath,
          isCanonical: true,
          category: fillingCanonicalField.category,
          label: fillingCanonicalField.label,
          value: data.value,
          valueType: data.valueType,
          sourceType: 'manual',
          addedBy: 'manual',
        });
      } else {
        // Add new custom item
        const fieldPath = `custom.${data.category}.${data.label.toLowerCase().replace(/\s+/g, '_')}`;
        await addKnowledgeItem({
          ...targetArgs,
          fieldPath,
          isCanonical: false,
          category: data.category,
          label: data.label,
          value: data.value,
          valueType: data.valueType,
          sourceType: 'manual',
          addedBy: 'manual',
        });
      }
      setShowAddItemModal(false);
      setFillingCanonicalField(undefined);
    } catch (error) {
      console.error('Failed to save item:', error);
    }
  };

  // Handle adding a field from the MissingFields component
  const handleAddField = (fieldKey: string) => {
    const allFields = isClientScope
      ? getAllClientFields(clientType === 'lender')
      : getAllProjectFields();
    const fieldDef = allFields.find(f => f.key === fieldKey);
    if (fieldDef) {
      handleFillCanonicalField({
        fieldPath: fieldDef.key,
        label: fieldDef.label,
        type: fieldDef.type || 'text',
        category: getCategoryForField(fieldDef.key),
      });
    }
  };

  // Build evidence trail from history data for the new components
  const evidenceTrail: EvidenceEntry[] = useMemo(() => {
    const trail: EvidenceEntry[] = [];
    for (const [fieldPath, items] of Object.entries(historyByFieldPath)) {
      for (const item of items) {
        trail.push({
          fieldPath,
          value: item.value,
          confidence: 0.9,
          sourceDocumentName: item.sourceDocumentName,
          sourceDocumentId: item.sourceDocumentId,
        });
      }
    }
    return trail;
  }, [historyByFieldPath]);

  // Derive contributing documents from knowledge items
  const contributingDocuments = useMemo(() => {
    return deriveContributingDocuments(knowledgeItems, supersededItemsRaw || []);
  }, [knowledgeItems, supersededItemsRaw]);

  const contributingDocsWithFolders = useMemo(() => {
    if (!documents) return contributingDocuments.map(d => ({ ...d, folderName: undefined }));
    const docFolderMap = new Map<string, string>();
    // Use document category as the grouping label in the dropdown
    for (const doc of documents) {
      docFolderMap.set(String(doc._id), doc.category || 'Unfiled');
    }
    return contributingDocuments.map(d => ({
      ...d,
      folderName: docFolderMap.get(d.id) || 'Unfiled',
    }));
  }, [contributingDocuments, documents]);

  // Items filtered by selected document
  const documentFilteredItems: DocumentFilterItem[] = useMemo(() => {
    if (!documentFilter) return [];

    const items: DocumentFilterItem[] = [];
    const activeFieldDefs = isClientScope
      ? getAllClientFields(clientType === 'lender')
      : getAllProjectFields();

    const seenFieldPaths = new Set<string>();

    for (const item of knowledgeItems) {
      if (!item.sourceDocumentId || String(item.sourceDocumentId) !== documentFilter.documentId) continue;
      if (seenFieldPaths.has(item.fieldPath)) continue;
      seenFieldPaths.add(item.fieldPath);
      const fieldDef = activeFieldDefs.find(f => f.key === item.fieldPath);
      items.push({
        fieldPath: item.fieldPath,
        label: item.label || fieldDef?.label || item.fieldPath,
        value: formatDisplayValue(item.value, item.valueType) as string,
        confidence: item.normalizationConfidence ?? 0.9,
        category: getCategoryForField(item.fieldPath),
        status: 'active',
      });
    }

    if (supersededItemsRaw) {
      for (const item of supersededItemsRaw) {
        if (!item.sourceDocumentId || String(item.sourceDocumentId) !== documentFilter.documentId) continue;
        if (seenFieldPaths.has(item.fieldPath)) continue;
        seenFieldPaths.add(item.fieldPath);

        const activeItem = knowledgeItems.find(k => k.fieldPath === item.fieldPath);
        const fieldDef = activeFieldDefs.find(f => f.key === item.fieldPath);

        items.push({
          fieldPath: item.fieldPath,
          label: item.label || fieldDef?.label || item.fieldPath,
          value: formatDisplayValue(item.value, item.valueType) as string,
          confidence: item.normalizationConfidence ?? 0.9,
          category: getCategoryForField(item.fieldPath),
          status: 'superseded',
          replacedBy: activeItem
            ? {
                value: formatDisplayValue(activeItem.value, activeItem.valueType) as string,
                documentName: activeItem.sourceDocumentName || '',
              }
            : undefined,
        });
      }
    }

    return items;
  }, [documentFilter, knowledgeItems, supersededItemsRaw, isClientScope, clientType]);

  // Compute category summaries for the sidebar
  const clientCategories = useMemo(() => {
    if (!isClientScope) return [];
    return computeClientCategories(knowledgeItems, clientType === 'lender', evidenceTrail);
  }, [isClientScope, knowledgeItems, clientType, evidenceTrail]);

  const projectCategoriesForSidebar = useMemo(() => {
    if (isClientScope) return [];
    return computeProjectCategories(knowledgeItems, evidenceTrail);
  }, [isClientScope, knowledgeItems, evidenceTrail]);

  // Use a name-based active category for the new sidebar
  const [activeSidebarCategory, setActiveSidebarCategory] = useState('Contact Info');

  // Compute the active category's field definitions
  const activeFieldDefs = useMemo(() => {
    return isClientScope
      ? getAllClientFields(clientType === 'lender')
      : getAllProjectFields();
  }, [isClientScope, clientType]);

  // Build intelligence items for the active sidebar category
  const filteredItems = useMemo(() => {
    return buildIntelligenceItems(knowledgeItems, activeFieldDefs, activeSidebarCategory, evidenceTrail);
  }, [knowledgeItems, activeFieldDefs, activeSidebarCategory, evidenceTrail]);

  // Build missing fields for the active sidebar category
  const missingForCategory = useMemo(() => {
    return buildMissingFields(knowledgeItems, activeFieldDefs, activeSidebarCategory);
  }, [knowledgeItems, activeFieldDefs, activeSidebarCategory]);

  // Get active category stats
  const activeCategoryStats = useMemo(() => {
    const allCats = isClientScope ? clientCategories : projectCategoriesForSidebar;
    const found = allCats.find(c => c.name === activeSidebarCategory);
    return found || { filled: 0, total: 0 };
  }, [isClientScope, clientCategories, projectCategoriesForSidebar, activeSidebarCategory]);

  // Overall completeness
  const overallCompleteness = useMemo(() => {
    const allCats = isClientScope ? clientCategories : projectCategoriesForSidebar;
    const totalFilled = allCats.reduce((sum, c) => sum + c.filled, 0);
    const totalFields = allCats.reduce((sum, c) => sum + c.total, 0);
    return totalFields > 0 ? (totalFilled / totalFields) * 100 : 0;
  }, [isClientScope, clientCategories, projectCategoriesForSidebar]);

  return (
    <div className="h-full flex">
      {/* New sidebar with category summaries */}
      <IntelligenceSidebar
        categories={isClientScope ? clientCategories : projectCategoriesForSidebar}
        projectCategories={!isClientScope ? projectCategoriesForSidebar : []}
        activeCategory={documentFilter ? '' : activeSidebarCategory}
        onSelectCategory={(name) => {
          setViewMode('intelligence');
          setActiveSidebarCategory(name);
          setDocumentFilter(null);
        }}
        clientName={clientName || 'Client'}
        clientType={clientType || 'borrower'}
        projectCount={projects.length}
        overallCompleteness={overallCompleteness}
        projects={projects.map(p => ({ id: String(p._id), name: p.name }))}
        activeProjectId={currentProjectId ? String(currentProjectId) : undefined}
        onSelectProject={(id) => {
          const project = projects.find(p => String(p._id) === id);
          if (project) {
            setViewScope({ projectId: project._id, projectName: project.name });
          }
        }}
      />

      {/* Main Content - Conditional based on viewMode */}
      {viewMode === 'documents' ? (
        <DocumentsSummaryView
          documents={documents || []}
          searchQuery={documentSearchQuery}
          onSearchChange={setDocumentSearchQuery}
          onOpenDocument={handleOpenDocument}
          title={isClientScope ? 'Client Document Summaries' : `${(viewScope as { projectName: string }).projectName} Document Summaries`}
        />
      ) : documentFilter ? (
        <DocumentFilteredView
          documentName={documentFilter.documentName}
          items={documentFilteredItems}
          onBack={() => setDocumentFilter(null)}
        />
      ) : (
        <div className="flex-1 overflow-auto p-4">
          {/* Document filter dropdown — top-level control */}
          {contributingDocsWithFolders.length > 0 && (
            <div className="flex items-center justify-end mb-3">
              <DocumentFilterDropdown
                documents={contributingDocsWithFolders}
                onSelect={(doc) => setDocumentFilter(doc)}
              />
            </div>
          )}
          <IntelligenceCardList
            items={filteredItems}
            categoryName={activeSidebarCategory}
            categoryIcon=""
            filled={activeCategoryStats.filled}
            total={activeCategoryStats.total}
            clientId={String(clientId)}
            projectId={currentProjectId ? String(currentProjectId) : undefined}
            evidenceTrail={evidenceTrail}
            onDocumentFilter={(doc) => setDocumentFilter(doc)}
          />
          <IntelligenceMissingFields
            missingFields={missingForCategory}
            onAddField={handleAddField}
            className="mt-4"
          />
        </div>
      )}

      {/* Modals */}
      <AddItemModal
        isOpen={showAddItemModal}
        onClose={() => {
          setShowAddItemModal(false);
          setFillingCanonicalField(undefined);
        }}
        onSave={handleSaveItem}
        categories={categories}
        initialCategory={activeCategory}
        editItem={editingItem}
        fillingCanonicalField={fillingCanonicalField}
      />

      {/* Document Detail Panel */}
      <FileDetailPanel
        document={selectedDocForPanel as any}
        isOpen={isDocPanelOpen}
        onClose={handleCloseDocPanel}
      />
    </div>
  );
}

export function ProjectIntelligenceTab({ projectId }: ProjectIntelligenceTabProps) {
  // Use the new knowledge items query
  const knowledgeItemsRaw = useQuery(api.knowledgeLibrary.getKnowledgeItemsByProject, { projectId });
  const stats = useQuery(api.knowledgeLibrary.getKnowledgeStats, { projectId });

  // Query for superseded items (to show history)
  const supersededItemsRaw = useQuery(
    // @ts-ignore - Convex type instantiation is excessively deep
    api.knowledgeLibrary.getKnowledgeItemsByProject,
    { projectId, status: 'superseded' as const }
  );

  // Documents query for the Documents Summary view
  const projectDocuments = useQuery(api.documents.getByProject, { projectId }) as DocumentWithAnalysis[] | undefined;

  // Mutations
  const addKnowledgeItem = useMutation(api.knowledgeLibrary.addKnowledgeItem);
  const updateKnowledgeItem = useMutation(api.knowledgeLibrary.updateKnowledgeItem);
  const archiveKnowledgeItem = useMutation(api.knowledgeLibrary.archiveKnowledgeItem);

  const [activeCategory, setActiveCategory] = useState<string>('overview');
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItemUI | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');

  // View mode: intelligence data or document summaries
  const [viewMode, setViewMode] = useState<'intelligence' | 'documents'>('intelligence');
  const [documentSearchQuery, setDocumentSearchQuery] = useState('');
  const [documentFilter, setDocumentFilter] = useState<{
    documentId: string;
    documentName: string;
  } | null>(null);

  // Document detail panel state
  const [selectedDocForPanel, setSelectedDocForPanel] = useState<DocumentWithAnalysis | null>(null);
  const [isDocPanelOpen, setIsDocPanelOpen] = useState(false);

  const handleOpenDocument = (doc: DocumentWithAnalysis) => {
    setSelectedDocForPanel(doc);
    setIsDocPanelOpen(true);
  };

  const handleCloseDocPanel = () => {
    setIsDocPanelOpen(false);
    setSelectedDocForPanel(null);
  };

  // Transform to UI items format
  const knowledgeItems: KnowledgeItemUI[] = useMemo(() => {
    if (!knowledgeItemsRaw) return [];

    return knowledgeItemsRaw.map((item) => ({
      _id: item._id,
      fieldPath: item.fieldPath,
      isCanonical: item.isCanonical,
      category: item.category,
      label: item.label,
      value: item.value,
      valueType: item.valueType,
      sourceType: item.sourceType,
      sourceDocumentId: item.sourceDocumentId,
      sourceDocumentName: item.sourceDocumentName,
      normalizationConfidence: item.normalizationConfidence,
      status: item.status,
      addedAt: item.addedAt,
      addedBy: item.addedBy,
      tags: (item as any).tags,
    }));
  }, [knowledgeItemsRaw]);

  // Get unfilled canonical fields for current category
  const unfilledCanonicalFields = useMemo((): UnfilledCanonicalField[] => {
    const categoryFields = getFieldsByCategory(activeCategory, 'project');
    const filledPaths = new Set(knowledgeItems.map((item) => item.fieldPath));

    return Object.entries(categoryFields)
      .filter(([path]) => !filledPaths.has(path))
      .map(([path, config]) => ({
        fieldPath: path,
        label: config.label,
        type: config.type,
        description: config.description,
        category: activeCategory,
      }));
  }, [activeCategory, knowledgeItems]);

  // Combine filled items with unfilled placeholders for display
  const displayItems = useMemo((): DisplayItem[] => {
    let filledItems = knowledgeItems.filter((item) => item.category === activeCategory);

    // Apply tag filter
    if (selectedTagFilter !== 'all') {
      filledItems = filledItems.filter(
        (item) => item.tags?.includes(selectedTagFilter)
      );
    }

    // Apply search filter to filled items only
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filledItems = filledItems.filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          formatDisplayValue(item.value, item.valueType).toLowerCase().includes(query)
      );
    }

    // Convert to display items
    const filled: DisplayItem[] = filledItems.map((item) => ({ type: 'filled', item }));
    const unfilled: DisplayItem[] = selectedTagFilter === 'all'
      ? unfilledCanonicalFields
          .filter((field) =>
            !searchQuery.trim() ||
            field.label.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .map((field) => ({ type: 'unfilled', field }))
      : []; // Hide unfilled placeholders when filtering by tag

    // Show filled items first, then unfilled
    return [...filled, ...unfilled];
  }, [knowledgeItems, activeCategory, searchQuery, unfilledCanonicalFields, selectedTagFilter]);

  // Count items by category (only filled items)
  const countsByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    PROJECT_CATEGORIES.forEach((cat) => {
      counts[cat.key] = knowledgeItems.filter((item) => item.category === cat.key).length;
    });
    return counts;
  }, [knowledgeItems]);

  // Map of history by fieldPath (combines active + superseded items)
  const historyByFieldPath = useMemo(() => {
    const historyMap: Record<string, HistoryItem[]> = {};

    // Add active items
    for (const item of knowledgeItems) {
      if (!historyMap[item.fieldPath]) {
        historyMap[item.fieldPath] = [];
      }
      historyMap[item.fieldPath].push({
        _id: item._id,
        value: item.value,
        valueType: item.valueType,
        sourceDocumentName: item.sourceDocumentName,
        sourceDocumentId: item.sourceDocumentId ? String(item.sourceDocumentId) : undefined,
        addedAt: item.addedAt,
        status: item.status,
      });
    }

    // Add superseded items
    if (supersededItemsRaw) {
      for (const item of supersededItemsRaw) {
        if (!historyMap[item.fieldPath]) {
          historyMap[item.fieldPath] = [];
        }
        historyMap[item.fieldPath].push({
          _id: item._id,
          value: item.value,
          valueType: item.valueType,
          sourceDocumentName: item.sourceDocumentName,
          sourceDocumentId: item.sourceDocumentId ? String(item.sourceDocumentId) : undefined,
          addedAt: item.addedAt,
          status: item.status,
        });
      }
    }

    // Sort each history by date descending, active first
    for (const fieldPath of Object.keys(historyMap)) {
      historyMap[fieldPath].sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        const dateA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
        const dateB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
        return dateB - dateA;
      });
    }

    return historyMap;
  }, [knowledgeItems, supersededItemsRaw]);

  const totalItems = knowledgeItems.length;
  const activeCategoryConfig = PROJECT_CATEGORIES.find((c) => c.key === activeCategory);
  const filledInCategory = displayItems.filter((d) => d.type === 'filled').length;
  const totalInCategory = displayItems.length;

  // State for filling canonical fields
  const [fillingCanonicalField, setFillingCanonicalField] = useState<UnfilledCanonicalField | undefined>();

  const handleAddItem = () => {
    setEditingItem(undefined);
    setFillingCanonicalField(undefined);
    setShowAddItemModal(true);
  };

  const handleEditItem = (item: KnowledgeItemUI) => {
    setEditingItem(item);
    setFillingCanonicalField(undefined);
    setShowAddItemModal(true);
  };

  const handleFillCanonicalField = (field: UnfilledCanonicalField) => {
    setEditingItem(undefined);
    setFillingCanonicalField(field);
    setShowAddItemModal(true);
  };

  const handleDeleteItem = async (id: Id<"knowledgeItems">) => {
    try {
      await archiveKnowledgeItem({ itemId: id });
    } catch (error) {
      console.error('Failed to archive item:', error);
    }
  };

  const handleSaveItem = async (data: AddItemData) => {
    try {
      if (data._id) {
        // Update existing item
        await updateKnowledgeItem({
          itemId: data._id,
          value: data.value,
          updatedBy: 'manual',
        });
      } else if (fillingCanonicalField) {
        // Filling a canonical field
        await addKnowledgeItem({
          projectId,
          fieldPath: fillingCanonicalField.fieldPath,
          isCanonical: true,
          category: fillingCanonicalField.category,
          label: fillingCanonicalField.label,
          value: data.value,
          valueType: data.valueType,
          sourceType: 'manual',
          addedBy: 'manual',
        });
      } else {
        // Add new custom item
        const fieldPath = `custom.${data.category}.${data.label.toLowerCase().replace(/\s+/g, '_')}`;
        await addKnowledgeItem({
          projectId,
          fieldPath,
          isCanonical: false,
          category: data.category,
          label: data.label,
          value: data.value,
          valueType: data.valueType,
          sourceType: 'manual',
          addedBy: 'manual',
        });
      }
      setShowAddItemModal(false);
      setFillingCanonicalField(undefined);
    } catch (error) {
      console.error('Failed to save item:', error);
    }
  };

  // Handle adding a field from the MissingFields component
  const handleAddField = (fieldKey: string) => {
    const allFields = getAllProjectFields();
    const fieldDef = allFields.find(f => f.key === fieldKey);
    if (fieldDef) {
      handleFillCanonicalField({
        fieldPath: fieldDef.key,
        label: fieldDef.label,
        type: fieldDef.type || 'text',
        category: getCategoryForField(fieldDef.key),
      });
    }
  };

  // Build evidence trail from history data for the new components
  const evidenceTrail: EvidenceEntry[] = useMemo(() => {
    const trail: EvidenceEntry[] = [];
    for (const [fieldPath, items] of Object.entries(historyByFieldPath)) {
      for (const item of items) {
        trail.push({
          fieldPath,
          value: item.value,
          confidence: 0.9,
          sourceDocumentName: item.sourceDocumentName,
          sourceDocumentId: item.sourceDocumentId,
        });
      }
    }
    return trail;
  }, [historyByFieldPath]);

  // Derive contributing documents from knowledge items
  const contributingDocuments = useMemo(() => {
    return deriveContributingDocuments(knowledgeItems, supersededItemsRaw || []);
  }, [knowledgeItems, supersededItemsRaw]);

  const contributingDocsWithFolders = useMemo(() => {
    if (!projectDocuments) return contributingDocuments.map(d => ({ ...d, folderName: undefined }));
    const docFolderMap = new Map<string, string>();
    for (const doc of projectDocuments as DocumentWithAnalysis[]) {
      docFolderMap.set(String(doc._id), doc.category || 'Unfiled');
    }
    return contributingDocuments.map(d => ({
      ...d,
      folderName: docFolderMap.get(d.id) || 'Unfiled',
    }));
  }, [contributingDocuments, projectDocuments]);

  // Items filtered by selected document
  const documentFilteredItems: DocumentFilterItem[] = useMemo(() => {
    if (!documentFilter) return [];
    const items: DocumentFilterItem[] = [];
    const allFieldDefs = getAllProjectFields();
    const seenFieldPaths = new Set<string>();

    for (const item of knowledgeItems) {
      if (!item.sourceDocumentId || String(item.sourceDocumentId) !== documentFilter.documentId) continue;
      if (seenFieldPaths.has(item.fieldPath)) continue;
      seenFieldPaths.add(item.fieldPath);
      const fieldDef = allFieldDefs.find(f => f.key === item.fieldPath);
      items.push({
        fieldPath: item.fieldPath,
        label: item.label || fieldDef?.label || item.fieldPath,
        value: formatDisplayValue(item.value, item.valueType) as string,
        confidence: item.normalizationConfidence ?? 0.9,
        category: getCategoryForField(item.fieldPath),
        status: 'active',
      });
    }

    if (supersededItemsRaw) {
      for (const item of supersededItemsRaw) {
        if (!item.sourceDocumentId || String(item.sourceDocumentId) !== documentFilter.documentId) continue;
        if (seenFieldPaths.has(item.fieldPath)) continue;
        seenFieldPaths.add(item.fieldPath);
        const activeItem = knowledgeItems.find(k => k.fieldPath === item.fieldPath);
        const fieldDef = allFieldDefs.find(f => f.key === item.fieldPath);
        items.push({
          fieldPath: item.fieldPath,
          label: item.label || fieldDef?.label || item.fieldPath,
          value: formatDisplayValue(item.value, item.valueType) as string,
          confidence: item.normalizationConfidence ?? 0.9,
          category: getCategoryForField(item.fieldPath),
          status: 'superseded',
          replacedBy: activeItem
            ? { value: formatDisplayValue(activeItem.value, activeItem.valueType) as string, documentName: activeItem.sourceDocumentName || '' }
            : undefined,
        });
      }
    }

    return items;
  }, [documentFilter, knowledgeItems, supersededItemsRaw]);

  // Compute category summaries for the sidebar
  const projectCategoriesComputed = useMemo(() => {
    return computeProjectCategories(knowledgeItems, evidenceTrail);
  }, [knowledgeItems, evidenceTrail]);

  // Use a name-based active category for the new sidebar
  const [activeSidebarCategory, setActiveSidebarCategory] = useState('Loan Terms');

  // Build intelligence items for the active sidebar category
  const projectFieldDefs = useMemo(() => getAllProjectFields(), []);

  const filteredItems = useMemo(() => {
    return buildIntelligenceItems(knowledgeItems, projectFieldDefs, activeSidebarCategory, evidenceTrail);
  }, [knowledgeItems, projectFieldDefs, activeSidebarCategory, evidenceTrail]);

  // Build missing fields for the active sidebar category
  const missingForCategory = useMemo(() => {
    return buildMissingFields(knowledgeItems, projectFieldDefs, activeSidebarCategory);
  }, [knowledgeItems, projectFieldDefs, activeSidebarCategory]);

  // Get active category stats
  const activeCategoryStats = useMemo(() => {
    const found = projectCategoriesComputed.find(c => c.name === activeSidebarCategory);
    return found || { filled: 0, total: 0 };
  }, [projectCategoriesComputed, activeSidebarCategory]);

  // Overall completeness
  const overallCompleteness = useMemo(() => {
    const totalFilled = projectCategoriesComputed.reduce((sum, c) => sum + c.filled, 0);
    const totalFields = projectCategoriesComputed.reduce((sum, c) => sum + c.total, 0);
    return totalFields > 0 ? (totalFilled / totalFields) * 100 : 0;
  }, [projectCategoriesComputed]);

  return (
    <div className="h-full flex">
      {/* New sidebar with category summaries */}
      <IntelligenceSidebar
        categories={[]}
        projectCategories={projectCategoriesComputed}
        activeCategory={documentFilter ? '' : activeSidebarCategory}
        onSelectCategory={(name) => {
          setViewMode('intelligence');
          setActiveSidebarCategory(name);
          setDocumentFilter(null);
        }}
        clientName="Project"
        clientType="project"
        projectCount={0}
        overallCompleteness={overallCompleteness}
      />

      {/* Main Content - Conditional based on viewMode */}
      {viewMode === 'documents' ? (
        <DocumentsSummaryView
          documents={projectDocuments || []}
          searchQuery={documentSearchQuery}
          onSearchChange={setDocumentSearchQuery}
          onOpenDocument={handleOpenDocument}
          title="Project Document Summaries"
        />
      ) : documentFilter ? (
        <DocumentFilteredView
          documentName={documentFilter.documentName}
          items={documentFilteredItems}
          onBack={() => setDocumentFilter(null)}
        />
      ) : (
        <div className="flex-1 overflow-auto p-4">
          {contributingDocsWithFolders.length > 0 && (
            <div className="flex items-center justify-end mb-3">
              <DocumentFilterDropdown
                documents={contributingDocsWithFolders}
                onSelect={(doc) => setDocumentFilter(doc)}
              />
            </div>
          )}
          <IntelligenceCardList
            items={filteredItems}
            categoryName={activeSidebarCategory}
            categoryIcon=""
            filled={activeCategoryStats.filled}
            total={activeCategoryStats.total}
            clientId={String(projectId)}
            evidenceTrail={evidenceTrail}
            onDocumentFilter={(doc) => setDocumentFilter(doc)}
          />
          <IntelligenceMissingFields
            missingFields={missingForCategory}
            onAddField={handleAddField}
            className="mt-4"
          />
        </div>
      )}

      {/* Modals */}
      <AddItemModal
        isOpen={showAddItemModal}
        onClose={() => {
          setShowAddItemModal(false);
          setFillingCanonicalField(undefined);
        }}
        onSave={handleSaveItem}
        categories={PROJECT_CATEGORIES}
        initialCategory={activeCategory}
        editItem={editingItem}
        fillingCanonicalField={fillingCanonicalField}
      />

      {/* Document Detail Panel */}
      <FileDetailPanel
        document={selectedDocForPanel as any}
        isOpen={isDocPanelOpen}
        onClose={handleCloseDocPanel}
      />
    </div>
  );
}

// Default export
export default function IntelligenceTab({
  clientId,
  projectId,
  clientType,
}: {
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
  clientType?: string;
}) {
  if (projectId) {
    return <ProjectIntelligenceTab projectId={projectId} />;
  }
  if (clientId) {
    return <ClientIntelligenceTab clientId={clientId} clientType={clientType} />;
  }
  return <div className="p-4 text-gray-500">No client or project selected</div>;
}
