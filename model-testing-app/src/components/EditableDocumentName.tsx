'use client';

import { useState } from 'react';
import { Edit2, Check, X, FileText, Building2, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

interface EditableDocumentNameProps {
  documentCode: string | undefined;
  fileName: string;
  documentId: Id<"documents">;
  clientId?: Id<"clients">;
  clientName?: string;
  projectId?: Id<"projects">;
  projectName?: string;
  onUpdate?: () => void;
}

export default function EditableDocumentName({
  documentCode,
  fileName,
  documentId,
  clientId,
  clientName,
  projectId,
  projectName,
  onUpdate,
}: EditableDocumentNameProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(documentCode || '');
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [pendingCode, setPendingCode] = useState('');
  
  const updateDocumentCode = useMutation(api.documents.updateDocumentCode);
  const updateCodesForClient = useMutation(api.documents.updateDocumentCodesForClient);
  const updateCodesForProject = useMutation(api.documents.updateDocumentCodesForProject);
  
  const [isUpdating, setIsUpdating] = useState(false);

  const handleEdit = () => {
    setEditedCode(documentCode || '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedCode(documentCode || '');
    setIsEditing(false);
  };

  const handleSave = () => {
    if (editedCode.trim() === '') {
      return;
    }
    
    // Show bulk update dialog
    setPendingCode(editedCode);
    setShowBulkDialog(true);
    setIsEditing(false);
  };

  const handleBulkUpdate = async (scope: 'single' | 'client' | 'project') => {
    setIsUpdating(true);
    try {
      if (scope === 'single') {
        await updateDocumentCode({
          id: documentId,
          documentCode: pendingCode,
        });
      } else if (scope === 'client' && clientId) {
        // First update the current document
        await updateDocumentCode({
          id: documentId,
          documentCode: pendingCode,
        });
        // Then update all other documents for this client
        await updateCodesForClient({
          clientId,
          documentCodePattern: pendingCode,
          excludeDocumentId: documentId,
        });
      } else if (scope === 'project' && projectId) {
        // First update the current document
        await updateDocumentCode({
          id: documentId,
          documentCode: pendingCode,
        });
        // Then update all other documents for this project
        await updateCodesForProject({
          projectId,
          documentCodePattern: pendingCode,
          excludeDocumentId: documentId,
        });
      }
      
      setShowBulkDialog(false);
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to update document code:', error);
      alert('Failed to update document code. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const displayCode = documentCode || fileName;

  return (
    <>
      <div className="flex items-start gap-2">
        {isEditing ? (
          <div className="flex-1 flex items-center gap-2">
            <Input
              value={editedCode}
              onChange={(e) => setEditedCode(e.target.value)}
              className="text-2xl font-bold h-10"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                } else if (e.key === 'Escape') {
                  handleCancel();
                }
              }}
            />
            <Button
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={editedCode.trim() === ''}
              className="h-10"
            >
              <Check className="w-4 h-4 mr-1" />
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-10"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex-1">
            <div className="flex items-center gap-2 group">
              <h1 className="text-2xl font-bold text-gray-900">
                {displayCode}
              </h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEdit}
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Edit document name"
              >
                <Edit2 className="w-4 h-4 text-gray-500" />
              </Button>
            </div>
            {documentCode && fileName !== documentCode && (
              <p className="text-sm text-gray-500 mt-1.5">
                Original filename: <span className="font-mono">{fileName}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bulk Update Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Document Name</DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              Choose where to apply this document name change
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <button
              onClick={() => handleBulkUpdate('single')}
              disabled={isUpdating}
              className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-gray-100 group-hover:bg-blue-100 transition-colors">
                  <FileText className="w-5 h-5 text-gray-600 group-hover:text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 mb-0.5">This Document Only</div>
                  <div className="text-sm text-gray-500">Update only this document's name</div>
                </div>
              </div>
            </button>
            {clientId && clientName && (
              <button
                onClick={() => handleBulkUpdate('client')}
                disabled={isUpdating}
                className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-gray-100 group-hover:bg-green-100 transition-colors">
                    <Building2 className="w-5 h-5 text-gray-600 group-hover:text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 mb-0.5">All Client Documents</div>
                    <div className="text-sm text-gray-500 truncate">{clientName}</div>
                  </div>
                </div>
              </button>
            )}
            {projectId && projectName && (
              <button
                onClick={() => handleBulkUpdate('project')}
                disabled={isUpdating}
                className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-gray-100 group-hover:bg-purple-100 transition-colors">
                    <FolderKanban className="w-5 h-5 text-gray-600 group-hover:text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 mb-0.5">All Project Documents</div>
                    <div className="text-sm text-gray-500 truncate">{projectName}</div>
                  </div>
                </div>
              </button>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowBulkDialog(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

