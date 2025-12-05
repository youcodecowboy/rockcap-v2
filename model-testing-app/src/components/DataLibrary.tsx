'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import DocumentTabs, { DocumentTab } from './DocumentTabs';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Download, AlertTriangle, Check, Loader2, ChevronDown, ChevronRight, Plus, Layers, RefreshCw, Trash2, Zap, Search, X, FileStack, GitCompare, Database, History, ArrowUpRight, LayoutGrid, Pencil, Calculator, RotateCcw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { MappingConfirmationModal } from './MappingConfirmationModal';
import { AddDataLibraryItemModal } from './AddDataLibraryItemModal';
import { isCompoundItem } from '@/lib/fastPassCodification';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ModelLibraryDropdown from './ModelLibraryDropdown';

// View modes for the data library
type ViewMode = 'all-data' | 'by-document' | 'changes';

// Project data item type (from unified library)
interface ProjectDataItem {
  _id: Id<'projectDataItems'> | string; // Can be string for computed items
  projectId: Id<'projects'>;
  itemCode: string;
  category: string;
  originalName: string;
  currentValue: any;
  currentValueNormalized: number;
  currentSourceDocumentId: Id<'documents'> | string;
  currentSourceDocumentName: string;
  currentDataType: string;
  lastUpdatedAt: string;
  lastUpdatedBy: 'extraction' | 'manual';
  hasMultipleSources: boolean;
  valueVariance?: number;
  valueHistory: Array<{
    value: any;
    valueNormalized: number;
    sourceDocumentId: Id<'documents'>;
    sourceDocumentName: string;
    addedAt: string;
    addedBy: 'extraction' | 'manual';
    isCurrentValue: boolean;
    wasReverted?: boolean;
  }>;
  isDeleted?: boolean;
  // Computed totals fields
  isComputed?: boolean;
  computedFromCategory?: string;
  computedItemCount?: number;
  computedTotal?: number; // Original computed value when override exists
}

// Types for codified items
interface CodifiedItem {
  id: string;
  originalName: string;
  itemCode?: string;
  suggestedCode?: string;
  suggestedCodeId?: string;
  value: any;
  dataType: string;
  category: string;
  mappingStatus: 'matched' | 'suggested' | 'pending_review' | 'confirmed' | 'unmatched';
  confidence: number;
}

interface CodifiedExtraction {
  _id: Id<'codifiedExtractions'>;
  documentId: Id<'documents'>;
  items: CodifiedItem[];
  mappingStats: {
    matched: number;
    suggested: number;
    pendingReview: number;
    confirmed: number;
    unmatched: number;
  };
  fastPassCompleted: boolean;
  smartPassCompleted: boolean;
  isFullyConfirmed: boolean;
  mergedToProjectLibrary?: boolean;
}

interface DataLibraryProps {
  projectId: Id<'projects'> | null;
  clientName: string | null;
  documents: Array<{
    _id: Id<'documents'>;
    fileName: string;
    extractedData?: any;
    uploadedAt: string;
  }>;
  activeDocumentId: Id<'documents'> | null;
  onDocumentChange: (documentId: Id<'documents'>) => void;
  onDataChange?: (data: any[][]) => void;
  onModelSelect?: (templateId: Id<'modelingTemplates'>, quickExportMode: boolean) => void;
  onOptimizedModelSelect?: (templateId: Id<'templateDefinitions'>, quickExportMode: boolean) => void;
  isModelDisabled?: boolean;
  quickExportMode?: boolean;
  onQuickExportModeChange?: (enabled: boolean) => void;
}

