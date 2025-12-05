'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { X, History, FileStack, RotateCcw, Calendar, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

interface DataLibraryHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: Id<'projects'>;
}

export default function DataLibraryHistoryModal({
  isOpen,
  onClose,
  projectId,
}: DataLibraryHistoryModalProps) {
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<Id<'dataLibrarySnapshots'> | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [showConfirmRevert, setShowConfirmRevert] = useState(false);

  // Query snapshots
  const snapshots = useQuery(
    api.dataLibrarySnapshots.getSnapshotsByProject,
    { projectId }
  );

  // Query selected snapshot details
  const selectedSnapshot = useQuery(
    api.dataLibrarySnapshots.getSnapshot,
    selectedSnapshotId ? { snapshotId: selectedSnapshotId } : 'skip'
  );

  // Mutation to revert
  const revertToSnapshot = useMutation(api.dataLibrarySnapshots.revertToSnapshot);

  // Group snapshots by date
  const snapshotsByDate = useMemo(() => {
    if (!snapshots) return {};
    
    const grouped: Record<string, typeof snapshots> = {};
    snapshots.forEach(snapshot => {
      const date = new Date(snapshot.createdAt).toLocaleDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(snapshot);
    });
    
    return grouped;
  }, [snapshots]);

  const handleRevert = async () => {
    if (!selectedSnapshotId) return;
    
    setIsReverting(true);
    try {
      await revertToSnapshot({ snapshotId: selectedSnapshotId });
      setShowConfirmRevert(false);
      onClose();
    } catch (error) {
      console.error('Revert failed:', error);
    } finally {
      setIsReverting(false);
    }
  };

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'model_run': return 'Model Run';
      case 'manual_save': return 'Manual Save';
      case 'pre_revert_backup': return 'Before Revert';
      case 'pre_delete_backup': return 'Before Delete';
      default: return reason;
    }
  };

  const getReasonColor = (reason: string) => {
    switch (reason) {
      case 'model_run': return 'bg-blue-100 text-blue-700';
      case 'manual_save': return 'bg-green-100 text-green-700';
      case 'pre_revert_backup': return 'bg-amber-100 text-amber-700';
      case 'pre_delete_backup': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Library History</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Snapshots List */}
          <div className="w-1/2 border-r border-gray-200 overflow-auto">
            <div className="p-4">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Saved Snapshots</h3>
              
              {!snapshots || snapshots.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No snapshots yet</p>
                  <p className="text-xs mt-1">Snapshots are created during model runs</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(snapshotsByDate).map(([date, dateSnapshots]) => (
                    <div key={date}>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                        <Calendar className="w-3 h-3" />
                        {date}
                      </div>
                      <div className="space-y-2">
                        {dateSnapshots.map(snapshot => (
                          <button
                            key={snapshot._id}
                            onClick={() => setSelectedSnapshotId(snapshot._id)}
                            className={`w-full text-left p-3 rounded-lg border transition-colors ${
                              selectedSnapshotId === snapshot._id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-xs px-2 py-0.5 rounded ${getReasonColor(snapshot.reason)}`}>
                                {getReasonLabel(snapshot.reason)}
                              </span>
                              <span className="text-xs text-gray-500">
                                {new Date(snapshot.createdAt).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-gray-600">
                              <span>{snapshot.itemCount} items</span>
                              <span>•</span>
                              <span>{snapshot.documentCount} docs</span>
                            </div>
                            {snapshot.description && (
                              <p className="text-xs text-gray-500 mt-1 truncate">
                                {snapshot.description}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Snapshot Details */}
          <div className="w-1/2 overflow-auto">
            {selectedSnapshot ? (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-900">Snapshot Details</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowConfirmRevert(true)}
                    className="text-amber-600 border-amber-200 hover:bg-amber-50"
                  >
                    <RotateCcw className="w-4 h-4 mr-1.5" />
                    Revert to this
                  </Button>
                </div>

                <div className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-gray-900">
                        {selectedSnapshot.itemCount}
                      </div>
                      <div className="text-xs text-gray-500">Total Items</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-gray-900">
                        {selectedSnapshot.documentCount}
                      </div>
                      <div className="text-xs text-gray-500">Source Documents</div>
                    </div>
                  </div>

                  {/* Items preview */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 mb-2">
                      Items in this snapshot
                    </h4>
                    <div className="max-h-64 overflow-auto border border-gray-200 rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Code</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Name</th>
                            <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedSnapshot.items.slice(0, 50).map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-xs font-mono text-gray-500">
                                {item.itemCode}
                              </td>
                              <td className="px-3 py-2 text-gray-900 truncate max-w-[150px]">
                                {item.originalName}
                              </td>
                              <td className="px-3 py-2 text-right font-medium">
                                {typeof item.value === 'number'
                                  ? new Intl.NumberFormat('en-GB', { 
                                      style: 'currency', 
                                      currency: 'GBP',
                                      maximumFractionDigits: 0 
                                    }).format(item.value)
                                  : item.value}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {selectedSnapshot.items.length > 50 && (
                        <div className="text-center py-2 text-xs text-gray-500 bg-gray-50">
                          + {selectedSnapshot.items.length - 50} more items
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <FileStack className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Select a snapshot to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Confirm Revert Dialog */}
        {showConfirmRevert && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4">
              <div className="flex items-center gap-3 text-amber-600 mb-4">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-lg font-semibold">Confirm Revert</h3>
              </div>
              <p className="text-gray-600 mb-4">
                This will restore the data library to the state it was in at{' '}
                <strong>
                  {selectedSnapshot && new Date(selectedSnapshot.createdAt).toLocaleString()}
                </strong>
                . A backup of the current state will be created automatically.
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmRevert(false)}
                  disabled={isReverting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRevert}
                  className="bg-amber-600 hover:bg-amber-700"
                  disabled={isReverting}
                >
                  {isReverting ? 'Reverting...' : 'Revert'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

