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
  Filter,
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

// ============================================================================
// TYPES
// ============================================================================

// UI representation of a knowledge item
interface KnowledgeItemUI {
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
  addedAt: string;
  status: string;
}

function KnowledgeItemCard({
  item,
  onEdit,
  onDelete,
  historyItems,
  onShowHistory,
}: {
  item: KnowledgeItemUI;
  onEdit: (item: KnowledgeItemUI) => void;
  onDelete: (id: Id<"knowledgeItems">) => void;
  historyItems?: HistoryItem[];
  onShowHistory?: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const hasHistory = historyItems && historyItems.length > 1;
  const supersededCount = hasHistory ? historyItems.filter(h => h.status === 'superseded').length : 0;

  const sourceLabel = item.sourceType === 'ai_extraction' ? 'AI'
    : item.sourceType === 'document' ? 'Doc'
    : item.sourceType === 'manual' ? 'Manual'
    : item.sourceType === 'data_library' ? 'Library'
    : item.sourceType;

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{item.label}</span>
            {item.isCanonical && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-600 border-blue-200 bg-blue-50">
                <Star className="w-2.5 h-2.5 mr-0.5 fill-blue-500" />
                Core
              </Badge>
            )}
            {!item.isCanonical && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-purple-600 border-purple-200 bg-purple-50">
                <Tag className="w-2.5 h-2.5 mr-0.5" />
                Custom
              </Badge>
            )}
            {sourceLabel && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-gray-500">
                {sourceLabel}
              </Badge>
            )}
            {item.normalizationConfidence && item.normalizationConfidence < 0.8 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600">
                {Math.round(item.normalizationConfidence * 100)}%
              </Badge>
            )}
            {item.tags && item.tags.filter(t => t !== 'general').length > 0 && (
              <>
                {item.tags.filter(t => t !== 'general').slice(0, 3).map(tag => (
                  <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-200 bg-emerald-50">
                    {tag.replace(/_/g, ' ')}
                  </Badge>
                ))}
                {item.tags.filter(t => t !== 'general').length > 3 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-gray-400">
                    +{item.tags.filter(t => t !== 'general').length - 3}
                  </Badge>
                )}
              </>
            )}
            {supersededCount > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 text-orange-600 border-orange-200 bg-orange-50 cursor-pointer hover:bg-orange-100"
                onClick={() => setShowHistory(!showHistory)}
              >
                <Clock className="w-2.5 h-2.5 mr-0.5" />
                {supersededCount} prior
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {formatDisplayValue(item.value, item.valueType)}
          </p>
          <div className="flex items-center gap-2 mt-2">
            {item.addedAt && (
              <span className="text-xs text-gray-400">
                {new Date(item.addedAt).toLocaleDateString()}
              </span>
            )}
            {item.addedBy && item.addedBy !== 'manual' && (
              <span className="text-xs text-gray-400">• {item.addedBy}</span>
            )}
            {item.sourceDocumentName && (
              <span className="text-xs text-blue-500 truncate max-w-[150px]" title={item.sourceDocumentName}>
                • {item.sourceDocumentName}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(item)}>
            <Pencil className="w-3 h-3 text-gray-400" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDelete(item._id)}>
            <Trash2 className="w-3 h-3 text-red-400" />
          </Button>
        </div>
      </div>

      {/* History section - shows superseded values */}
      {showHistory && historyItems && historyItems.length > 1 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-medium text-gray-600">Value History</span>
          </div>
          <div className="space-y-2 pl-5">
            {historyItems
              .filter(h => h.status === 'superseded')
              .map((historyItem) => (
                <div
                  key={historyItem._id}
                  className="text-xs p-2 bg-gray-50 rounded border border-gray-100"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500 line-through">
                      {formatDisplayValue(historyItem.value, historyItem.valueType)}
                    </span>
                    <span className="text-gray-400 shrink-0">
                      {historyItem.addedAt ? new Date(historyItem.addedAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                  {historyItem.sourceDocumentName && (
                    <span className="text-gray-400 text-[10px]">
                      From: {historyItem.sourceDocumentName}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Component for unfilled canonical field placeholder
function UnfilledFieldCard({
  field,
  onFill,
}: {
  field: UnfilledCanonicalField;
  onFill: (field: UnfilledCanonicalField) => void;
}) {
  return (
    <div
      className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded-lg hover:border-blue-300 hover:bg-blue-50/30 transition-colors group cursor-pointer"
      onClick={() => onFill(field)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <CircleDashed className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm font-medium text-gray-500">{field.label}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-gray-400 border-gray-300">
              <Star className="w-2.5 h-2.5 mr-0.5" />
              Core Field
            </Badge>
          </div>
          {field.description && (
            <p className="text-xs text-gray-400 italic">{field.description}</p>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
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

function SidebarCategory({
  category,
  count,
  isActive,
  onClick,
  isMinimized,
}: {
  category: CategoryConfig;
  count: number;
  isActive: boolean;
  onClick: () => void;
  isMinimized: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
        isActive
          ? 'bg-blue-50 text-blue-700 border border-blue-200'
          : count > 0
          ? 'hover:bg-gray-100 text-gray-700'
          : 'hover:bg-gray-50 text-gray-400'
      }`}
      title={isMinimized ? `${category.label} (${count})` : undefined}
    >
      <span className={isActive ? 'text-blue-600' : count > 0 ? 'text-gray-500' : 'text-gray-300'}>
        {category.icon}
      </span>
      {!isMinimized && (
        <>
          <span className="flex-1 text-sm font-medium truncate">{category.label}</span>
          {count > 0 && (
            <Badge
              variant={isActive ? 'default' : 'secondary'}
              className={`text-xs ${isActive ? 'bg-blue-600' : ''}`}
            >
              {count}
            </Badge>
          )}
        </>
      )}
      {isMinimized && count > 0 && (
        <Badge
          variant={isActive ? 'default' : 'secondary'}
          className={`text-xs absolute -right-1 -top-1 ${isActive ? 'bg-blue-600' : ''}`}
        >
          {count}
        </Badge>
      )}
    </button>
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

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className={`flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col transition-all duration-200 ${
        sidebarMinimized ? 'w-16' : 'w-64'
      }`}>
        {/* Sidebar Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          {!sidebarMinimized && (
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Intelligence</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setSidebarMinimized(!sidebarMinimized)}
          >
            {sidebarMinimized ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>

        {/* Scope Selection: Client + Projects */}
        {!sidebarMinimized && (
          <div className="border-b border-gray-200">
            {/* Client Entry */}
            <button
              onClick={() => setViewScope('client')}
              className={`w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors ${
                isClientScope
                  ? 'bg-blue-50 border-l-2 border-blue-600'
                  : 'hover:bg-gray-100 border-l-2 border-transparent'
              }`}
            >
              <Building2 className={`w-4 h-4 ${isClientScope ? 'text-blue-600' : 'text-gray-500'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isClientScope ? 'text-blue-700' : 'text-gray-700'}`}>
                  {clientName || 'Client'}
                </p>
                <p className="text-xs text-gray-500">Client-level data</p>
              </div>
              {clientStats && (
                <Badge variant="secondary" className="text-[10px]">
                  {clientStats.total}
                </Badge>
              )}
            </button>

            {/* Projects Section */}
            {projects.length > 0 && (
              <div className="py-2">
                <div className="px-3 py-1">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Projects</span>
                </div>
                {projects.map((project) => {
                  const isSelected = !isClientScope && viewScope.projectId === project._id;
                  return (
                    <button
                      key={project._id}
                      onClick={() => setViewScope({ projectId: project._id, projectName: project.name })}
                      className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-purple-50 border-l-2 border-purple-600'
                          : 'hover:bg-gray-100 border-l-2 border-transparent'
                      }`}
                    >
                      <FolderKanban className={`w-4 h-4 ${isSelected ? 'text-purple-600' : 'text-gray-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isSelected ? 'text-purple-700' : 'text-gray-700'}`}>
                          {project.name}
                        </p>
                        {project.dealPhase && (
                          <p className="text-xs text-gray-400">{project.dealPhase.replace('_', ' ')}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Categories Header */}
        {!sidebarMinimized && (
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Categories</span>
            {stats && (
              <span className="ml-2 text-xs text-gray-400">
                {stats.canonical} core / {stats.custom} custom
              </span>
            )}
          </div>
        )}

        {/* Categories */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {categories.map((category) => (
            <SidebarCategory
              key={category.key}
              category={category}
              count={countsByCategory[category.key] || 0}
              isActive={viewMode === 'intelligence' && activeCategory === category.key}
              onClick={() => {
                setViewMode('intelligence');
                setActiveCategory(category.key);
              }}
              isMinimized={sidebarMinimized}
            />
          ))}
        </div>

        {/* Document Summaries Section */}
        {!sidebarMinimized && (
          <div className="px-3 py-2 border-t border-gray-100">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Views</span>
          </div>
        )}
        <div className="p-2">
          <button
            onClick={() => setViewMode('documents')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors relative ${
              sidebarMinimized ? 'justify-center' : ''
            } ${
              viewMode === 'documents'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
            title={sidebarMinimized ? `Document Summaries (${documents?.length || 0})` : undefined}
          >
            <FileStack className={`w-4 h-4 ${viewMode === 'documents' ? 'text-emerald-600' : 'text-gray-500'}`} />
            {!sidebarMinimized && (
              <>
                <span className="flex-1 text-sm font-medium truncate">Document Summaries</span>
                {documents && documents.length > 0 && (
                  <Badge
                    variant={viewMode === 'documents' ? 'default' : 'secondary'}
                    className={`text-xs ${viewMode === 'documents' ? 'bg-emerald-600' : ''}`}
                  >
                    {documents.length}
                  </Badge>
                )}
              </>
            )}
          </button>
        </div>

        {/* Sidebar Footer */}
        {!sidebarMinimized && (
          <div className="p-3 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              {totalItems} total item{totalItems !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Main Content - Conditional based on viewMode */}
      {viewMode === 'documents' ? (
        <DocumentsSummaryView
          documents={documents || []}
          searchQuery={documentSearchQuery}
          onSearchChange={setDocumentSearchQuery}
          onOpenDocument={handleOpenDocument}
          title={isClientScope ? 'Client Document Summaries' : `${(viewScope as { projectName: string }).projectName} Document Summaries`}
        />
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {activeCategoryConfig?.icon}
                {activeCategoryConfig?.label}
                {totalInCategory > 0 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {filledInCategory}/{totalInCategory} filled
                  </Badge>
                )}
              </h2>
              <p className="text-sm text-gray-500">{activeCategoryConfig?.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-48"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleAddItem} className="gap-1">
                <Plus className="w-4 h-4" />
                Add Custom
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {displayItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-gray-300 mb-4">{activeCategoryConfig?.icon}</div>
                <p className="text-gray-500 mb-2">No {activeCategoryConfig?.label?.toLowerCase()} fields available</p>
                <p className="text-sm text-gray-400 mb-4">
                  Upload and analyze documents to automatically extract intelligence
                </p>
                <Button variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Custom
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {displayItems.map((displayItem) =>
                  displayItem.type === 'filled' ? (
                    <KnowledgeItemCard
                      key={displayItem.item._id}
                      item={displayItem.item}
                      onEdit={handleEditItem}
                      onDelete={handleDeleteItem}
                      historyItems={historyByFieldPath[displayItem.item.fieldPath]}
                    />
                  ) : (
                    <UnfilledFieldCard
                      key={displayItem.field.fieldPath}
                      field={displayItem.field}
                      onFill={handleFillCanonicalField}
                    />
                  )
                )}
              </div>
            )}
          </div>
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

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className={`flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col transition-all duration-200 ${
        sidebarMinimized ? 'w-16' : 'w-56'
      }`}>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          {!sidebarMinimized && (
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Knowledge</span>
              {stats && (
                <Badge variant="secondary" className="text-xs">
                  {stats.canonical} core / {stats.custom} custom
                </Badge>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setSidebarMinimized(!sidebarMinimized)}
          >
            {sidebarMinimized ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {PROJECT_CATEGORIES.map((category) => (
            <SidebarCategory
              key={category.key}
              category={category}
              count={countsByCategory[category.key] || 0}
              isActive={viewMode === 'intelligence' && activeCategory === category.key}
              onClick={() => {
                setViewMode('intelligence');
                setActiveCategory(category.key);
              }}
              isMinimized={sidebarMinimized}
            />
          ))}
        </div>

        {/* Document Summaries Section */}
        {!sidebarMinimized && (
          <div className="px-3 py-2 border-t border-gray-100">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Views</span>
          </div>
        )}
        <div className="p-2">
          <button
            onClick={() => setViewMode('documents')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors relative ${
              sidebarMinimized ? 'justify-center' : ''
            } ${
              viewMode === 'documents'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
            title={sidebarMinimized ? `Document Summaries (${projectDocuments?.length || 0})` : undefined}
          >
            <FileStack className={`w-4 h-4 ${viewMode === 'documents' ? 'text-emerald-600' : 'text-gray-500'}`} />
            {!sidebarMinimized && (
              <>
                <span className="flex-1 text-sm font-medium truncate">Document Summaries</span>
                {projectDocuments && projectDocuments.length > 0 && (
                  <Badge
                    variant={viewMode === 'documents' ? 'default' : 'secondary'}
                    className={`text-xs ${viewMode === 'documents' ? 'bg-emerald-600' : ''}`}
                  >
                    {projectDocuments.length}
                  </Badge>
                )}
              </>
            )}
          </button>
        </div>

        {!sidebarMinimized && (
          <div className="p-3 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              {totalItems} total item{totalItems !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Main Content - Conditional based on viewMode */}
      {viewMode === 'documents' ? (
        <DocumentsSummaryView
          documents={projectDocuments || []}
          searchQuery={documentSearchQuery}
          onSearchChange={setDocumentSearchQuery}
          onOpenDocument={handleOpenDocument}
          title="Project Document Summaries"
        />
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {activeCategoryConfig?.icon}
                {activeCategoryConfig?.label}
                {totalInCategory > 0 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {filledInCategory}/{totalInCategory} filled
                  </Badge>
                )}
              </h2>
              <p className="text-sm text-gray-500">{activeCategoryConfig?.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-48"
                />
              </div>
              <Select value={selectedTagFilter} onValueChange={setSelectedTagFilter}>
                <SelectTrigger className="w-[160px] h-9">
                  <Filter className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                  <SelectValue placeholder="Filter by tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  <SelectItem value="lenders_note">Lender&apos;s Note</SelectItem>
                  <SelectItem value="credit_submission">Credit Submission</SelectItem>
                  <SelectItem value="proposal">Proposal</SelectItem>
                  <SelectItem value="deal_summary">Deal Summary</SelectItem>
                  <SelectItem value="due_diligence">Due Diligence</SelectItem>
                  <SelectItem value="risk_assessment">Risk Assessment</SelectItem>
                  <SelectItem value="valuation_summary">Valuation Summary</SelectItem>
                  <SelectItem value="legal_summary">Legal Summary</SelectItem>
                  <SelectItem value="monitoring">Monitoring</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleAddItem} className="gap-1">
                <Plus className="w-4 h-4" />
                Add Custom
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {displayItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-gray-300 mb-4">{activeCategoryConfig?.icon}</div>
                <p className="text-gray-500 mb-2">No {activeCategoryConfig?.label?.toLowerCase()} fields available</p>
                <p className="text-sm text-gray-400 mb-4">
                  Upload and analyze documents to automatically extract intelligence
                </p>
                <Button variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Custom
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {displayItems.map((displayItem) =>
                  displayItem.type === 'filled' ? (
                    <KnowledgeItemCard
                      key={displayItem.item._id}
                      item={displayItem.item}
                      onEdit={handleEditItem}
                      onDelete={handleDeleteItem}
                      historyItems={historyByFieldPath[displayItem.item.fieldPath]}
                    />
                  ) : (
                    <UnfilledFieldCard
                      key={displayItem.field.fieldPath}
                      field={displayItem.field}
                    onFill={handleFillCanonicalField}
                  />
                )
              )}
            </div>
          )}
        </div>
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
