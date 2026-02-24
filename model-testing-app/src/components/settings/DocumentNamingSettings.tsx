'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Id } from '../../../convex/_generated/dataModel';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { abbreviateText, abbreviateCategory, generateDocumentCode } from '@/lib/documentCodeUtils';

interface DocumentNamingSettingsProps {
  entityType: 'client' | 'project';
  clientId?: Id<"clients">;
  clientName?: string;
  projectId?: Id<"projects">;
  projectName?: string;
  projectShortcode?: string; // Actual existing shortcode from project
  metadata?: any;
  onSave?: (namingSettings: NamingSettings) => void;
  onShortcodeChange?: (shortcode: string) => void; // For editing the actual shortcode
}

interface NamingSettings {
  code: string;
  pattern?: string;
  inheritFromClient?: boolean;
}

export default function DocumentNamingSettings({
  entityType,
  clientId,
  clientName,
  projectId,
  projectName,
  projectShortcode,
  metadata,
  onSave,
  onShortcodeChange,
}: DocumentNamingSettingsProps) {
  const [code, setCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Get documents to show stats
  const clientDocuments = useQuery(
    api.documents.getByClient,
    clientId ? { clientId } : 'skip'
  ) || [];

  const projectDocuments = useQuery(
    api.documents.getByProject,
    projectId ? { projectId } : 'skip'
  ) || [];

  const documents = entityType === 'client' ? clientDocuments : projectDocuments;

  const updateDocumentCode = useMutation(api.documents.updateDocumentCode);

  // Initialize from actual shortcode, saved metadata, or generate default
  useEffect(() => {
    // For projects, use the actual projectShortcode first
    if (entityType === 'project' && projectShortcode) {
      setCode(projectShortcode);
    } else {
      const savedCode = metadata?.documentNaming?.code;
      if (savedCode) {
        setCode(savedCode);
      } else if (entityType === 'client' && clientName) {
        setCode(abbreviateText(clientName, 8));
      } else if (entityType === 'project' && projectName) {
        setCode(abbreviateText(projectName, 10));
      }
    }
  }, [metadata, clientName, projectName, projectShortcode, entityType]);

  // Calculate stats
  const stats = useMemo(() => {
    const missingCodes = documents.filter((doc: any) => !doc.documentCode || doc.documentCode.trim() === '');
    const hasCodes = documents.filter((doc: any) => doc.documentCode && doc.documentCode.trim() !== '');
    return {
      total: documents.length,
      missingCodes: missingCodes.length,
      hasCodes: hasCodes.length,
    };
  }, [documents]);

  const handleSave = async () => {
    if (!code.trim()) return;

    setIsSaving(true);
    try {
      // For projects, update the actual projectShortcode field
      if (entityType === 'project' && onShortcodeChange) {
        await onShortcodeChange(code.toUpperCase());
      }

      // Also save to metadata for pattern storage
      if (onSave) {
        onSave({
          code: code.toUpperCase(),
          pattern: entityType === 'client'
            ? `{client}-{type}-{date}`
            : `{client}-{type}-{project}-{date}`,
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyToDocuments = async () => {
    if (!code.trim()) return;
    if (documents.length === 0) return;

    setIsApplying(true);
    try {
      const docsToUpdate = documents.filter((doc: any) => !doc.documentCode || doc.documentCode.trim() === '');

      if (docsToUpdate.length === 0) {
        alert('All documents already have codes assigned.');
        setIsApplying(false);
        return;
      }

      const usedCodes = new Set<string>();
      let successCount = 0;

      for (const doc of docsToUpdate) {
        try {
          const generatedCode = generateDocumentCode(
            clientName || '',
            doc.category,
            projectName,
            doc.uploadedAt
          );

          let finalCode = generatedCode;
          let counter = 1;
          while (usedCodes.has(finalCode)) {
            finalCode = `${generatedCode}-${counter}`;
            counter++;
          }

          usedCodes.add(finalCode);
          await updateDocumentCode({ id: doc._id, documentCode: finalCode });
          successCount++;
        } catch (error) {
          console.error(`Failed to update document ${doc._id}:`, error);
        }
      }

      alert(`Applied codes to ${successCount} document(s).`);
    } catch (error) {
      console.error('Failed to apply codes:', error);
      alert('Failed to apply codes. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  // Generate preview code
  const previewCode = () => {
    if (!code.trim()) return '';
    const dateCode = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).replace(/\//g, '');

    if (entityType === 'project' && projectName) {
      return `${code.toUpperCase()}-DOC-${abbreviateText(projectName, 10).toUpperCase()}-${dateCode}`;
    }
    return `${code.toUpperCase()}-DOC-${dateCode}`;
  };

  const maxLength = entityType === 'client' ? 8 : 10;

  return (
    <div className="space-y-6">
      {/* Stats */}
      {documents.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Document Statistics</p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.hasCodes} with codes, {stats.missingCodes} without codes
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                {stats.hasCodes} coded
              </Badge>
              {stats.missingCodes > 0 && (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                  {stats.missingCodes} missing
                </Badge>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Code Configuration */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">
            {entityType === 'client' ? 'Client' : 'Project'} Code
          </h3>
          {entityType === 'project' && projectShortcode && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              Shortcode configured
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="code">
            {entityType === 'client' ? 'Client Abbreviation' : 'Project Shortcode'}
          </Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder={entityType === 'client' ? 'e.g., FIRESIDE' : 'e.g., WIMBPARK28'}
            className="font-mono"
            maxLength={maxLength}
          />
          <p className="text-xs text-gray-500">
            Max {maxLength} characters, alphanumeric only. Used in document naming.
            {entityType === 'project' && projectShortcode && (
              <span className="block mt-1 text-green-600">
                Current shortcode: <span className="font-mono font-medium">{projectShortcode}</span>
              </span>
            )}
          </p>
        </div>

        {/* Preview */}
        {previewCode() && (
          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="px-3 py-2 bg-blue-50 rounded-md border border-blue-200">
              <span className="text-sm font-mono text-blue-900">{previewCode()}</span>
            </div>
            <p className="text-xs text-gray-500">
              Example document code with today's date
            </p>
          </div>
        )}

        {/* Pattern Explanation */}
        <div className="space-y-2">
          <Label>Naming Pattern</Label>
          <div className="px-3 py-2 bg-gray-50 rounded-md border border-gray-200">
            <span className="text-sm font-mono text-gray-700">
              {entityType === 'client'
                ? `{CLIENT}-{TYPE}-{DDMMYY}`
                : `{CLIENT}-{TYPE}-{PROJECT}-{DDMMYY}`
              }
            </span>
          </div>
          <p className="text-xs text-gray-500">
            TYPE is auto-detected from document category (e.g., VAL, OPR, DOC)
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-4 border-t">
        {stats.missingCodes > 0 && (
          <Button
            onClick={handleApplyToDocuments}
            disabled={isApplying || !code.trim()}
            className="w-full gap-2"
            variant="outline"
          >
            <Sparkles className="w-4 h-4" />
            {isApplying ? 'Applying...' : `Apply to ${stats.missingCodes} Documents Without Codes`}
          </Button>
        )}

        <Button
          onClick={handleSave}
          disabled={isSaving || !code.trim()}
          className="w-full"
        >
          {isSaving ? 'Saving...' : 'Save Naming Settings'}
        </Button>
      </div>
    </div>
  );
}
