'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { Trash2 } from 'lucide-react';

interface DangerZoneProps {
  entityType: 'client' | 'project';
  entityName: string;
  cascadeCount?: number;
  onConfirmTrash: () => Promise<void>;
}

export default function DangerZone({
  entityType,
  entityName,
  cascadeCount,
  onConfirmTrash,
}: DangerZoneProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);

  const handleTrash = async () => {
    setIsTrashing(true);
    try {
      await onConfirmTrash();
      setShowConfirm(false);
    } catch (error) {
      console.error('Trash failed:', error);
    } finally {
      setIsTrashing(false);
    }
  };

  return (
    <>
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="rounded-lg border border-red-200 p-4">
          <h3 className="text-sm font-semibold text-red-600 mb-1">Danger Zone</h3>
          <p className="text-sm text-gray-600 mb-3">
            Move this {entityType} to trash. It can be restored from the Deleted filter
            in the {entityType === 'client' ? 'clients sidebar' : 'projects tab'}.
          </p>
          {entityType === 'client' && cascadeCount !== undefined && cascadeCount > 0 && (
            <p className="text-xs text-amber-600 mb-3">
              This will also move {cascadeCount} active project{cascadeCount !== 1 ? 's' : ''} to trash.
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            onClick={() => setShowConfirm(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Move to Trash
          </Button>
        </div>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {entityName} to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {entityType === 'client' && cascadeCount ? (
                <>This will move the client and {cascadeCount} active project{cascadeCount !== 1 ? 's' : ''} to trash. You can restore them later.</>
              ) : (
                <>This will move the {entityType} to trash. You can restore it later.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTrash}
              disabled={isTrashing}
              className="bg-red-600 hover:bg-red-700"
            >
              {isTrashing ? 'Moving...' : 'Move to Trash'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
