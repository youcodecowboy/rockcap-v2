'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { parseDocumentCode, abbreviateCategory, abbreviateText, formatDateDDMMYY } from '@/lib/documentCodeUtils';

interface DocumentCodeEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentCode?: string;
  fileName: string;
  category: string;
  clientName?: string;
  projectName?: string;
  uploadedAt: string;
  documentId?: Id<"documents">;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
  onUpdate?: () => void;
}

export default function DocumentCodeEditorModal({
  isOpen,
  onClose,
  documentCode,
  fileName,
  category,
  clientName,
  projectName,
  uploadedAt,
  documentId,
  clientId,
  projectId,
  onUpdate,
}: DocumentCodeEditorModalProps) {
  const [clientCode, setClientCode] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [typeCode, setTypeCode] = useState('');
  const [dateCode, setDateCode] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMode, setUpdateMode] = useState<'single' | 'client' | 'project'>('single');

  const updateDocumentCode = useMutation(api.documents.updateDocumentCode);
  const updateCodesForClient = useMutation(api.documents.updateDocumentCodesForClient);
  const updateCodesForProject = useMutation(api.documents.updateDocumentCodesForProject);

  // Parse existing code or initialize from values
  useEffect(() => {
    if (documentCode) {
      const parsed = parseDocumentCode(documentCode);
      if (parsed && parsed.type === 'client') {
        setClientCode(parsed.clientCode || '');
        setProjectCode(parsed.projectCode || '');
        setTypeCode(parsed.typeCode || '');
        setDateCode(parsed.date || '');
      }
    } else {
      // Initialize from current values
      if (clientName) {
        setClientCode(abbreviateText(clientName, 8));
      }
      if (projectName) {
        setProjectCode(abbreviateText(projectName, 10));
      }
      setTypeCode(abbreviateCategory(category));
      setDateCode(formatDateDDMMYY(uploadedAt));
    }
  }, [documentCode, clientName, projectName, category, uploadedAt]);

  const previewCode = useMemo(() => {
    if (!clientCode.trim() || !typeCode.trim() || !dateCode.trim()) return '';
    
    if (projectCode.trim()) {
      return `${clientCode.toUpperCase()}-${typeCode.toUpperCase()}-${projectCode.toUpperCase()}-${dateCode}`;
    } else {
      return `${clientCode.toUpperCase()}-${typeCode.toUpperCase()}-${dateCode}`;
    }
  }, [clientCode, typeCode, projectCode, dateCode]);

  const handleSave = async () => {
    if (!clientCode.trim() || !typeCode.trim() || !dateCode.trim()) {
      alert('Client code, type code, and date are required');
      return;
    }

    if (!documentId) {
      alert('Document must be filed before editing code');
      return;
    }

    setIsUpdating(true);
    try {
      if (updateMode === 'single') {
        await updateDocumentCode({
          id: documentId,
          documentCode: previewCode,
        });
      } else if (updateMode === 'client' && clientId) {
        await updateDocumentCode({
          id: documentId,
          documentCode: previewCode,
        });
        await updateCodesForClient({
          clientId,
          documentCodePattern: previewCode,
          excludeDocumentId: documentId,
        });
      } else if (updateMode === 'project' && projectId) {
        await updateDocumentCode({
          id: documentId,
          documentCode: previewCode,
        });
        await updateCodesForProject({
          projectId,
          documentCodePattern: previewCode,
          excludeDocumentId: documentId,
        });
      }
      
      onClose();
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Document Code</DialogTitle>
          <DialogDescription>
            Configure the document code components
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="clientCode">Client Code</Label>
            <Input
              id="clientCode"
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value.toUpperCase())}
              placeholder="CLIENT"
              maxLength={8}
            />
          </div>
          
          <div>
            <Label htmlFor="typeCode">Type Code</Label>
            <Input
              id="typeCode"
              value={typeCode}
              onChange={(e) => setTypeCode(e.target.value.toUpperCase())}
              placeholder="VAL"
              maxLength={3}
            />
          </div>
          
          {projectName && (
            <div>
              <Label htmlFor="projectCode">Project Code</Label>
              <Input
                id="projectCode"
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value.toUpperCase())}
                placeholder="PROJECT"
                maxLength={10}
              />
            </div>
          )}
          
          <div>
            <Label htmlFor="dateCode">Date Code (DDMMYY)</Label>
            <Input
              id="dateCode"
              value={dateCode}
              onChange={(e) => setDateCode(e.target.value)}
              placeholder="251120"
              maxLength={6}
            />
          </div>
          
          {previewCode && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <Label className="text-xs text-gray-600 mb-1 block">Preview</Label>
              <div className="font-mono text-sm text-gray-900">{previewCode}</div>
            </div>
          )}
          
          {clientId && (
            <div className="space-y-2">
              <Label>Apply to:</Label>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="updateMode"
                    value="single"
                    checked={updateMode === 'single'}
                    onChange={(e) => setUpdateMode(e.target.value as 'single')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">This document only</span>
                </label>
                {clientId && (
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="updateMode"
                      value="client"
                      checked={updateMode === 'client'}
                      onChange={(e) => setUpdateMode(e.target.value as 'client')}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">All {clientName} documents</span>
                  </label>
                )}
                {projectId && (
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="updateMode"
                      value="project"
                      checked={updateMode === 'project'}
                      onChange={(e) => setUpdateMode(e.target.value as 'project')}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">All {projectName} documents</span>
                  </label>
                )}
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isUpdating}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isUpdating || !previewCode}>
            {isUpdating ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}










