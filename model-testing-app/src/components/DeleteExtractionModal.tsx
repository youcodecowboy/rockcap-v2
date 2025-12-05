'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2, X, Loader2, Database, FileText, History } from 'lucide-react';

interface DeleteExtractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  extractionId: Id<'codifiedExtractions'>;
  documentName: string;
  onDeleteComplete?: () => void;
}

export default function DeleteExtractionModal({
  isOpen,
  onClose,
  extractionId,
  documentName,
  onDeleteComplete,
}: DeleteExtractionModalProps) {
  const [step, setStep] = useState<'impact' | 'confirm' | 'deleting'>('impact');
  const [keepSnapshot, setKeepSnapshot] = useState(true);

  // Query to check delete impact
  const impact = useQuery(
    api.codifiedExtractions.getDeleteImpact,
    { extractionId }
  );

  // Mutation to soft delete
  const softDelete = useMutation(api.codifiedExtractions.softDelete);
  
  // Mutation to revert document addition from library
  const revertDocumentAddition = useMutation(api.projectDataLibrary.revertDocumentAddition);

  // Get extraction details
  const extraction = useQuery(
    api.codifiedExtractions.get,
    { id: extractionId }
  );

  // Reset step when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('impact');
      setKeepSnapshot(true);
    }
  }, [isOpen]);

  const handleDelete = async () => {
    setStep('deleting');
    
    try {
      // If merged to library, first remove items from library
      if (impact?.mergedItems && impact.mergedItems > 0 && extraction?.projectId) {
        await revertDocumentAddition({
          projectId: extraction.projectId,
          documentId: extraction.documentId,
          createBackupSnapshot: keepSnapshot,
        });
      }
      
      // Soft delete the extraction
      await softDelete({
        extractionId,
        reason: 'User deleted bad extraction data',
      });
      
      onDeleteComplete?.();
      onClose();
    } catch (error) {
      console.error('Delete failed:', error);
      setStep('impact');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3 text-red-600">
            <Trash2 className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Delete Extraction Data</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'impact' && (
            <>
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-amber-800 font-medium">
                    You are about to delete extraction data from:
                  </p>
                  <p className="text-amber-700 text-sm mt-1 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {documentName}
                  </p>
                </div>
              </div>

              {impact ? (
                <div className="space-y-4">
                  {/* Impact Summary */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">
                        {impact.mergedItems}
                      </div>
                      <div className="text-sm text-gray-500">Items extracted</div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">
                        {impact.wouldRemoveItems + impact.wouldRevertItems}
                      </div>
                      <div className="text-sm text-gray-500">Library items affected</div>
                    </div>
                  </div>

                  {/* Detailed Impact */}
                  {impact.mergedItems > 0 && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        Impact on Project Data Library
                      </h4>
                      <ul className="space-y-2 text-sm">
                        {impact.wouldRemoveItems > 0 && (
                          <li className="flex items-center gap-2 text-red-600">
                            <span className="w-2 h-2 rounded-full bg-red-500" />
                            <strong>{impact.wouldRemoveItems}</strong> items will be deleted
                            <span className="text-gray-500">(only source)</span>
                          </li>
                        )}
                        {impact.wouldRevertItems > 0 && (
                          <li className="flex items-center gap-2 text-amber-600">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <strong>{impact.wouldRevertItems}</strong> items will revert to previous value
                            <span className="text-gray-500">(has other sources)</span>
                          </li>
                        )}
                        {impact.wouldRemoveItems === 0 && impact.wouldRevertItems === 0 && (
                          <li className="text-gray-500">
                            No items will be affected in the library
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Snapshot option */}
                  {impact.mergedItems > 0 && (
                    <label className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={keepSnapshot}
                        onChange={(e) => setKeepSnapshot(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-blue-900 flex items-center gap-2">
                          <History className="w-4 h-4" />
                          Create backup snapshot before deleting
                        </div>
                        <div className="text-xs text-blue-700 mt-0.5">
                          Allows you to restore the library to its current state if needed
                        </div>
                      </div>
                    </label>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              )}
            </>
          )}

          {step === 'confirm' && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Are you absolutely sure?
              </h3>
              <p className="text-gray-600 mb-4">
                This action cannot be easily undone.
                {keepSnapshot ? ' A backup snapshot will be created.' : ' No backup will be created.'}
              </p>
              <p className="text-sm text-gray-500">
                Type <strong className="text-red-600">DELETE</strong> to confirm
              </p>
              <input
                type="text"
                placeholder="Type DELETE"
                className="mt-2 px-4 py-2 border border-gray-300 rounded-lg text-center w-32 focus:outline-none focus:ring-2 focus:ring-red-500"
                onChange={(e) => {
                  if (e.target.value === 'DELETE') {
                    handleDelete();
                  }
                }}
              />
            </div>
          )}

          {step === 'deleting' && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-red-600 mx-auto mb-4" />
              <p className="text-gray-600">Deleting extraction data...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'impact' && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => setStep('confirm')}
              className="bg-red-600 hover:bg-red-700"
              disabled={!impact}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Continue
            </Button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="flex justify-center px-6 py-4 border-t border-gray-200">
            <Button variant="outline" onClick={() => setStep('impact')}>
              Go Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

