'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Save, FileSpreadsheet, Check, Loader2, Download } from 'lucide-react';
import { SheetData, exportToExcelBlob } from '@/lib/templateLoader';

/**
 * Recursively sanitize data for Convex storage
 * Converts Date objects to ISO strings, which Convex doesn't natively support
 */
function sanitizeForConvex(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  
  // Convert Date objects to ISO strings
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(item => sanitizeForConvex(item));
  }
  
  // Handle objects (but not special types like Date which we already handled)
  if (typeof value === 'object') {
    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      sanitized[key] = sanitizeForConvex(value[key]);
    }
    return sanitized;
  }
  
  // Primitive values pass through
  return value;
}

interface SaveModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: { runId: Id<"modelRuns">; scenarioId: Id<"scenarios">; version: number; versionName: string }) => void;
  projectId: Id<"projects">;
  templateSheets: SheetData[];
  modelType: 'appraisal' | 'operating' | 'other';
  templateName?: string;
}

export default function SaveModelModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  templateSheets,
  modelType,
  templateName,
}: SaveModelModalProps) {
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  // Query to get the next version number
  const nextVersionNumber = useQuery(
    api.modelRuns.getNextVersion,
    { projectId, modelType }
  );

  // Mutations
  const saveModelVersion = useMutation(api.modelRuns.saveModelVersion);
  const generateUploadUrl = useMutation(api.modelRuns.generateModelUploadUrl);
  const attachFile = useMutation(api.modelRuns.attachFileToModelRun);

  // Generate version name preview
  const date = new Date().toISOString().split('T')[0];
  const versionName = nextVersionNumber 
    ? `v${nextVersionNumber}-${modelType}-${date}`
    : 'Loading...';

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setDescription('');
      setSaveStatus('idle');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (!isSubmitting) {
      setDescription('');
      setSaveStatus('idle');
      onClose();
    }
  };

  const handleSave = async () => {
    if (!templateSheets || templateSheets.length === 0) {
      alert('No template data to save');
      return;
    }

    setIsSubmitting(true);
    setSaveStatus('saving');

    try {
      // For large workbooks, we store only metadata in the document
      // and save the full data to an Excel file in storage
      // This avoids Convex's 1MB document size limit
      
      // Create lightweight metadata about sheets (no actual data)
      const sheetMetadata = templateSheets.map(sheet => ({
        name: sheet.name,
        rowCount: sheet.data?.length || 0,
        colCount: sheet.data?.[0]?.length || 0,
        hasStyles: !!sheet.styles && Object.keys(sheet.styles).length > 0,
        hasFormulas: sheet.data?.some(row => 
          row?.some(cell => typeof cell === 'string' && cell.startsWith('='))
        ) || false,
      }));

      // Save the model version with metadata only (no full sheet data)
      const result = await saveModelVersion({
        projectId,
        modelType,
        description: description.trim() || undefined,
        inputs: {
          // Store only lightweight metadata, not full sheet data
          sheetMetadata,
          templateName: templateName,
          savedAt: new Date().toISOString(),
          sheetsCount: templateSheets.length,
        },
      });

      // ALWAYS save the Excel file to storage for large workbooks
      // This is the primary storage for the actual data
      try {
        // Generate the Excel file as a blob
        const fileName = `${result.versionName}.xlsx`;
        const blob = await exportToExcelBlob(templateSheets, fileName);
        
        if (blob) {
          // Get upload URL from Convex
          const uploadUrl = await generateUploadUrl();
          
          // Upload the file
          const uploadResult = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': blob.type },
            body: blob,
          });
          
          if (uploadResult.ok) {
            const { storageId } = await uploadResult.json();
            // Attach file to the model run
            await attachFile({
              runId: result.runId,
              fileStorageId: storageId,
            });
            console.log('[SaveModelModal] Excel file saved to storage:', storageId);
          } else {
            throw new Error('Failed to upload Excel file');
          }
        }
      } catch (fileError) {
        console.error('Error saving Excel file to storage:', fileError);
        // For large workbooks, we need the file - warn user but don't fail completely
        alert('Warning: Excel file could not be saved to storage. The model metadata was saved, but you may not be able to reload the full workbook.');
      }

      setSaveStatus('success');
      
      // Small delay to show success state
      setTimeout(() => {
        handleClose();
        onSuccess?.(result);
      }, 500);
    } catch (error) {
      console.error('Error saving model:', error);
      setSaveStatus('error');
      alert('Failed to save model. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="w-5 h-5 text-blue-600" />
            Save Model
          </DialogTitle>
          <DialogDescription>
            Save the current model as a new version. You can load previous versions anytime.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Version Info */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-900">Version Details</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Version:</span>{' '}
                <span className="font-mono font-medium text-blue-800">
                  {nextVersionNumber ?? '...'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Type:</span>{' '}
                <span className="capitalize font-medium text-blue-800">{modelType}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500">Name:</span>{' '}
                <code className="px-1.5 py-0.5 bg-blue-100 rounded text-blue-800 font-mono text-xs">
                  {versionName}
                </code>
              </div>
              {templateName && (
                <div className="col-span-2">
                  <span className="text-gray-500">Template:</span>{' '}
                  <span className="font-medium text-blue-800">{templateName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Sheet Summary */}
          <div className="text-sm text-gray-600">
            <span className="font-medium">{templateSheets.length}</span> sheet{templateSheets.length !== 1 ? 's' : ''} will be saved:
            <span className="text-gray-500 ml-1">
              {templateSheets.map(s => s.name).join(', ')}
            </span>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Add notes about this version, e.g., 'Updated with Q3 financials'"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          {/* Storage info */}
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
            <Download className="w-4 h-4 text-gray-500" />
            <span>Excel file will be saved to cloud storage</span>
          </div>
        </div>

        <DialogFooter>
          <Button 
            type="button" 
            variant="outline" 
            onClick={handleClose} 
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={isSubmitting || !nextVersionNumber}
            className="min-w-[120px]"
          >
            {saveStatus === 'saving' ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : saveStatus === 'success' ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Version
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

