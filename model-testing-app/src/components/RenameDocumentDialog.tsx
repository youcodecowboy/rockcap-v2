'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { Button, Input, Modal } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
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
  const colors = useColors();
  const renameMutation = useMutation(api.documents.rename);

  const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

  const namingConfig = useMemo(
    () => resolveNamingConfig(projectMetadata, clientMetadata),
    [projectMetadata, clientMetadata]
  );

  // displayName starts empty unless the user previously set one — it's an OPTIONAL custom override
  const [displayName, setDisplayName] = useState(document.displayName || "");
  const [customizeCode, setCustomizeCode] = useState(false);
  const [manualCode, setManualCode] = useState(document.documentCode || "");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    document.customFieldValues || {}
  );
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when document changes
  useEffect(() => {
    setDisplayName(document.displayName || "");
    setCustomizeCode(false);
    setManualCode(document.documentCode || "");
    setFieldValues(document.customFieldValues || {});
  }, [document._id]);

  // Assemble auto code from pattern + field values
  // e.g. DarkMills_CreditChecklist_V1.0_20260707
  const builtInValues = getBuiltInTokenValues({
    clientName: clientCode || namingConfig.code,
    projectShortcode: projectCode || undefined,
    fileType: document.category || "",
  });
  const allTokenValues = { ...builtInValues, ...fieldValues };
  const autoCode = assembleDocumentCode(namingConfig, allTokenValues);

  const effectiveCode = customizeCode ? manualCode : autoCode;

  const handleFieldChange = (tokenId: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [tokenId]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    // Capture previous values for undo
    const previousValues = {
      displayName: document.displayName,
      documentCode: document.documentCode,
      customFieldValues: document.customFieldValues,
    };
    try {
      const newDisplayName = displayName.trim() || undefined;
      await renameMutation({
        id: document._id,
        displayName: newDisplayName,
        customFieldValues: Object.keys(fieldValues).length > 0 ? fieldValues : undefined,
        documentCode: effectiveCode || undefined,
      });
      toast("Document renamed", {
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () => {
            renameMutation({
              id: document._id,
              displayName: previousValues.displayName,
              documentCode: previousValues.documentCode,
              customFieldValues: previousValues.customFieldValues,
            });
            toast.success("Rename undone");
          },
        },
      });
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

  const tokenChip = (label: string, tone: string, required?: boolean) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 80,
        flexShrink: 0,
        padding: '4px 6px',
        borderRadius: 2,
        fontFamily: MONO,
        fontSize: 11,
        background: `${tone}15`,
        color: tone,
        border: `1px solid ${tone}40`,
      }}
    >
      {label}
      {required && <span style={{ color: colors.accent.red, marginLeft: 2 }}>*</span>}
    </span>
  );

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Rename Document"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Section 1: Custom Display Name (optional) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500 }}>
            Custom Display Name <span style={{ color: colors.text.dim }}>(optional)</span>
          </label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Leave empty to use document code"
          />
          <p style={{ fontSize: 10, color: colors.text.dim }}>
            Overrides the document code as the displayed name. Original file: <span style={{ fontFamily: MONO }}>{document.fileName}</span>
          </p>
        </div>

        {/* Section 2: Document Code */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500 }}>
              Document Code
            </label>
            <button
              role="checkbox"
              aria-checked={customizeCode}
              onClick={() => setCustomizeCode(!customizeCode)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 10,
                color: colors.text.muted,
              }}
            >
              Customize
              <span
                style={{
                  width: 28,
                  height: 16,
                  borderRadius: 8,
                  background: customizeCode ? colors.accent.blue : colors.border.mid,
                  position: 'relative',
                  transition: 'background 100ms linear',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: customizeCode ? 14 : 2,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: '#ffffff',
                    transition: 'left 100ms linear',
                  }}
                />
              </span>
            </button>
          </div>
          {customizeCode ? (
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Enter custom code"
              style={{ fontFamily: MONO }}
            />
          ) : (
            <div style={{ background: colors.bg.light, borderRadius: 4, border: `1px solid ${colors.border.default}`, padding: '8px 12px' }}>
              <p style={{ fontSize: 12, fontFamily: MONO, color: colors.text.secondary }}>
                {autoCode || <span style={{ color: colors.text.dim, fontStyle: 'italic' }}>No code (fill in fields below)</span>}
              </p>
            </div>
          )}
        </div>

        {/* Section 3: Field Values */}
        {(builtInTokensInPattern.length > 0 || customTokenDefs.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500 }}>
              Field Values
            </label>

            {/* Built-in tokens (read-only) */}
            {builtInTokensInPattern.map((token) => (
              <div key={token} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {tokenChip(token, colors.accent.blue)}
                <Input
                  value={builtInValues[token.toLowerCase()] || ''}
                  disabled
                  style={{ flex: 1, fontFamily: MONO, background: colors.bg.light }}
                />
              </div>
            ))}

            {/* Custom tokens (editable) */}
            {customTokenDefs.map((ct) => (
              <div key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {tokenChip(ct.label, colors.accent.purple, ct.required)}
                <Input
                  value={fieldValues[ct.id] || ''}
                  onChange={(e) => handleFieldChange(ct.id, e.target.value)}
                  placeholder={ct.label}
                  style={{ flex: 1 }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