// Status badge component
const StatusBadge: React.FC<{ status: CodifiedItem['mappingStatus']; confidence: number }> = ({ status, confidence }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'matched':
        return { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500', label: 'Matched' };
      case 'suggested':
        return { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', label: `Suggested (${Math.round(confidence * 100)}%)` };
      case 'pending_review':
        return { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', label: 'Needs Review' };
      case 'confirmed':
        return { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500', label: 'Confirmed' };
      case 'unmatched':
        return { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500', label: 'Skipped' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400', label: 'Unknown' };
    }
  };

  const config = getStatusConfig();

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};

// Project data category group component (for unified library view)
const ProjectDataCategoryGroup: React.FC<{
  category: string;
  items: ProjectDataItem[];
  computedTotal: ProjectDataItem | null;
  expandedItemId: string | null;
  onExpandItem: (id: string | null) => void;
  onEditTotal: (category: string, currentValue: number, isOverride: boolean) => void;
}> = ({ category, items, computedTotal, expandedItemId, onExpandItem, onEditTotal }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Filter out computed items from regular display
  const regularItems = items.filter(item => !item.isComputed);
  const itemCount = regularItems.length;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <span className="font-medium text-gray-900">{category}</span>
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
            {itemCount} items
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="divide-y divide-gray-100">
          {/* Regular items */}
          {regularItems.map(item => (
            <div key={item._id as string} className="px-4 py-3 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400">{item.itemCode}</span>
                    <span className="text-sm font-medium text-gray-900 truncate">{item.originalName}</span>
                    {item.hasMultipleSources && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">
                              <GitCompare className="w-3 h-3" />
                              {item.valueHistory.length}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {item.valueHistory.length} versions from different sources
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {item.lastUpdatedBy === 'manual' && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">Manual</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Source: {item.currentSourceDocumentName}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold ${
                    typeof item.currentValue === 'number' && item.currentValue < 0 
                      ? 'text-red-600' 
                      : 'text-gray-900'
                  }`}>
                    {item.currentDataType === 'currency' && typeof item.currentValue === 'number'
                      ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.currentValue)
                      : item.currentDataType === 'percentage' && typeof item.currentValue === 'number'
                        ? `${(item.currentValue * 100).toFixed(2)}%`
                        : item.currentValue}
                  </span>
                  {item.valueHistory.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onExpandItem(expandedItemId === (item._id as string) ? null : (item._id as string))}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <History className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Expanded history */}
              {expandedItemId === (item._id as string) && item.valueHistory.length > 1 && (
                <div className="mt-3 pl-4 border-l-2 border-gray-200 space-y-2">
                  {item.valueHistory
                    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
                    .map((history, idx) => (
                      <div 
                        key={idx}
                        className={`p-2 rounded text-sm ${history.isCurrentValue ? 'bg-blue-50' : 'bg-gray-50'}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {typeof history.value === 'number'
                              ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(history.value)
                              : history.value}
                            {history.isCurrentValue && (
                              <span className="ml-2 text-xs text-blue-600">(current)</span>
                            )}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(history.addedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {history.sourceDocumentName}
                          {history.addedBy === 'manual' && ' · Manual override'}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
          
          {/* Computed Total Row - Distinct styling */}
          {computedTotal && (
            <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-t-2 border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-mono text-blue-600">{computedTotal.itemCode}</span>
                    <span className="text-sm font-semibold text-blue-900">{computedTotal.originalName}</span>
                    {computedTotal.isComputed ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                              <Calculator className="w-3 h-3" />
                              Auto
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Auto-computed from {computedTotal.computedItemCount || itemCount} items in this category
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                              <Pencil className="w-3 h-3" />
                              Override
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-1">
                              <div>Manually set value</div>
                              {computedTotal.computedTotal !== undefined && (
                                <div className="text-xs opacity-75">
                                  Computed would be: {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(computedTotal.computedTotal)}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <div className="text-xs text-blue-600 mt-0.5">
                    Exportable total for this category
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-base font-bold ${
                    typeof computedTotal.currentValue === 'number' && computedTotal.currentValue < 0 
                      ? 'text-red-600' 
                      : 'text-blue-900'
                  }`}>
                    {typeof computedTotal.currentValue === 'number'
                      ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(computedTotal.currentValue)
                      : computedTotal.currentValue}
                  </span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditTotal(
                            category, 
                            typeof computedTotal.currentValue === 'number' ? computedTotal.currentValue : 0,
                            !computedTotal.isComputed
                          )}
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {computedTotal.isComputed ? 'Override this total' : 'Edit override'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Category group component
const CategoryGroup: React.FC<{
  category: string;
  items: CodifiedItem[];
  defaultExpanded?: boolean;
  onAddItem?: (category: string) => void;
}> = ({ category, items, defaultExpanded = true, onAddItem }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Calculate category stats
  const stats = useMemo(() => {
    const matched = items.filter(i => i.mappingStatus === 'matched' || i.mappingStatus === 'confirmed').length;
    const pending = items.filter(i => i.mappingStatus === 'pending_review' || i.mappingStatus === 'suggested').length;
    return { matched, pending, total: items.length };
  }, [items]);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Category header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
        <button
          className="flex items-center gap-3 flex-1 hover:bg-gray-100 -ml-2 pl-2 py-1 rounded transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <span className="font-medium text-gray-900">{category}</span>
          <span className="text-sm text-gray-500">({items.length} items)</span>
        </button>
        
        <div className="flex items-center gap-3">
          {stats.matched > 0 && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="w-3 h-3" />
              {stats.matched} ready
            </span>
          )}
          {stats.pending > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle className="w-3 h-3" />
              {stats.pending} pending
            </span>
          )}
          {onAddItem && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddItem(category);
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
              title={`Add item to ${category}`}
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          )}
        </div>
      </div>

      {/* Items table */}
      {isExpanded && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-t border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Original Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Code</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item) => {
                const isCompound = isCompoundItem(item.originalName);
                return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <StatusBadge status={item.mappingStatus} confidence={item.confidence} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{item.originalName}</span>
                      {isCompound && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-xs font-medium cursor-help">
                                <Layers className="w-3 h-3" />
                                Combined
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-sm">
                                This item appears to combine multiple categories. 
                                The full value will be used when matched to a single code.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {item.itemCode ? (
                      <code className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-mono">
                        {item.itemCode}
                      </code>
                    ) : item.suggestedCode ? (
                      <code className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-mono">
                        {item.suggestedCode}
                      </code>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900 font-mono">
                    {typeof item.value === 'number' 
                      ? item.dataType === 'currency'
                        ? `£${item.value.toLocaleString()}`
                        : item.dataType === 'percentage'
                          ? `${(item.value * 100).toFixed(2)}%`
                          : item.value.toLocaleString()
                      : item.value
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                      {item.dataType}
                    </span>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default function DataLibrary({
  projectId,
  clientName,
  documents,
  activeDocumentId,
  onDocumentChange,
  onDataChange,
  onModelSelect,
  onOptimizedModelSelect,
  isModelDisabled,
  quickExportMode = false,
  onQuickExportModeChange,
}: DataLibraryProps) {
  const [isRunningSmartPass, setIsRunningSmartPass] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [defaultCategory, setDefaultCategory] = useState<string | undefined>(undefined);
  const [smartPassError, setSmartPassError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('by-document');
  const [expandedHistoryItemId, setExpandedHistoryItemId] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  
  // Override modal state
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideCategory, setOverrideCategory] = useState<string>('');
  const [overrideValue, setOverrideValue] = useState<string>('');
  const [isOverrideExisting, setIsOverrideExisting] = useState(false);
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  // Query project data library (unified view across all documents)
  const projectDataLibrary = useQuery(
    api.projectDataLibrary.getProjectLibrary,
    projectId ? { projectId } : 'skip'
  ) as ProjectDataItem[] | undefined;

  // Query library stats
  const libraryStats = useQuery(
    api.projectDataLibrary.getLibraryStats,
    projectId ? { projectId } : 'skip'
  );

  // Query items with changes (multiple sources)
  const changedItems = useQuery(
    api.projectDataLibrary.getChangedItems,
    projectId ? { projectId } : 'skip'
  ) as ProjectDataItem[] | undefined;

  // Mutation to merge extraction to library
  const mergeToLibrary = useMutation(api.codifiedExtractions.mergeToProjectLibrary);
  
  // Mutation for manual override
  const manualOverrideItem = useMutation(api.projectDataLibrary.manualOverrideItem);
  
  // Mutations for category total overrides
  const overrideCategoryTotal = useMutation(api.projectDataLibrary.overrideCategoryTotal);
  const clearCategoryTotalOverride = useMutation(api.projectDataLibrary.clearCategoryTotalOverride);

  // Convert documents to tab format - group by fileName and show versions
  const documentTabs: DocumentTab[] = useMemo(() => {
    const groupedByFileName = new Map<string, typeof documents>();
    documents.forEach(doc => {
      const baseName = doc.fileName.replace(/\s+v\d+.*$/i, '');
      if (!groupedByFileName.has(baseName)) {
        groupedByFileName.set(baseName, []);
      }
      groupedByFileName.get(baseName)!.push(doc);
    });

    const tabs: DocumentTab[] = [];
    groupedByFileName.forEach((docs, baseName) => {
      const sortedDocs = [...docs].sort((a, b) => 
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );
      
      sortedDocs.forEach((doc, index) => {
        tabs.push({
          documentId: doc._id,
          fileName: baseName,
          extractedAt: doc.uploadedAt,
          version: sortedDocs.length - index,
          isActive: doc._id === activeDocumentId,
        });
      });
    });

    return tabs.sort((a, b) => 
      new Date(b.extractedAt).getTime() - new Date(a.extractedAt).getTime()
    );
  }, [documents, activeDocumentId]);

  // Get active document data
  const activeDocument = useMemo(() => {
    if (activeDocumentId) {
      return documents.find(doc => doc._id === activeDocumentId);
    }
    const sorted = [...documents].sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    return sorted[0];
  }, [documents, activeDocumentId]);

  // Query codified extraction for active document
  const codifiedExtraction = useQuery(
    api.codifiedExtractions.getByDocument,
    activeDocument ? { documentId: activeDocument._id } : 'skip'
  ) as CodifiedExtraction | null | undefined;
  
  // Mutation to remove codified extraction (for reset)
  const removeCodifiedExtraction = useMutation(api.codifiedExtractions.remove);

  // Check if we need to run Smart Pass
  const needsSmartPass = useMemo(() => {
    if (!codifiedExtraction) return false;
    return codifiedExtraction.fastPassCompleted && 
           !codifiedExtraction.smartPassCompleted &&
           codifiedExtraction.mappingStats.pendingReview > 0;
  }, [codifiedExtraction]);

  // Items needing review count
  const itemsNeedingReview = useMemo(() => {
    if (!codifiedExtraction) return 0;
    return codifiedExtraction.items.filter(i => 
      i.mappingStatus === 'pending_review' || i.mappingStatus === 'suggested'
    ).length;
  }, [codifiedExtraction]);

  // Group items by category
  const itemsByCategory = useMemo(() => {
    if (!codifiedExtraction) return {};
    
    const grouped: Record<string, CodifiedItem[]> = {};
    codifiedExtraction.items.forEach(item => {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    });
    
    return grouped;
  }, [codifiedExtraction]);

  // Filter items by search query
  const filteredItemsByCategory = useMemo(() => {
    if (!searchQuery.trim()) return itemsByCategory;
    
    const query = searchQuery.toLowerCase().trim();
    const filtered: Record<string, CodifiedItem[]> = {};
    
    Object.entries(itemsByCategory).forEach(([category, items]) => {
      const matchingItems = items.filter(item => {
        const originalNameMatch = item.originalName.toLowerCase().includes(query);
        const itemCodeMatch = item.itemCode?.toLowerCase().includes(query) || false;
        const suggestedCodeMatch = item.suggestedCode?.toLowerCase().includes(query) || false;
        const valueMatch = String(item.value).toLowerCase().includes(query);
        const categoryMatch = item.category.toLowerCase().includes(query);
        
        return originalNameMatch || itemCodeMatch || suggestedCodeMatch || valueMatch || categoryMatch;
      });
      
      if (matchingItems.length > 0) {
        filtered[category] = matchingItems;
      }
    });
    
    return filtered;
  }, [itemsByCategory, searchQuery]);

  // Run Smart Pass automatically when needed
  useEffect(() => {
    if (needsSmartPass && !isRunningSmartPass && activeDocument) {
      runSmartPass();
    }
  }, [needsSmartPass, activeDocument]);

  // Run Smart Pass (force = true to re-run even if already completed)
  const runSmartPass = async (force: boolean = false) => {
    if (!activeDocument || isRunningSmartPass) return;
    
    setIsRunningSmartPass(true);
    setSmartPassError(null);
    
    try {
      const response = await fetch('/api/codify-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'smart-pass',
          documentId: activeDocument._id,
          force, // Allow re-running even if completed
        }),
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Smart Pass failed');
      }
      
      // Convex will automatically update the query
    } catch (error) {
      console.error('Smart Pass error:', error);
      setSmartPassError(error instanceof Error ? error.message : 'Smart Pass failed');
    } finally {
      setIsRunningSmartPass(false);
    }
  };

  // Export to Excel
  const handleExportToExcel = useCallback(() => {
    if (!codifiedExtraction || !activeDocument) {
      alert('No data to export');
      return;
    }

    try {
      // Convert codified data to 2D array
      const headers = ['Status', 'Original Name', 'Item Code', 'Value', 'Type', 'Category', 'Confidence'];
      const rows = codifiedExtraction.items.map(item => [
        item.mappingStatus,
        item.originalName,
        item.itemCode || item.suggestedCode || '',
        item.value,
        item.dataType,
        item.category,
        item.confidence,
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Codified Data');

      const baseFileName = activeDocument.fileName.replace(/\.(xlsx|xls)$/i, '');
      const fileName = `${baseFileName}-codified-${new Date().toISOString().split('T')[0]}.xlsx`;

      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export data. Please try again.');
    }
  }, [codifiedExtraction, activeDocument]);

  // Handle mapping modal close and refresh
  const handleMappingComplete = () => {
    setShowMappingModal(false);
    // Convex will automatically refresh the data
  };

  // Reset codification handler
  const handleReset = async () => {
    if (!activeDocument?.extractedData) {
      alert('No extracted data available to reset');
      return;
    }
    if (!confirm('This will reset all codification data and re-run from scratch. Continue?')) {
      return;
    }
    setIsRunningSmartPass(true);
    try {
      // Delete existing codification
      if (codifiedExtraction) {
        await removeCodifiedExtraction({ id: codifiedExtraction._id });
      }
      // Re-run Fast Pass from scratch
      const response = await fetch('/api/codify-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fast-pass',
          documentId: activeDocument._id,
          extractedData: activeDocument.extractedData,
        }),
      });
      if (response.ok) {
        console.log('[DataLibrary] Reset complete, running Smart Pass...');
        // Wait a moment for Convex to update, then trigger Smart Pass
        setTimeout(() => runSmartPass(true), 500);
      } else {
        throw new Error('Reset failed');
      }
    } catch (error) {
      console.error('Reset error:', error);
      setSmartPassError('Failed to reset codification');
    } finally {
      setIsRunningSmartPass(false);
    }
  };

  // Handle merge to library
  const handleMergeToLibrary = async () => {
    if (!codifiedExtraction || !projectId) return;
    
    setIsMerging(true);
    try {
      const result = await mergeToLibrary({ 
        extractionId: codifiedExtraction._id,
        projectId: projectId, // Pass projectId in case extraction doesn't have it
      });
      console.log('[DataLibrary] Merged to library:', result);
    } catch (error) {
      console.error('[DataLibrary] Merge failed:', error);
    } finally {
      setIsMerging(false);
    }
  };

  // Check if current extraction is merged
  const isCurrentExtractionMerged = codifiedExtraction?.mergedToProjectLibrary;

  // Handle opening the override modal
  const handleEditTotal = (category: string, currentValue: number, isOverride: boolean) => {
    setOverrideCategory(category);
    setOverrideValue(currentValue.toString());
    setIsOverrideExisting(isOverride);
    setShowOverrideModal(true);
  };

  // Handle saving the override
  const handleSaveOverride = async () => {
    if (!projectId || !overrideCategory) return;
    
    setIsSavingOverride(true);
    try {
      const numericValue = parseFloat(overrideValue.replace(/[^0-9.-]/g, ''));
      if (isNaN(numericValue)) {
        throw new Error('Invalid value');
      }
      
      await overrideCategoryTotal({
        projectId,
        category: overrideCategory,
        overrideValue: numericValue,
        note: 'Manual override from Data Library',
      });
      
      setShowOverrideModal(false);
      setOverrideCategory('');
      setOverrideValue('');
    } catch (error) {
      console.error('[DataLibrary] Override failed:', error);
    } finally {
      setIsSavingOverride(false);
    }
  };

  // Handle clearing the override (revert to computed)
  const handleClearOverride = async () => {
    if (!projectId || !overrideCategory) return;
    
    setIsSavingOverride(true);
    try {
      await clearCategoryTotalOverride({
        projectId,
        category: overrideCategory,
      });
      
      setShowOverrideModal(false);
      setOverrideCategory('');
      setOverrideValue('');
    } catch (error) {
      console.error('[DataLibrary] Clear override failed:', error);
    } finally {
      setIsSavingOverride(false);
    }
  };

  // Group project data items by category and separate computed totals
  const { projectItemsByCategory, computedTotalsByCategory } = useMemo(() => {
    if (!projectDataLibrary) return { projectItemsByCategory: {}, computedTotalsByCategory: {} };
    
    const grouped: Record<string, ProjectDataItem[]> = {};
    const totals: Record<string, ProjectDataItem> = {};
    
    projectDataLibrary.forEach(item => {
      // Check if this is a computed total item
      if (item.isComputed || item.itemCode.startsWith('<total.')) {
        totals[item.category] = item;
      } else {
        if (!grouped[item.category]) {
          grouped[item.category] = [];
        }
        grouped[item.category].push(item);
      }
    });
    
    return { projectItemsByCategory: grouped, computedTotalsByCategory: totals };
  }, [projectDataLibrary]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header - Unified Action Toolbar */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-4">
          {/* Left side - Title and View Mode Dropdown */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900 flex-shrink-0">Data Library</h2>
            
            {/* View Mode Dropdown */}
            {projectId && (
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-data">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4" />
                      All Data
                      {libraryStats && (
                        <span className="text-xs text-gray-500">({libraryStats.totalItems})</span>
                      )}
                    </div>
                  </SelectItem>
                  <SelectItem value="by-document">
                    <div className="flex items-center gap-2">
                      <FileStack className="w-4 h-4" />
                      By Document
                    </div>
                  </SelectItem>
                  <SelectItem value="changes">
                    <div className="flex items-center gap-2">
                      <GitCompare className="w-4 h-4" />
                      Changes
                      {changedItems && changedItems.length > 0 && (
                        <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                          {changedItems.length}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Right side - All action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Quick Export Toggle */}
            {onModelSelect && codifiedExtraction?.isFullyConfirmed && (
              <div className="flex items-center gap-2 mr-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                <Zap className={`w-4 h-4 ${quickExportMode ? 'text-amber-500' : 'text-gray-400'}`} />
                <span className="text-sm font-medium text-gray-700">Quick Export</span>
                <Switch
                  checked={quickExportMode}
                  onCheckedChange={onQuickExportModeChange}
                  className={quickExportMode ? 'bg-amber-500' : ''}
                />
              </div>
            )}
            {onModelSelect && (
              <ModelLibraryDropdown
                onModelSelect={(templateId) => onModelSelect(templateId, quickExportMode)}
                onOptimizedModelSelect={onOptimizedModelSelect ? (templateId) => onOptimizedModelSelect(templateId, quickExportMode) : undefined}
                disabled={isModelDisabled || !activeDocument || !codifiedExtraction?.isFullyConfirmed}
                quickExportMode={quickExportMode}
              />
            )}
            {codifiedExtraction && viewMode === 'by-document' && (
              <>
                <Button
                  onClick={handleReset}
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  title="Delete current codification and start fresh"
                  disabled={isRunningSmartPass}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Reset
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportToExcel}
                  className="flex items-center gap-1.5"
                  title="Export codified data to Excel"
                >
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Document Version Selector - Only show in by-document view */}
      {viewMode === 'by-document' && documentTabs.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <DocumentTabs
              documents={documentTabs}
              activeDocumentId={activeDocumentId || null}
              onDocumentChange={(docId) => onDocumentChange(docId as Id<'documents'>)}
            />
            {/* Library status and actions for current document */}
            {codifiedExtraction && projectId && (
              <div className="flex items-center gap-2">
                {isCurrentExtractionMerged ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-emerald-700 bg-emerald-50 rounded border border-emerald-200">
                    <Check className="w-3.5 h-3.5" />
                    In Library
                  </span>
                ) : codifiedExtraction.isFullyConfirmed ? (
                  <Button
                    onClick={handleMergeToLibrary}
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    disabled={isMerging}
                  >
                    {isMerging ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                    ) : (
                      <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
                    )}
                    Add to Library
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Banner - Stats and Actions - Only show in by-document view */}
      {viewMode === 'by-document' && codifiedExtraction && (
        <div className="px-4 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            {/* Left - Stats and Search */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1.5 text-green-600">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  {codifiedExtraction.mappingStats.matched + codifiedExtraction.mappingStats.confirmed} ready
                </span>
                {(codifiedExtraction.mappingStats.suggested + codifiedExtraction.mappingStats.pendingReview) > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-600">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    {codifiedExtraction.mappingStats.suggested + codifiedExtraction.mappingStats.pendingReview} pending
                  </span>
                )}
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Smart Pass status */}
              {isRunningSmartPass && (
                <span className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing items...
                </span>
              )}
              {smartPassError && (
                <span className="text-sm text-red-600">{smartPassError}</span>
              )}
            </div>

            {/* Right - Review Actions and Confirmation Status */}
            <div className="flex items-center gap-3">
              {/* Retry Smart Pass button */}
              {itemsNeedingReview > 0 && !isRunningSmartPass && (
                <Button
                  onClick={() => runSmartPass(true)}
                  variant="ghost"
                  size="sm"
                  title="Re-run AI matching with latest codes and rules"
                  className="text-gray-600"
                >
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Retry
                </Button>
              )}
              
              {/* Review button */}
              {itemsNeedingReview > 0 && (
                <Button
                  onClick={() => setShowMappingModal(true)}
                  className="bg-amber-600 hover:bg-amber-500 text-white"
                  size="sm"
                >
                  <AlertTriangle className="w-4 h-4 mr-1.5" />
                  Review {itemsNeedingReview} items
                </Button>
              )}

              {codifiedExtraction.isFullyConfirmed && (
                <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                  <Check className="w-4 h-4" />
                  All items confirmed - Ready to run model
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Data Viewer */}
      <div className="flex-1 overflow-auto p-4">
        {/* ALL DATA VIEW - Unified project data library */}
        {viewMode === 'all-data' && (
          <div className="space-y-4">
            {!projectDataLibrary || projectDataLibrary.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
                <Database className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No data in library yet</h3>
                <p className="text-gray-600 mb-4">
                  Upload and codify documents, then add them to the library to see aggregated data here.
                </p>
              </div>
            ) : (
              <>
                {/* Library Stats Banner */}
                {libraryStats && (
                  <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-6 text-sm">
                      <span className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-blue-500" />
                        <span className="font-medium">{libraryStats.totalItems}</span> items
                      </span>
                      <span className="flex items-center gap-2">
                        <FileStack className="w-4 h-4 text-purple-500" />
                        <span className="font-medium">{libraryStats.totalDocuments}</span> source documents
                      </span>
                      {libraryStats.manualOverrides > 0 && (
                        <span className="flex items-center gap-2 text-amber-600">
                          <History className="w-4 h-4" />
                          <span className="font-medium">{libraryStats.manualOverrides}</span> manual overrides
                        </span>
                      )}
                      {libraryStats.multiSourceItems > 0 && (
                        <span className="flex items-center gap-2 text-orange-600">
                          <GitCompare className="w-4 h-4" />
                          <span className="font-medium">{libraryStats.multiSourceItems}</span> items with multiple sources
                        </span>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Grouped by category */}
                {Object.entries(projectItemsByCategory)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([category, items]) => (
                    <ProjectDataCategoryGroup
                      key={category}
                      category={category}
                      items={items}
                      computedTotal={computedTotalsByCategory[category] || null}
                      expandedItemId={expandedHistoryItemId}
                      onExpandItem={setExpandedHistoryItemId}
                      onEditTotal={handleEditTotal}
                    />
                  ))
                }
              </>
            )}
          </div>
        )}

        {/* CHANGES VIEW - Items with multiple sources */}
        {viewMode === 'changes' && (
          <div className="space-y-4">
            {!changedItems || changedItems.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
                <GitCompare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No changes detected</h3>
                <p className="text-gray-600">
                  When items have different values from multiple documents, they will appear here for review.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                  <div className="flex items-center gap-2 text-amber-700">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium">{changedItems.length} items have values from multiple sources</span>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {changedItems.map(item => (
                    <div key={item._id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-gray-400">{item.itemCode}</span>
                            <span className="text-sm font-medium text-gray-900">{item.originalName}</span>
                            {item.valueVariance && (
                              <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                                {item.valueVariance.toFixed(1)}% variance
                              </span>
                            )}
                          </div>
                          <div className="text-lg font-semibold text-gray-900">
                            {typeof item.currentValue === 'number' 
                              ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.currentValue)
                              : item.currentValue}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Current source: {item.currentSourceDocumentName}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedHistoryItemId(
                            expandedHistoryItemId === item._id ? null : item._id
                          )}
                        >
                          <History className="w-4 h-4 mr-1.5" />
                          {item.valueHistory.length} versions
                        </Button>
                      </div>
                      
                      {/* Expanded history */}
                      {expandedHistoryItemId === item._id && (
                        <div className="mt-4 pl-4 border-l-2 border-gray-200 space-y-2">
                          {item.valueHistory
                            .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
                            .map((history, idx) => (
                              <div 
                                key={idx} 
                                className={`p-3 rounded-lg ${history.isCurrentValue ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="font-medium">
                                      {typeof history.value === 'number'
                                        ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(history.value)
                                        : history.value}
                                    </span>
                                    {history.isCurrentValue && (
                                      <span className="ml-2 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">Current</span>
                                    )}
                                    {history.wasReverted && (
                                      <span className="ml-2 text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">Reverted</span>
                                    )}
                                  </div>
                                  <span className="text-xs text-gray-500">
                                    {new Date(history.addedAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  From: {history.sourceDocumentName}
                                  {history.addedBy === 'manual' && ' (manual override)'}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BY DOCUMENT VIEW - Existing per-document view */}
        {viewMode === 'by-document' && (
          <>
            {codifiedExtraction ? (
              <div className="space-y-4">
                {Object.keys(filteredItemsByCategory).length === 0 && searchQuery ? (
                  <div className="text-center py-8 text-gray-500">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No items match &quot;{searchQuery}&quot;</p>
                  </div>
                ) : (
                  Object.entries(filteredItemsByCategory)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([category, items]) => (
                      <CategoryGroup
                        key={category}
                        category={category}
                        items={items}
                        defaultExpanded={true}
                        onAddItem={(cat) => {
                          setDefaultCategory(cat);
                          setShowAddItemModal(true);
                        }}
                      />
                    ))
                )}
              </div>
            ) : activeDocument?.extractedData ? (
              // Fallback to raw extracted data if no codification exists
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="text-center py-8">
                  <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Data not yet codified</h3>
                  <p className="text-gray-600 mb-4">
                    This document has extracted data but it hasn&apos;t been processed through the codification system yet.
                  </p>
                  <Button
                    onClick={async () => {
                      if (!activeDocument) return;
                      setIsRunningSmartPass(true);
                      try {
                        const response = await fetch('/api/codify-extraction', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'fast-pass',
                            documentId: activeDocument._id,
                            extractedData: activeDocument.extractedData,
                          }),
                        });
                        if (!response.ok) throw new Error('Codification failed');
                      } catch (error) {
                        console.error('Codification error:', error);
                        setSmartPassError('Failed to codify data');
                      } finally {
                        setIsRunningSmartPass(false);
                      }
                    }}
                    disabled={isRunningSmartPass}
                  >
                    {isRunningSmartPass ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Run Codification'
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <p className="text-lg mb-2">No extracted data available</p>
                  <p className="text-sm">Select a document with extracted data to view</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Mapping Confirmation Modal */}
      {showMappingModal && codifiedExtraction && activeDocument && (
        <MappingConfirmationModal
          isOpen={showMappingModal}
          onClose={() => setShowMappingModal(false)}
          extractionId={codifiedExtraction._id}
          documentId={activeDocument._id}
          items={codifiedExtraction.items}
          onConfirmComplete={handleMappingComplete}
        />
      )}

      {/* Add Item Modal */}
      {showAddItemModal && codifiedExtraction && activeDocument && (
        <AddDataLibraryItemModal
          isOpen={showAddItemModal}
          onClose={() => {
            setShowAddItemModal(false);
            setDefaultCategory(undefined);
          }}
          extractionId={codifiedExtraction._id}
          documentId={activeDocument._id}
          defaultCategory={defaultCategory}
          onItemAdded={() => {
            setShowAddItemModal(false);
            setDefaultCategory(undefined);
            // Convex will automatically refresh the data
          }}
        />
      )}

      {/* Category Total Override Modal */}
      <Dialog open={showOverrideModal} onOpenChange={(open) => {
        if (!open) {
          setShowOverrideModal(false);
          setOverrideCategory('');
          setOverrideValue('');
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-600" />
              {isOverrideExisting ? 'Edit Total Override' : 'Override Category Total'}
            </DialogTitle>
            <DialogDescription>
              {isOverrideExisting 
                ? `Edit or remove the manual override for ${overrideCategory} total.`
                : `Set a manual value for the ${overrideCategory} total. This will override the auto-computed sum.`
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="override-category">Category</Label>
              <Input 
                id="override-category" 
                value={overrideCategory} 
                disabled 
                className="bg-gray-50"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="override-value">Override Value (£)</Label>
              <Input
                id="override-value"
                type="text"
                value={overrideValue}
                onChange={(e) => setOverrideValue(e.target.value)}
                placeholder="Enter value..."
                className="font-mono"
              />
              <p className="text-xs text-gray-500">
                Enter the exact total value you want to use for this category.
              </p>
            </div>
          </div>
          
          <DialogFooter className="flex gap-2">
            {isOverrideExisting && (
              <Button
                variant="outline"
                onClick={handleClearOverride}
                disabled={isSavingOverride}
                className="mr-auto text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <RotateCcw className="w-4 h-4 mr-1.5" />
                Use Computed
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setShowOverrideModal(false)}
              disabled={isSavingOverride}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveOverride}
              disabled={isSavingOverride || !overrideValue}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSavingOverride ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Check className="w-4 h-4 mr-1.5" />
              )}
              Save Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
