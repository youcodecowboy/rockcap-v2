'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { FileText, Trash2, AlertTriangle, Check, Loader2, ChevronDown, ChevronRight } from 'lucide-react';

interface DocumentContributionsPanelProps {
  projectId: Id<'projects'>;
  documentId: Id<'documents'>;
  documentName: string;
  onRevertComplete?: () => void;
}

export default function DocumentContributionsPanel({
  projectId,
  documentId,
  documentName,
  onRevertComplete,
}: DocumentContributionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Query items from this document
  const itemsFromDocument = useQuery(
    api.projectDataLibrary.getItemsFromDocument,
    { projectId, documentId }
  );

  // Mutation to revert
  const revertDocumentAddition = useMutation(api.projectDataLibrary.revertDocumentAddition);

  const handleRevert = async () => {
    setIsReverting(true);
    try {
      const result = await revertDocumentAddition({
        projectId,
        documentId,
        createBackupSnapshot: true,
      });
      console.log('[DocumentContributions] Reverted:', result);
      setShowConfirm(false);
      onRevertComplete?.();
    } catch (error) {
      console.error('[DocumentContributions] Revert failed:', error);
    } finally {
      setIsReverting(false);
    }
  };

  if (!itemsFromDocument || itemsFromDocument.length === 0) {
    return null;
  }

  // Group items by category
  const itemsByCategory: Record<string, typeof itemsFromDocument> = {};
  itemsFromDocument.forEach(item => {
    if (!itemsByCategory[item.category]) {
      itemsByCategory[item.category] = [];
    }
    itemsByCategory[item.category].push(item);
  });

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
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
          <FileText className="w-4 h-4 text-blue-500" />
          <span className="font-medium text-gray-900">{documentName}</span>
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
            {itemsFromDocument.length} items contributed
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setShowConfirm(true);
          }}
          className="text-red-600 border-red-200 hover:bg-red-50"
        >
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          Remove All
        </Button>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200">
          <div className="space-y-4">
            {Object.entries(itemsByCategory)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, items]) => (
                <div key={category}>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">{category}</h4>
                  <div className="bg-gray-50 rounded-lg divide-y divide-gray-200">
                    {items.map(item => (
                      <div key={item._id} className="px-3 py-2 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-mono text-gray-400 mr-2">
                            {item.itemCode}
                          </span>
                          <span className="text-sm text-gray-900">{item.originalName}</span>
                          {item.hasMultipleSources && (
                            <span className="ml-2 text-xs text-orange-600">
                              (has {item.valueHistory.length} versions)
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-700">
                          {item.currentDataType === 'currency' && typeof item.currentValue === 'number'
                            ? new Intl.NumberFormat('en-GB', { 
                                style: 'currency', 
                                currency: 'GBP',
                                maximumFractionDigits: 0 
                              }).format(item.currentValue)
                            : item.currentValue}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowConfirm(false)} />
          <div className="relative bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-semibold">Remove Document Data</h3>
            </div>
            
            <p className="text-gray-600 mb-4">
              This will remove all <strong>{itemsFromDocument.length} items</strong> that came from{' '}
              <strong>{documentName}</strong> from the project data library.
            </p>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2 text-amber-700 text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">What will happen:</p>
                  <ul className="list-disc list-inside mt-1 text-xs">
                    <li>Items only from this document will be deleted</li>
                    <li>Items with multiple sources will revert to the previous value</li>
                    <li>A backup snapshot will be created automatically</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                disabled={isReverting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRevert}
                className="bg-red-600 hover:bg-red-700"
                disabled={isReverting}
              >
                {isReverting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove Data
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

