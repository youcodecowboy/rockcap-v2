'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Pencil } from 'lucide-react';
import {
  resolveNamingConfig,
  assembleDocumentCode,
  getBuiltInTokenValues,
  BUILT_IN_TOKENS,
  type DocumentNamingConfig,
} from '@/lib/namingConfig';

interface RenameDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  document: {
    _id: Id<"documents">;
    fileName: string;
    displayName?: string;
    documentCode?: string;
    customFieldValues?: Record<string, string>;
    category?: string;
    clientId?: Id<"clients">;
    projectId?: Id<"projects">;
  };
  clientMetadata?: any;
  projectMetadata?: any;
  clientCode?: string;
  projectCode?: string;
}

export default function RenameDocumentDialog({
  isOpen,
  onClose,
  document,
  clientMetadata,
  projectMetadata,
  clientCode = "",
  projectCode = "",
}: RenameDocumentDialogProps) {
  const renameMutation = useMutation(api.documents.rename);

  const namingConfig = useMemo(
    () => resolveNamingConfig(projectMetadata, clientMetadata),
    [projectMetadata, clientMetadata]
  );

  const [displayName, setDisplayName] = useState(document.displayName || document.fileName || "");
  const [customizeCode, setCustomizeCode] = useState(false);
  const [manualCode, setManualCode] = useState(document.documentCode || "");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    document.customFieldValues || {}
  );
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when document changes
  useEffect(() => {
    setDisplayName(document.displayName || document.fileName || "");
    setCustomizeCode(false);
    setManualCode(document.documentCode || "");
    setFieldValues(document.customFieldValues || {});
  }, [document._id]);

  // Assemble auto code from pattern + field values
  const builtInValues = getBuiltInTokenValues(
    clientCode || namingConfig.code,
    document.category || "",
    projectCode,
    undefined
  );
  const allTokenValues = { ...builtInValues, ...fieldValues };
  const autoCode = assembleDocumentCode(namingConfig, allTokenValues);

  const effectiveCode = customizeCode ? manualCode : autoCode;

  const handleFieldChange = (tokenId: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [tokenId]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await renameMutation({
        id: document._id,
        displayName: displayName.trim() || undefined,
        customFieldValues: Object.keys(fieldValues).length > 0 ? fieldValues : undefined,
        documentCode: effectiveCode || undefined,
      });
      toast.success("Document renamed");
      onClose();
    } catch (error) {
      console.error("Rename failed:", error);
      toast.error("Failed to rename document");
    } finally {
      setIsSaving(false);
    }
  };

  // Separate built-in and custom tokens from the pattern
  const builtInTokensInPattern = namingConfig.pattern.filter((t) =>
    (BUILT_IN_TOKENS as readonly string[]).includes(t)
  );
  const customTokensInPattern = namingConfig.pattern.filter(
    (t) => !(BUILT_IN_TOKENS as readonly string[]).includes(t)
  );
  const customTokenDefs = namingConfig.customTokens.filter((ct) =>
    customTokensInPattern.includes(ct.id.toUpperCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4" />
            Rename Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Section 1: Display Name */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Display Name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={document.fileName}
            />
            <p className="text-xs text-gray-500">The name shown in the document library.</p>
          </div>

          {/* Section 2: Document Code */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Document Code</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Customize</span>
                <Switch
                  checked={customizeCode}
                  onCheckedChange={setCustomizeCode}
                  className="scale-75"
                />
              </div>
            </div>
            {customizeCode ? (
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Enter custom code"
                className="font-mono text-sm"
              />
            ) : (
              <div className="bg-gray-50 rounded-md border px-3 py-2">
                <p className="text-sm font-mono text-gray-700">
                  {autoCode || <span className="text-gray-400 italic">No code (fill in fields below)</span>}
                </p>
              </div>
            )}
          </div>

          {/* Section 3: Field Values */}
          {(builtInTokensInPattern.length > 0 || customTokenDefs.length > 0) && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Field Values</Label>

              {/* Built-in tokens (read-only) */}
              {builtInTokensInPattern.map((token) => (
                <div key={token} className="flex items-center gap-3">
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 text-xs font-mono w-20 justify-center">
                    {token}
                  </Badge>
                  <Input
                    value={builtInValues[token.toLowerCase()] || ""}
                    disabled
                    className="flex-1 text-sm font-mono bg-gray-50"
                  />
                </div>
              ))}

              {/* Custom tokens (editable) */}
              {customTokenDefs.map((ct) => (
                <div key={ct.id} className="flex items-center gap-3">
                  <Badge variant="secondary" className="bg-purple-50 text-purple-700 text-xs font-mono w-20 justify-center">
                    {ct.label}
                    {ct.required && <span className="text-red-500 ml-0.5">*</span>}
                  </Badge>
                  <Input
                    value={fieldValues[ct.id] || ""}
                    onChange={(e) => handleFieldChange(ct.id, e.target.value)}
                    placeholder={ct.label}
                    className="flex-1 text-sm"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
