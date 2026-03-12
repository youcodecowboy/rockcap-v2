'use client';

import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GitBranch, Merge, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { VersionCandidateGroup } from '@/lib/versionDetection';
import type { Id } from '../../convex/_generated/dataModel';

interface VersionCandidatesPanelProps {
  groups: VersionCandidateGroup[];
  onApplyVersions: (versions: Array<{ itemId: Id<"bulkUploadItems">; version: string; isBase: boolean }>) => Promise<void>;
  onDeleteItems: (itemIds: Id<"bulkUploadItems">[]) => Promise<void>;
}

export default function VersionCandidatesPanel({ groups, onApplyVersions, onDeleteItems }: VersionCandidatesPanelProps) {
  // Track selected items per group: groupIndex -> Set of item _ids
  const [selections, setSelections] = useState<Map<number, Set<string>>>(new Map());
  const [versionModalGroup, setVersionModalGroup] = useState<number | null>(null);
  const [mergeModalGroup, setMergeModalGroup] = useState<number | null>(null);
  const [versionInputs, setVersionInputs] = useState<Map<string, string>>(new Map());
  const [keepItemId, setKeepItemId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const toggleItem = (groupIdx: number, itemId: string) => {
    setSelections(prev => {
      const next = new Map(prev);
      const groupSet = new Set(next.get(groupIdx) || []);
      if (groupSet.has(itemId)) {
        groupSet.delete(itemId);
      } else {
        groupSet.add(itemId);
      }
      next.set(groupIdx, groupSet);
      return next;
    });
  };

  const getSelectedCount = (groupIdx: number) => selections.get(groupIdx)?.size || 0;

  // Auto-suggest version order for modal
  const openVersionModal = (groupIdx: number) => {
    const group = groups[groupIdx];
    const selected = selections.get(groupIdx) || new Set();
    const selectedItems = group.items.filter(i => selected.has(i._id));

    // Sort by date if available, otherwise by version, otherwise by filename
    const sorted = [...selectedItems].sort((a, b) => {
      if (a.extractedDate && b.extractedDate) return a.extractedDate.localeCompare(b.extractedDate);
      if (a.extractedVersion && b.extractedVersion) return a.extractedVersion.localeCompare(b.extractedVersion);
      return a.fileName.localeCompare(b.fileName);
    });

    const inputs = new Map<string, string>();
    sorted.forEach((item, idx) => {
      inputs.set(item._id, `V${idx + 1}.0`);
    });
    setVersionInputs(inputs);
    setVersionModalGroup(groupIdx);
  };

  const openMergeModal = (groupIdx: number) => {
    const group = groups[groupIdx];
    const selected = selections.get(groupIdx) || new Set();
    const selectedItems = group.items.filter(i => selected.has(i._id));
    // Default to keeping the last item (newest by sort order)
    setKeepItemId(selectedItems[selectedItems.length - 1]?._id || null);
    setMergeModalGroup(groupIdx);
  };

  const handleApplyVersions = async () => {
    if (versionModalGroup === null) return;
    setIsApplying(true);
    try {
      const entries = Array.from(versionInputs.entries()).map(([itemId, version]) => ({
        itemId: itemId as Id<"bulkUploadItems">,
        version,
        isBase: version === 'V1.0',
      }));
      await onApplyVersions(entries);
      // Clear selection for this group
      setSelections(prev => {
        const next = new Map(prev);
        next.delete(versionModalGroup);
        return next;
      });
      setVersionModalGroup(null);
    } finally {
      setIsApplying(false);
    }
  };

  const handleMerge = async () => {
    if (mergeModalGroup === null || !keepItemId) return;
    setIsApplying(true);
    try {
      const group = groups[mergeModalGroup];
      const selected = selections.get(mergeModalGroup) || new Set();
      const toDelete = group.items
        .filter(i => selected.has(i._id) && i._id !== keepItemId)
        .map(i => i._id as Id<"bulkUploadItems">);
      await onDeleteItems(toDelete);
      setSelections(prev => {
        const next = new Map(prev);
        next.delete(mergeModalGroup);
        return next;
      });
      setMergeModalGroup(null);
    } finally {
      setIsApplying(false);
    }
  };

  if (groups.length === 0) return null;

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-amber-600" />
            <CardTitle className="text-base">Version Candidates Detected</CardTitle>
            <Badge variant="secondary" className="ml-auto">
              {groups.length} group{groups.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {groups.map((group, groupIdx) => {
            const selectedCount = getSelectedCount(groupIdx);
            return (
              <div key={group.normalizedName} className="border rounded-md p-3 bg-white">
                <div className="text-sm font-medium text-amber-800 mb-2 capitalize">
                  {group.normalizedName}
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    ({group.items.length} files)
                  </span>
                </div>
                <div className="space-y-1">
                  {group.items.map(item => (
                    <label
                      key={item._id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selections.get(groupIdx)?.has(item._id) || false}
                        onCheckedChange={() => toggleItem(groupIdx, item._id)}
                      />
                      <span className="text-xs truncate flex-1" title={item.fileName}>
                        {item.fileName}
                      </span>
                      {item.extractedDate && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {item.extractedDate}
                        </Badge>
                      )}
                      {item.extractedVersion && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {item.extractedVersion}
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
                {selectedCount >= 2 && (
                  <div className="flex gap-2 mt-2 pt-2 border-t">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      onClick={() => openVersionModal(groupIdx)}
                    >
                      <GitBranch className="w-3 h-3 mr-1" />
                      Version
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => openMergeModal(groupIdx)}
                    >
                      <Merge className="w-3 h-3 mr-1" />
                      Merge
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Version Assignment Modal */}
      <Dialog open={versionModalGroup !== null} onOpenChange={() => setVersionModalGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Version Numbers</DialogTitle>
            <DialogDescription>
              Set the version for each file. V1.0 is treated as the base version.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 my-4">
            {versionModalGroup !== null && groups[versionModalGroup] &&
              groups[versionModalGroup].items
                .filter(i => selections.get(versionModalGroup!)?.has(i._id))
                .map(item => (
                  <div key={item._id} className="flex items-center gap-3">
                    <span className="text-xs truncate flex-1" title={item.fileName}>
                      {item.fileName}
                    </span>
                    <Input
                      value={versionInputs.get(item._id) || ''}
                      onChange={(e) => {
                        setVersionInputs(prev => {
                          const next = new Map(prev);
                          next.set(item._id, e.target.value);
                          return next;
                        });
                      }}
                      className="w-20 h-7 text-xs font-mono text-center"
                    />
                  </div>
                ))
            }
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVersionModalGroup(null)}>Cancel</Button>
            <Button onClick={handleApplyVersions} disabled={isApplying}>
              {isApplying ? 'Applying...' : 'Apply Versions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Confirmation Modal */}
      <AlertDialog open={mergeModalGroup !== null} onOpenChange={() => setMergeModalGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge Files</AlertDialogTitle>
            <AlertDialogDescription>
              Choose which file to keep. The others will be deleted permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1 my-4">
            {mergeModalGroup !== null && groups[mergeModalGroup] &&
              groups[mergeModalGroup].items
                .filter(i => selections.get(mergeModalGroup!)?.has(i._id))
                .map(item => (
                  <label key={item._id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="radio"
                      name="keepItem"
                      checked={keepItemId === item._id}
                      onChange={() => setKeepItemId(item._id)}
                      className="accent-green-600"
                    />
                    <span className="text-xs truncate">{item.fileName}</span>
                    {keepItemId === item._id && (
                      <Badge className="bg-green-100 text-green-800 text-[10px]">Keep</Badge>
                    )}
                  </label>
                ))
            }
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleMerge}
              disabled={isApplying}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Merge — Delete {mergeModalGroup !== null ? (getSelectedCount(mergeModalGroup) - 1) : 0} copies
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
