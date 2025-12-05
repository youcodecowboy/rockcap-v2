'use client';

import React, { useState, useMemo } from 'react';
import { X, Check, ChevronDown, Plus, AlertCircle, Loader2, Search } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';

// Types for the modal
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

interface ItemCode {
  _id: string;
  code: string;
  displayName: string;
  category: string;
  dataType: string;
}

interface MappingConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  extractionId: string;
  documentId: string;
  items: CodifiedItem[];
  onConfirmComplete: () => void;
}

// Status badge component
const StatusBadge: React.FC<{ status: CodifiedItem['mappingStatus']; confidence: number }> = ({ status, confidence }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'matched':
        return { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Matched' };
      case 'suggested':
        return { bg: 'bg-amber-500/20', text: 'text-amber-400', label: `Suggested (${Math.round(confidence * 100)}%)` };
      case 'pending_review':
        return { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Needs Review' };
      case 'confirmed':
        return { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Confirmed' };
      case 'unmatched':
        return { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Skipped' };
      default:
        return { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Unknown' };
    }
  };

  const config = getStatusConfig();

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
};

// Item row component
const ItemRow: React.FC<{
  item: CodifiedItem;
  existingCodes: ItemCode[];
  onConfirm: (itemId: string, code: string, codeId?: string) => void;
  onQuickConfirm: (itemId: string) => void;
  onCreateNew: (itemId: string) => void;
  onSkip: (itemId: string) => void;
  isProcessing: boolean;
  isSelected: boolean;
  onToggleSelect: (itemId: string) => void;
}> = ({ item, existingCodes, onConfirm, onQuickConfirm, onCreateNew, onSkip, isProcessing, isSelected, onToggleSelect }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(item.suggestedCode || null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter existing codes by search
  const filteredCodes = useMemo(() => {
    if (!searchQuery.trim()) return existingCodes;
    const query = searchQuery.toLowerCase();
    return existingCodes.filter(
      code => 
        code.code.toLowerCase().includes(query) ||
        code.displayName.toLowerCase().includes(query) ||
        code.category.toLowerCase().includes(query)
    );
  }, [existingCodes, searchQuery]);

  // Group codes by category
  const groupedCodes = useMemo(() => {
    const groups: Record<string, ItemCode[]> = {};
    filteredCodes.forEach(code => {
      if (!groups[code.category]) {
        groups[code.category] = [];
      }
      groups[code.category].push(code);
    });
    return groups;
  }, [filteredCodes]);

  const handleConfirm = () => {
    if (selectedCode) {
      const codeObj = existingCodes.find(c => c.code === selectedCode);
      onConfirm(item.id, selectedCode, codeObj?._id);
    }
  };

  // Don't show items that are already matched or confirmed
  if (item.mappingStatus === 'matched' || item.mappingStatus === 'confirmed') {
    return null;
  }

  const hasSuggestion = item.mappingStatus === 'suggested' && item.suggestedCode;

  return (
    <div className={`border rounded-lg overflow-hidden bg-black/20 transition-colors ${isSelected ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10'}`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Checkbox for multi-select */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(item.id);
          }}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
            isSelected 
              ? 'bg-blue-600 border-blue-600' 
              : 'border-white/30 hover:border-white/50'
          }`}
        >
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </button>

        {/* Expand toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
        >
          <ChevronDown 
            className={`w-4 h-4 text-white/60 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>
        
        {/* Item info */}
        <div 
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-3">
            <span className="font-medium text-white truncate">{item.originalName}</span>
            <StatusBadge status={item.mappingStatus} confidence={item.confidence} />
          </div>
          {item.suggestedCode && (
            <div className="text-xs text-white/50 mt-1">
              Suggested: <code className="text-blue-400">{item.suggestedCode}</code>
            </div>
          )}
        </div>
        
        {/* Value & category */}
        <div className="text-right flex-shrink-0 mr-3">
          <div className="text-sm text-white/70">{item.category}</div>
          <div className="text-xs text-white/50">
            {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
            {item.dataType === 'currency' && ' £'}
          </div>
        </div>

        {/* Inline quick confirm button for suggested items */}
        {hasSuggestion && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickConfirm(item.id);
            }}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
          >
            {isProcessing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Confirm
          </button>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-white/10 p-4 bg-black/30">
          <div className="space-y-4">
            {/* Search existing codes */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">
                Map to existing code
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search codes..."
                  className="w-full pl-10 pr-4 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/40"
                />
              </div>
            </div>

            {/* Code selection */}
            {existingCodes.length > 0 ? (
              <div className="max-h-48 overflow-y-auto space-y-3">
                {Object.entries(groupedCodes).map(([category, codes]) => (
                  <div key={category}>
                    <div className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">
                      {category}
                    </div>
                    <div className="grid gap-1">
                      {codes.map(code => (
                        <button
                          key={code._id}
                          onClick={() => setSelectedCode(code.code)}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors ${
                            selectedCode === code.code
                              ? 'bg-blue-600/30 border border-blue-500/50'
                              : 'bg-black/30 border border-transparent hover:bg-white/10'
                          }`}
                        >
                          <div>
                            <div className="font-mono text-sm text-white">{code.code}</div>
                            <div className="text-xs text-white/50">{code.displayName}</div>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/60">
                            {code.dataType}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-white/50">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No existing codes in the library yet.</p>
                <p className="text-xs mt-1">Create a new code for this item.</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 border-t border-white/10">
              <button
                onClick={handleConfirm}
                disabled={!selectedCode || isProcessing}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirm Mapping
              </button>
              
              <button
                onClick={() => onCreateNew(item.id)}
                disabled={isProcessing}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Code
              </button>
              
              <button
                onClick={() => onSkip(item.id)}
                disabled={isProcessing}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white/70 rounded-lg transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Create New Code Form (rendered inside drawer modal)
const CreateCodeForm: React.FC<{
  item: CodifiedItem;
  onSubmit: (code: string, displayName: string, category: string, dataType: string) => void;
  onClose: () => void;
  isProcessing: boolean;
}> = ({ item, onSubmit, onClose, isProcessing }) => {
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [category, setCategory] = useState('');
  const [dataType, setDataType] = useState<'currency' | 'number' | 'percentage' | 'string'>('currency');

  React.useEffect(() => {
    if (item) {
      // Pre-fill from item
      const suggestedCode = item.suggestedCode || `<${item.originalName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '.')}>`;
      setCode(suggestedCode);
      setDisplayName(item.originalName);
      setCategory(item.category);
      setDataType(item.dataType as any || 'currency');
    }
  }, [item]);

  return (
    <>
      <div className="p-5 space-y-4">
        {/* Original item info - compact horizontal layout */}
        <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 flex items-center gap-6 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <span className="text-[10px] font-medium text-white/50 uppercase tracking-wider">Original Name</span>
            <p className="text-white font-medium text-sm">{item.originalName}</p>
          </div>
          <div>
            <span className="text-[10px] font-medium text-white/50 uppercase tracking-wider">Value</span>
            <p className="text-white/80 text-sm">
              {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
              {item.dataType === 'currency' && ' £'}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-medium text-white/50 uppercase tracking-wider">Category</span>
            <p className="text-white/80 text-sm">{item.category}</p>
          </div>
          {item.suggestedCode && (
            <div>
              <span className="text-[10px] font-medium text-white/50 uppercase tracking-wider">Suggestion</span>
              <p className="text-blue-400 font-mono text-sm">{item.suggestedCode}</p>
            </div>
          )}
        </div>

        {/* Form fields - 2 column layout */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="<item.code>"
              className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-white/40 font-mono text-sm focus:outline-none focus:border-white/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Human-readable name"
              className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-white/40 text-sm focus:outline-none focus:border-white/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., Purchase Costs"
              className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-white/40 text-sm focus:outline-none focus:border-white/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Data Type</label>
            <select
              value={dataType}
              onChange={(e) => setDataType(e.target.value as any)}
              className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-white/40"
            >
              <option value="currency">Currency (£)</option>
              <option value="number">Number</option>
              <option value="percentage">Percentage (%)</option>
              <option value="string">Text</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-white/10">
        <button
          onClick={onClose}
          className="px-4 py-2 text-white/70 hover:text-white transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit(code, displayName, category, dataType)}
          disabled={!code.trim() || !displayName.trim() || isProcessing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg transition-colors text-sm"
        >
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create & Confirm
        </button>
      </div>
    </>
  );
};

// Main Modal Component
export const MappingConfirmationModal: React.FC<MappingConfirmationModalProps> = ({
  isOpen,
  onClose,
  extractionId,
  documentId,
  items,
  onConfirmComplete,
}) => {
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  const [createCodeItem, setCreateCodeItem] = useState<CodifiedItem | null>(null);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [localItems, setLocalItems] = useState<CodifiedItem[]>(items);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Get existing codes - using explicit type to avoid deep type instantiation
  const existingCodes = (useQuery(api.extractedItemCodes.list, { activeOnly: true }) || []) as ItemCode[];

  // Mutations
  const createCode = useMutation(api.extractedItemCodes.create);
  const createAlias = useMutation(api.itemCodeAliases.create);
  const confirmItem = useMutation(api.codifiedExtractions.confirmItem);
  const confirmAllSuggested = useMutation(api.codifiedExtractions.confirmAllSuggested);
  const skipItem = useMutation(api.codifiedExtractions.skipItem);

  // Update local items when props change
  React.useEffect(() => {
    setLocalItems(items);
    setSelectedItemIds(new Set()); // Clear selections when items change
  }, [items]);

  // Filter items needing review
  const itemsNeedingReview = useMemo(() => 
    localItems.filter(item => 
      item.mappingStatus === 'suggested' || item.mappingStatus === 'pending_review'
    ),
    [localItems]
  );

  const suggestedItems = useMemo(() => 
    localItems.filter(item => item.mappingStatus === 'suggested'),
    [localItems]
  );

  // Get selectable suggested items (those that can be accepted)
  const selectableSuggestedItems = useMemo(() => 
    suggestedItems.filter(item => item.suggestedCode),
    [suggestedItems]
  );

  // Toggle item selection
  const handleToggleSelect = (itemId: string) => {
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Select all suggested items
  const handleSelectAll = () => {
    const allSelectableIds = selectableSuggestedItems.map(item => item.id);
    setSelectedItemIds(new Set(allSelectableIds));
  };

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedItemIds(new Set());
  };

  // Get selected items that can be confirmed
  const selectedConfirmableItems = useMemo(() => 
    selectableSuggestedItems.filter(item => selectedItemIds.has(item.id)),
    [selectableSuggestedItems, selectedItemIds]
  );

  // Handle confirm single item
  const handleConfirm = async (itemId: string, code: string, codeId?: string) => {
    setProcessingItemId(itemId);
    try {
      const result = await confirmItem({
        extractionId: extractionId as Id<"codifiedExtractions">,
        itemId,
        itemCode: code,
        canonicalCodeId: codeId as Id<"extractedItemCodes"> | undefined,
      });

      // Create alias for the original name
      const item = localItems.find(i => i.id === itemId);
      if (item && codeId) {
        await createAlias({
          alias: item.originalName,
          canonicalCodeId: codeId as Id<"extractedItemCodes">,
          confidence: 1.0,
          source: 'user_confirmed',
        });
      }

      // Update local state
      setLocalItems(prev => prev.map(i => 
        i.id === itemId 
          ? { ...i, itemCode: code, mappingStatus: 'confirmed' as const, confidence: 1.0 }
          : i
      ));

      if (result.isFullyConfirmed) {
        onConfirmComplete();
      }
    } catch (error) {
      console.error('Error confirming item:', error);
    } finally {
      setProcessingItemId(null);
    }
  };

  // Handle create new code
  const handleCreateNew = (itemId: string) => {
    const item = localItems.find(i => i.id === itemId);
    if (item) {
      setCreateCodeItem(item);
    }
  };

  // Handle submit new code
  const handleSubmitNewCode = async (
    code: string, 
    displayName: string, 
    category: string, 
    dataType: string
  ) => {
    if (!createCodeItem) return;
    
    setProcessingItemId(createCodeItem.id);
    try {
      // Create the new code
      const newCodeId = await createCode({
        code,
        displayName,
        category,
        dataType: dataType as 'currency' | 'number' | 'percentage' | 'string',
      });

      // Confirm the item with the new code
      await confirmItem({
        extractionId: extractionId as Id<"codifiedExtractions">,
        itemId: createCodeItem.id,
        itemCode: code,
        canonicalCodeId: newCodeId,
      });

      // Create alias for the original name
      await createAlias({
        alias: createCodeItem.originalName,
        canonicalCodeId: newCodeId,
        confidence: 1.0,
        source: 'user_confirmed',
      });

      // Update local state
      setLocalItems(prev => prev.map(i => 
        i.id === createCodeItem.id 
          ? { ...i, itemCode: code, mappingStatus: 'confirmed' as const, confidence: 1.0 }
          : i
      ));

      setCreateCodeItem(null);
    } catch (error) {
      console.error('Error creating code:', error);
    } finally {
      setProcessingItemId(null);
    }
  };

  // Handle skip item
  const handleSkip = async (itemId: string) => {
    setProcessingItemId(itemId);
    try {
      await skipItem({
        extractionId: extractionId as Id<"codifiedExtractions">,
        itemId,
      });

      // Update local state
      setLocalItems(prev => prev.map(i => 
        i.id === itemId 
          ? { ...i, mappingStatus: 'unmatched' as const, confidence: 0 }
          : i
      ));
    } catch (error) {
      console.error('Error skipping item:', error);
    } finally {
      setProcessingItemId(null);
    }
  };

  // Handle quick confirm for suggested item (using its suggested code)
  const handleQuickConfirm = async (itemId: string) => {
    const item = localItems.find(i => i.id === itemId);
    if (!item || !item.suggestedCode) return;
    
    await handleConfirm(itemId, item.suggestedCode, item.suggestedCodeId);
    // Remove from selection after confirming
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(itemId);
      return newSet;
    });
  };

  // Handle confirm selected items (or all if none selected)
  const handleConfirmSelected = async () => {
    const itemsToConfirm = selectedConfirmableItems.length > 0 
      ? selectedConfirmableItems 
      : selectableSuggestedItems;
    
    if (itemsToConfirm.length === 0) return;

    setIsConfirmingAll(true);
    try {
      // If confirming all (no selection), use the batch endpoint
      if (selectedConfirmableItems.length === 0) {
        const result = await confirmAllSuggested({
          extractionId: extractionId as Id<"codifiedExtractions">,
        });

        // Create aliases for all confirmed items
        for (const item of suggestedItems) {
          if (item.suggestedCodeId) {
            await createAlias({
              alias: item.originalName,
              canonicalCodeId: item.suggestedCodeId as Id<"extractedItemCodes">,
              confidence: 1.0,
              source: 'user_confirmed',
            });
          }
        }

        // Update local state
        setLocalItems(prev => prev.map(i => 
          i.mappingStatus === 'suggested' && i.suggestedCode
            ? { ...i, itemCode: i.suggestedCode, mappingStatus: 'confirmed' as const, confidence: 1.0 }
            : i
        ));

        if (result.isFullyConfirmed) {
          onConfirmComplete();
        }
      } else {
        // Confirm selected items one by one
        for (const item of itemsToConfirm) {
          if (item.suggestedCode) {
            const result = await confirmItem({
              extractionId: extractionId as Id<"codifiedExtractions">,
              itemId: item.id,
              itemCode: item.suggestedCode,
              canonicalCodeId: item.suggestedCodeId as Id<"extractedItemCodes"> | undefined,
            });

            // Create alias
            if (item.suggestedCodeId) {
              await createAlias({
                alias: item.originalName,
                canonicalCodeId: item.suggestedCodeId as Id<"extractedItemCodes">,
                confidence: 1.0,
                source: 'user_confirmed',
              });
            }

            if (result.isFullyConfirmed) {
              onConfirmComplete();
            }
          }
        }

        // Update local state for selected items
        const confirmedIds = new Set(itemsToConfirm.map(i => i.id));
        setLocalItems(prev => prev.map(i => 
          confirmedIds.has(i.id) && i.suggestedCode
            ? { ...i, itemCode: i.suggestedCode, mappingStatus: 'confirmed' as const, confidence: 1.0 }
            : i
        ));

        // Clear selection
        setSelectedItemIds(new Set());
      }
    } catch (error) {
      console.error('Error confirming items:', error);
    } finally {
      setIsConfirmingAll(false);
    }
  };

  return (
    <>
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()} direction="right">
        <DrawerContent className="h-full w-full max-w-4xl bg-[#1A1A1A] border-l border-white/10">
          {/* Header */}
          <DrawerHeader className="px-6 py-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <DrawerTitle className="text-xl font-semibold text-white">Review Mappings</DrawerTitle>
                <DrawerDescription className="text-sm text-white/60 mt-1">
                  {itemsNeedingReview.length} items need your review
                </DrawerDescription>
              </div>
              <DrawerClose asChild>
                <button className="text-white/60 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          {/* Stats bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-black/30 border-b border-white/10">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm text-white/70">
                  Matched: {localItems.filter(i => i.mappingStatus === 'matched').length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-sm text-white/70">
                  Suggested: {localItems.filter(i => i.mappingStatus === 'suggested').length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-sm text-white/70">
                  Pending: {localItems.filter(i => i.mappingStatus === 'pending_review').length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-white/70">
                  Confirmed: {localItems.filter(i => i.mappingStatus === 'confirmed').length}
                </span>
              </div>
            </div>
            
            {/* Selection controls */}
            {selectableSuggestedItems.length > 0 && (
              <div className="flex items-center gap-2">
                {selectedItemIds.size > 0 ? (
                  <>
                    <span className="text-sm text-blue-400 font-medium">
                      {selectedItemIds.size} selected
                    </span>
                    <button
                      onClick={handleClearSelection}
                      className="text-xs text-white/50 hover:text-white underline"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleSelectAll}
                    className="text-xs text-white/50 hover:text-white underline"
                  >
                    Select all suggested
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {itemsNeedingReview.length === 0 ? (
              <div className="text-center py-12">
                <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white">All items confirmed!</h3>
                <p className="text-white/60 mt-1">You can now run the model with this data.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {itemsNeedingReview.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    existingCodes={existingCodes as ItemCode[]}
                    onConfirm={handleConfirm}
                    onQuickConfirm={handleQuickConfirm}
                    onCreateNew={handleCreateNew}
                    onSkip={handleSkip}
                    isProcessing={processingItemId === item.id || isConfirmingAll}
                    isSelected={selectedItemIds.has(item.id)}
                    onToggleSelect={handleToggleSelect}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <DrawerFooter className="flex-row items-center justify-between px-6 py-4 border-t border-white/10 mt-0">
            <div className="text-sm text-white/60">
              {localItems.filter(i => i.mappingStatus === 'confirmed' || i.mappingStatus === 'matched').length} of {localItems.length} items ready
            </div>
            
            <div className="flex items-center gap-3">
              {selectableSuggestedItems.length > 0 && (
                <button
                  onClick={handleConfirmSelected}
                  disabled={isConfirmingAll}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                >
                  {isConfirmingAll ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {selectedConfirmableItems.length > 0 
                    ? `Accept Selected (${selectedConfirmableItems.length})`
                    : `Accept All Suggested (${selectableSuggestedItems.length})`
                  }
                </button>
              )}
              
              <DrawerClose asChild>
                <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors">
                  Close
                </button>
              </DrawerClose>
            </div>
          </DrawerFooter>

          {/* Create Code Modal - rendered inside drawer for proper stacking */}
          {createCodeItem && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-[#1A1A1A] border border-white/10 rounded-xl shadow-2xl w-full max-w-3xl mx-4">
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                  <h3 className="text-lg font-semibold text-white">Create New Code</h3>
                  <button onClick={() => setCreateCodeItem(null)} className="text-white/60 hover:text-white p-1 hover:bg-white/10 rounded">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <CreateCodeForm
                  item={createCodeItem}
                  onSubmit={handleSubmitNewCode}
                  onClose={() => setCreateCodeItem(null)}
                  isProcessing={processingItemId === createCodeItem?.id}
                />
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default MappingConfirmationModal;

