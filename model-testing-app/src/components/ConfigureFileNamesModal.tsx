'use client';

import { useState, useEffect, useMemo } from 'react';
import { Settings, Sparkles } from 'lucide-react';
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
import { parseDocumentCode, abbreviateCategory, abbreviateText, generateDocumentCode } from '@/lib/documentCodeUtils';

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
  const [updateMode, setUpdateMode] = useState<'missing-only' | 'regenerate-all'>('missing-only');

  const updateDocumentCode = useMutation(api.documents.updateDocumentCode);

  // Calculate statistics
  const stats = useMemo(() => {
    const missingCodes = documents.filter(doc => !doc.documentCode || doc.documentCode.trim() === '');
    const hasCodes = documents.filter(doc => doc.documentCode && doc.documentCode.trim() !== '');
    
    // Find most common category for auto-population
    const categoryCounts: Record<string, number> = {};
    documents.forEach(doc => {
      categoryCounts[doc.category] = (categoryCounts[doc.category] || 0) + 1;
    });
    const mostCommonCategory = Object.entries(categoryCounts).reduce((a, b) => 
      categoryCounts[a[0]] > categoryCounts[b[0]] ? a : b
    )?.[0] || documents[0]?.category || '';

    return {
      total: documents.length,
      missingCodes: missingCodes.length,
      hasCodes: hasCodes.length,
      mostCommonCategory,
    };
  }, [documents]);

  // Auto-populate codes from client/project names and most common category
  useEffect(() => {
    // Auto-populate client code from clientName
    if (clientName && !clientCode) {
      const autoClientCode = abbreviateText(clientName, 8);
      setClientCode(autoClientCode);
    }

    // Auto-populate project code from projectName
    if (projectName && projectId && !projectCode) {
      const autoProjectCode = abbreviateText(projectName, 10);
      setProjectCode(autoProjectCode);
    }

    // Auto-populate type code from most common category
    if (stats.mostCommonCategory && !typeCode) {
      const autoTypeCode = abbreviateCategory(stats.mostCommonCategory);
      setTypeCode(autoTypeCode);
    }

    // If documents have existing codes, try to extract them
    if (documents.length > 0 && documents[0].documentCode) {
      const parsed = parseDocumentCode(documents[0].documentCode);
      if (parsed && parsed.type === 'client') {
        if (!clientCode) setClientCode(parsed.clientCode || '');
        if (!projectCode && parsed.projectCode) setProjectCode(parsed.projectCode);
        if (!typeCode) setTypeCode(parsed.typeCode || '');
      }
    } else if (documents.length > 0 && !typeCode) {
      // Fallback: use first document's category
      const firstDoc = documents[0];
      setTypeCode(abbreviateCategory(firstDoc.category));
    }
  }, [documents, clientName, projectName, projectId, stats.mostCommonCategory]);

  const handleAutoGenerate = async () => {
    if (!clientName) {
      alert('Client name is required for auto-generation');
      return;
    }

    setIsUpdating(true);
    try {
      // Determine which documents to update
      const docsToUpdate = updateMode === 'missing-only'
        ? documents.filter(doc => !doc.documentCode || doc.documentCode.trim() === '')
        : documents;

      if (docsToUpdate.length === 0) {
        alert(`No documents ${updateMode === 'missing-only' ? 'without codes' : 'to update'}`);
        setIsUpdating(false);
        return;
      }

      // Track codes we're generating to ensure uniqueness within this batch
      const usedCodes = new Set<string>();
      let successCount = 0;
      let errorCount = 0;
      
      // Generate new codes for documents using their original uploaded dates and categories
      for (const doc of docsToUpdate) {
        try {
          // Generate code using the document's category and upload date
          const generatedCode = generateDocumentCode(
            clientName,
            doc.category,
            projectId && projectName ? projectName : undefined,
            doc.uploadedAt
          );

          // Ensure uniqueness within this batch
          let finalCode = generatedCode;
          let counter = 1;
          while (usedCodes.has(finalCode)) {
            finalCode = `${generatedCode}-${counter}`;
            counter++;
          }

          usedCodes.add(finalCode);
          await updateDocumentCode({ id: doc._id, documentCode: finalCode });
          successCount++;
        } catch (error: any) {
          console.error(`Failed to update document ${doc._id}:`, error);
          // If it's a uniqueness error, try with a counter
          if (error.message?.includes('already exists')) {
            try {
              const baseCode = generateDocumentCode(
                clientName,
                doc.category,
                projectId && projectName ? projectName : undefined,
                doc.uploadedAt
              );
              let finalCode = `${baseCode}-${Date.now()}`;
              await updateDocumentCode({ id: doc._id, documentCode: finalCode });
              successCount++;
            } catch (retryError) {
              errorCount++;
            }
          } else {
            errorCount++;
          }
        }
      }

      if (errorCount > 0) {
        alert(`Generated codes for ${successCount} document(s). ${errorCount} failed (likely due to duplicate codes).`);
      } else {
        alert(`Successfully generated codes for ${successCount} document(s)`);
      }
      
      onClose();
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to auto-generate document codes:', error);
      alert('Failed to auto-generate document codes. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSave = async () => {
    if (!clientCode.trim() || !typeCode.trim()) {
      alert('Client code and type code are required');
      return;
    }

    setIsUpdating(true);
    try {
      // Determine which documents to update
      const docsToUpdate = updateMode === 'missing-only'
        ? documents.filter(doc => !doc.documentCode || doc.documentCode.trim() === '')
        : documents;

      if (docsToUpdate.length === 0) {
        alert(`No documents ${updateMode === 'missing-only' ? 'without codes' : 'to update'}`);
        setIsUpdating(false);
        return;
      }

      // Track codes we're generating to ensure uniqueness within this batch
      const usedCodes = new Set<string>();
      let successCount = 0;
      let errorCount = 0;
      
      // Generate new codes for all documents using their original uploaded dates
      for (const doc of docsToUpdate) {
        try {
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
          successCount++;
        } catch (error: any) {
          console.error(`Failed to update document ${doc._id}:`, error);
          // If it's a uniqueness error, try with a counter
          if (error.message?.includes('already exists')) {
            try {
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
              
              const finalCode = `${baseCode}-${Date.now()}`;
              await updateDocumentCode({ id: doc._id, documentCode: finalCode });
              successCount++;
            } catch (retryError) {
              errorCount++;
            }
          } else {
            errorCount++;
          }
        }
      }

      if (errorCount > 0) {
        alert(`Updated ${successCount} document(s). ${errorCount} failed (likely due to duplicate codes).`);
      } else {
        alert(`Successfully updated ${successCount} document(s)`);
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
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configure File Names
          </DialogTitle>
          <DialogDescription>
            Customize the naming pattern for {projectId ? 'project' : 'client'} documents
            {stats.missingCodes > 0 && (
              <span className="block mt-1 text-orange-600">
                {stats.missingCodes} document(s) need codes assigned
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
          {/* Statistics */}
          {stats.missingCodes > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
              <div className="text-sm text-orange-900">
                <strong>{stats.missingCodes}</strong> document(s) without codes • <strong>{stats.hasCodes}</strong> with codes
              </div>
            </div>
          )}

          {/* Auto-Generate Section */}
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <Label className="text-sm font-semibold">Auto-Generate Codes</Label>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Automatically generate document codes using client/project names and document categories
            </p>
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="missing-only"
                  name="updateMode"
                  checked={updateMode === 'missing-only'}
                  onChange={() => setUpdateMode('missing-only')}
                  className="w-4 h-4"
                />
                <Label htmlFor="missing-only" className="text-sm cursor-pointer">
                  Only documents without codes ({stats.missingCodes})
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="regenerate-all"
                  name="updateMode"
                  checked={updateMode === 'regenerate-all'}
                  onChange={() => setUpdateMode('regenerate-all')}
                  className="w-4 h-4"
                />
                <Label htmlFor="regenerate-all" className="text-sm cursor-pointer">
                  All documents (regenerate existing codes) ({stats.total})
                </Label>
              </div>
            </div>
            <Button
              onClick={handleAutoGenerate}
              disabled={isUpdating || !clientName}
              className="w-full gap-2"
              variant="default"
            >
              <Sparkles className="w-4 h-4" />
              {isUpdating ? 'Generating...' : `Auto-Generate Codes (${updateMode === 'missing-only' ? stats.missingCodes : stats.total})`}
            </Button>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Settings className="w-4 h-4 text-gray-600" />
              <Label className="text-sm font-semibold">Manual Configuration</Label>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Or manually configure codes using the fields below
            </p>
          </div>
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

        <DialogFooter className="flex-shrink-0 border-t pt-4 mt-4">
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
            {isUpdating ? 'Updating...' : `Apply to ${updateMode === 'missing-only' ? stats.missingCodes : stats.total} Document(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

