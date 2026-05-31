'use client';

import { useState, useEffect, useMemo } from 'react';
import { Modal, Field, Input, Button } from '@/components/layouts';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { parseDocumentCode, abbreviateCategory, abbreviateText, formatDateDDMMYY } from '@/lib/documentCodeUtils';
import { useColors } from '@/lib/useColors';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

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
  const colors = useColors();
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

  const radioRow = (
    mode: 'single' | 'client' | 'project',
    labelText: string,
  ) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <input
        type="radio"
        name="updateMode"
        value={mode}
        checked={updateMode === mode}
        onChange={(e) => setUpdateMode(e.target.value as typeof mode)}
        style={{ width: 14, height: 14, accentColor: colors.accent.blue }}
      />
      <span style={{ fontSize: 12, color: colors.text.primary }}>{labelText}</span>
    </label>
  );

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Edit Document Code"
      width={448}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isUpdating}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={isUpdating || !previewCode}>
            {isUpdating ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 12, color: colors.text.secondary }}>
          Configure the document code components
        </p>

        <Field label="Client Code">
          <Input
            id="clientCode"
            value={clientCode}
            onChange={(e) => setClientCode(e.target.value.toUpperCase())}
            placeholder="CLIENT"
            maxLength={8}
            style={{ fontFamily: MONO }}
          />
        </Field>

        <Field label="Type Code">
          <Input
            id="typeCode"
            value={typeCode}
            onChange={(e) => setTypeCode(e.target.value.toUpperCase())}
            placeholder="VAL"
            maxLength={3}
            style={{ fontFamily: MONO }}
          />
        </Field>

        {projectName && (
          <Field label="Project Code">
            <Input
              id="projectCode"
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value.toUpperCase())}
              placeholder="PROJECT"
              maxLength={10}
              style={{ fontFamily: MONO }}
            />
          </Field>
        )}

        <Field label="Date Code (DDMMYY)">
          <Input
            id="dateCode"
            value={dateCode}
            onChange={(e) => setDateCode(e.target.value)}
            placeholder="251120"
            maxLength={6}
            style={{ fontFamily: MONO }}
          />
        </Field>

        {previewCode && (
          <div
            style={{
              padding: 12,
              background: colors.bg.cardAlt,
              border: `1px solid ${colors.border.default}`,
              borderRadius: 4,
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: colors.text.muted,
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              Preview
            </div>
            <div style={{ fontFamily: MONO, fontSize: 13, color: colors.text.primary }}>
              {previewCode}
            </div>
          </div>
        )}

        {clientId && (
          <Field label="Apply to">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {radioRow('single', 'This document only')}
              {clientId && radioRow('client', `All ${clientName} documents`)}
              {projectId && radioRow('project', `All ${projectName} documents`)}
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}
