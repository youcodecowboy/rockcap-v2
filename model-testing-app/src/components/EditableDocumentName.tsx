'use client';

import { useState } from 'react';
import { Edit2, Check, X, FileText, Building2, FolderKanban } from 'lucide-react';
import { Button, IconButton, Input, Modal } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
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
  const colors = useColors();
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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {isEditing ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input
              value={editedCode}
              onChange={(e) => setEditedCode(e.target.value)}
              style={{ fontSize: 24, fontWeight: 700 }}
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
              variant="primary"
              accent={colors.accent.blue}
              onClick={handleSave}
              disabled={editedCode.trim() === ''}
            >
              <Check size={16} />
              Save
            </Button>
            <IconButton label="Cancel" onClick={handleCancel}>
              <X size={16} />
            </IconButton>
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <div className="group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.text.primary }}>
                {displayCode}
              </h1>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                <IconButton label="Edit document name" onClick={handleEdit}>
                  <Edit2 size={16} />
                </IconButton>
              </span>
            </div>
            {documentCode && fileName !== documentCode && (
              <p style={{ fontSize: 12, color: colors.text.muted, marginTop: 6 }}>
                Original filename: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{fileName}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bulk Update Dialog */}
      <Modal
        open={showBulkDialog}
        onClose={() => setShowBulkDialog(false)}
        title="Apply Document Name"
        footer={
          <Button variant="secondary" onClick={() => setShowBulkDialog(false)} disabled={isUpdating}>
            Cancel
          </Button>
        }
      >
        <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 12 }}>
          Choose where to apply this document name change
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ScopeButton onClick={() => handleBulkUpdate('single')} disabled={isUpdating} accent={colors.accent.blue} Icon={FileText} title="This Document Only" subtitle="Update only this document's name" />
          {clientId && clientName && (
            <ScopeButton onClick={() => handleBulkUpdate('client')} disabled={isUpdating} accent={colors.entityTypes.client} Icon={Building2} title="All Client Documents" subtitle={clientName} />
          )}
          {projectId && projectName && (
            <ScopeButton onClick={() => handleBulkUpdate('project')} disabled={isUpdating} accent={colors.entityTypes.project} Icon={FolderKanban} title="All Project Documents" subtitle={projectName} />
          )}
        </div>
      </Modal>
    </>
  );
}

function ScopeButton({
  onClick,
  disabled,
  accent,
  Icon,
  title,
  subtitle,
}: {
  onClick: () => void;
  disabled: boolean;
  accent: string;
  Icon: typeof FileText;
  title: string;
  subtitle: string;
}) {
  const colors = useColors();
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: 14,
        borderRadius: 4,
        border: `1px solid ${hover ? accent : colors.border.default}`,
        background: hover ? `${accent}10` : colors.bg.card,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 100ms linear, background 100ms linear',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ padding: 8, borderRadius: 4, background: `${accent}15` }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.primary, marginBottom: 2 }}>{title}</div>
          <div style={{ fontSize: 11, color: colors.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

