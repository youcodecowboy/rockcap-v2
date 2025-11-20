'use client';

import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
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
import { parseDocumentCode, abbreviateCategory } from '@/lib/documentCodeUtils';

interface ConfigureFileNamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: Array<{
    _id: Id<"documents">;
    documentCode?: string;
    category: string;
    uploadedAt: string;
  }>;
  clientId?: Id<"clients">;
  clientName?: string;
  projectId?: Id<"projects">;
  projectName?: string;
  onUpdate?: () => void;
}

export default function ConfigureFileNamesModal({
  isOpen,
  onClose,
  documents,
  clientId,
  clientName,
  projectId,
  projectName,
  onUpdate,
}: ConfigureFileNamesModalProps) {
  const [clientCode, setClientCode] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [typeCode, setTypeCode] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const updateDocumentCode = useMutation(api.documents.updateDocumentCode);

  // Extract codes from first document
  useEffect(() => {
    if (documents.length > 0 && documents[0].documentCode) {
      const parsed = parseDocumentCode(documents[0].documentCode);
      if (parsed && parsed.type === 'client') {
        setClientCode(parsed.clientCode || '');
        setProjectCode(parsed.projectCode || '');
        setTypeCode(parsed.typeCode || '');
      }
    } else if (documents.length > 0) {
      // If no document code, generate type code from category
      const firstDoc = documents[0];
      setTypeCode(abbreviateCategory(firstDoc.category));
    }
  }, [documents]);

  const handleSave = async () => {
    if (!clientCode.trim() || !typeCode.trim()) {
      alert('Client code and type code are required');
      return;
    }

    setIsUpdating(true);
    try {
      // Track codes we're generating to ensure uniqueness
      const usedCodes = new Set<string>();
      
      // Generate new codes for all documents using their original uploaded dates
      for (const doc of documents) {
        const date = new Date(doc.uploadedAt);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = String(date.getFullYear()).slice(-2);
        const dateCode = `${day}${month}${year}`;
        
        let baseCode: string;
        if (projectId && projectCode.trim()) {
          baseCode = `${clientCode.toUpperCase()}-${typeCode.toUpperCase()}-${projectCode.toUpperCase()}-${dateCode}`;
        } else {
          baseCode = `${clientCode.toUpperCase()}-${typeCode.toUpperCase()}-${dateCode}`;
        }

        // Ensure uniqueness within this batch
        let finalCode = baseCode;
        let counter = 1;
        while (usedCodes.has(finalCode)) {
          finalCode = `${baseCode}-${counter}`;
          counter++;
        }

        usedCodes.add(finalCode);
        await updateDocumentCode({ id: doc._id, documentCode: finalCode });
      }

      onClose();
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to update document codes:', error);
      alert('Failed to update document codes. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const previewCode = () => {
    if (!clientCode.trim() || !typeCode.trim()) return '';
    const dateCode = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).replace(/\//g, '');
    
    if (projectId && projectCode.trim()) {
      return `${clientCode.toUpperCase()}-${typeCode.toUpperCase()}-${projectCode.toUpperCase()}-${dateCode}`;
    }
    return `${clientCode.toUpperCase()}-${typeCode.toUpperCase()}-${dateCode}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configure File Names
          </DialogTitle>
          <DialogDescription>
            Customize the naming pattern for {projectId ? 'project' : 'client'} documents
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="clientCode" className="text-sm font-medium">
              Client Name Code
            </Label>
            <Input
              id="clientCode"
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="e.g., FIRESIDE"
              className="font-mono"
              maxLength={8}
            />
            <p className="text-xs text-gray-500">
              Abbreviated client name (max 8 characters, alphanumeric only)
            </p>
          </div>

          {projectId && (
            <div className="space-y-2">
              <Label htmlFor="projectCode" className="text-sm font-medium">
                Project Code
              </Label>
              <Input
                id="projectCode"
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="e.g., WELLINGTON"
                className="font-mono"
                maxLength={10}
              />
              <p className="text-xs text-gray-500">
                Abbreviated project name (max 10 characters, alphanumeric only)
              </p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="typeCode" className="text-sm font-medium">
                Type Code
              </Label>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Standard</span>
            </div>
            <Input
              id="typeCode"
              value={typeCode}
              onChange={(e) => setTypeCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="e.g., VAL, OPR, DOC"
              className="font-mono"
              maxLength={3}
            />
            <p className="text-xs text-gray-500">
              Document type abbreviation (max 3 characters, e.g., VAL, OPR, DOC)
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Date Format</Label>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Standard</span>
            </div>
            <div className="px-3 py-2 bg-gray-50 rounded-md border border-gray-200">
              <span className="text-sm font-mono text-gray-700">DDMMYY (automatically applied)</span>
            </div>
            <p className="text-xs text-gray-500">
              Date format is fixed and automatically applied based on upload date
            </p>
          </div>

          {previewCode() && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-sm font-medium">Preview</Label>
              <div className="px-3 py-2 bg-blue-50 rounded-md border border-blue-200">
                <span className="text-sm font-mono text-blue-900">{previewCode()}</span>
              </div>
              <p className="text-xs text-gray-500">
                Example document code with today's date
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isUpdating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isUpdating || !clientCode.trim() || !typeCode.trim()}
          >
            {isUpdating ? 'Updating...' : 'Apply to All Documents'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

