'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import DocumentTabs, { DocumentTab } from './DocumentTabs';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Download, AlertTriangle, Check, Loader2, ChevronDown, ChevronRight, Plus, Layers, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { MappingConfirmationModal } from './MappingConfirmationModal';
import { AddDataLibraryItemModal } from './AddDataLibraryItemModal';
import { isCompoundItem } from '@/lib/fastPassCodification';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

// Category group component
const CategoryGroup: React.FC<{
  category: string;
  items: CodifiedItem[];
  defaultExpanded?: boolean;
}> = ({ category, items, defaultExpanded = true }) => {
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
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <span className="font-medium text-gray-900">{category}</span>
          <span className="text-sm text-gray-500">({items.length} items)</span>
        </div>
        
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
        </div>
      </button>

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
}: DataLibraryProps) {
  const [isRunningSmartPass, setIsRunningSmartPass] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [smartPassError, setSmartPassError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Data Library</h2>
            {clientName && (
              <p className="text-sm text-gray-600 mt-1">
                Client: <span className="font-medium">{clientName}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {activeDocument && (
              <div className="text-sm text-gray-500">
                Source: {activeDocument.fileName}
              </div>
            )}
            {codifiedExtraction && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddItemModal(true)}
                  className="flex items-center gap-2"
                  title="Manually add an item"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportToExcel}
                  className="flex items-center gap-2"
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

      {/* Document Tabs */}
      {documentTabs.length > 0 && (
        <div className="px-4 pt-3 border-b border-gray-200 bg-white">
          <DocumentTabs
            documents={documentTabs}
            activeDocumentId={activeDocumentId || null}
            onDocumentChange={(docId) => onDocumentChange(docId as Id<'documents'>)}
          />
        </div>
      )}

      {/* Status Banner */}
      {codifiedExtraction && (
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Stats */}
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

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {/* Retry Smart Pass button */}
              {itemsNeedingReview > 0 && !isRunningSmartPass && (
                <Button
                  onClick={() => runSmartPass(true)}
                  variant="outline"
                  size="sm"
                  title="Re-run AI matching with latest codes and rules"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Smart Pass
                </Button>
              )}
              
              {/* Review button */}
              {itemsNeedingReview > 0 && (
                <Button
                  onClick={() => setShowMappingModal(true)}
                  className="bg-amber-600 hover:bg-amber-500 text-white"
                  size="sm"
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Review {itemsNeedingReview} items
                </Button>
              )}
            </div>

            {codifiedExtraction.isFullyConfirmed && (
              <span className="flex items-center gap-2 text-sm text-green-600 font-medium">
                <Check className="w-4 h-4" />
                All items confirmed - Ready to run model
              </span>
            )}
          </div>
        </div>
      )}

      {/* Data Viewer */}
      <div className="flex-1 overflow-auto p-4">
        {codifiedExtraction ? (
          <div className="space-y-4">
            {Object.entries(itemsByCategory)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, items]) => (
                <CategoryGroup
                  key={category}
                  category={category}
                  items={items}
                  defaultExpanded={true}
                />
              ))}
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
          onClose={() => setShowAddItemModal(false)}
          extractionId={codifiedExtraction._id}
          documentId={activeDocument._id}
          onItemAdded={() => {
            setShowAddItemModal(false);
            // Convex will automatically refresh the data
          }}
        />
      )}
    </div>
  );
}
