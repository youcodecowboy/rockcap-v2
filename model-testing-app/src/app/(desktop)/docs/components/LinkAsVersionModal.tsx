'use client';

import { useState, useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Modal, Field, Input, Textarea, Button, StatusPill, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface Document {
  _id: Id<"documents">;
  fileName: string;
  documentCode?: string;
  summary: string;
  category: string;
  fileTypeDetected?: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  version?: string;
  previousVersionId?: string;
}

interface LinkAsVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceDocument: Document;
  folderDocuments: Document[];
}

// Parse "V1.2" → { major: 1, minor: 2 }, returns null if unparseable
function parseVersion(v?: string): { major: number; minor: number } | null {
  if (!v) return null;
  const match = v.match(/^V?(\d+)\.(\d+)$/i);
  if (!match) return null;
  return { major: parseInt(match[1]), minor: parseInt(match[2]) };
}

// Suggest a version number based on the target's version and the relationship
function suggestVersion(targetVersion: string | undefined, relationship: 'newer' | 'older'): string {
  const parsed = parseVersion(targetVersion);

  if (!parsed) {
    // Target has no parseable version
    return relationship === 'newer' ? 'V2.0' : 'V1.0';
  }

  if (relationship === 'newer') {
    // Default: bump minor (V1.2 → V1.3). If minor is 0, bump major (V2.0 → V3.0)
    if (parsed.minor === 0) {
      return `V${parsed.major + 1}.0`;
    }
    return `V${parsed.major}.${parsed.minor + 1}`;
  } else {
    // Older: decrement. V2.0 → V1.0, V1.3 → V1.2
    if (parsed.minor > 0) {
      return `V${parsed.major}.${parsed.minor - 1}`;
    }
    if (parsed.major > 1) {
      return `V${parsed.major - 1}.0`;
    }
    return 'V0.1';
  }
}

export default function LinkAsVersionModal({
  isOpen,
  onClose,
  sourceDocument,
  folderDocuments,
}: LinkAsVersionModalProps) {
  const colors = useColors();
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<'newer' | 'older'>('newer');
  const [versionNumber, setVersionNumber] = useState('');
  const [versionNote, setVersionNote] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  const linkAsVersion = useMutation(api.documents.linkAsVersion);

  const selectedTarget = folderDocuments.find(d => d._id === selectedTargetId);

  // Update suggested version when target or relationship changes
  useEffect(() => {
    if (selectedTarget) {
      setVersionNumber(suggestVersion(selectedTarget.version, relationship));
    }
  }, [selectedTarget, relationship]);

  const getFileIcon = (fileType: string) => {
    const type = fileType.toLowerCase();
    if (type.includes('pdf')) return <FileText className="w-4 h-4" style={{ color: colors.accent.red }} />;
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv'))
      return <FileSpreadsheet className="w-4 h-4" style={{ color: colors.accent.green }} />;
    if (type.includes('image') || type.includes('png') || type.includes('jpg'))
      return <FileImage className="w-4 h-4" style={{ color: colors.accent.blue }} />;
    return <File className="w-4 h-4" style={{ color: colors.text.muted }} />;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleLink = async () => {
    if (!selectedTargetId || !versionNumber.trim()) return;
    setIsLinking(true);
    try {
      await linkAsVersion({
        sourceDocumentId: sourceDocument._id,
        targetDocumentId: selectedTargetId as Id<"documents">,
        relationship,
        sourceVersion: versionNumber.trim(),
        ...(versionNote.trim() ? { versionNote: versionNote.trim() } : {}),
      });
      onClose();
    } catch (error) {
      console.error('Failed to link versions:', error);
      alert('Failed to link documents as versions');
    } finally {
      setIsLinking(false);
    }
  };

  const handleClose = () => {
    setSelectedTargetId(null);
    setRelationship('newer');
    setVersionNumber('');
    setVersionNote('');
    onClose();
  };

  // Filter out documents that are already in the same version chain
  const availableDocuments = folderDocuments.filter(d => d._id !== sourceDocument._id);

  const relCardStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 4,
    textAlign: 'center',
    cursor: 'pointer',
    background: active ? `${colors.accent.blue}15` : 'transparent',
    border: `1px solid ${active ? `${colors.accent.blue}40` : colors.border.default}`,
    transition: 'background 100ms linear, border-color 100ms linear',
  });

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      width={512}
      title="Link as Version"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isLinking}>
            Cancel
          </Button>
          <Button
            variant="primary"
            accent={colors.accent.blue}
            onClick={handleLink}
            disabled={!selectedTargetId || !versionNumber.trim() || isLinking}
          >
            {isLinking ? 'Linking...' : 'Link Versions'}
          </Button>
        </>
      }
    >
      <div style={{ fontSize: 11, color: colors.text.muted, marginBottom: 14 }}>
        Link &ldquo;{sourceDocument.documentCode || sourceDocument.fileName}&rdquo; as a version of another document.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Step 1: Select target document */}
        <Field label="Select document to link with">
          {availableDocuments.length === 0 ? (
            <EmptyState icon={<File size={24} />} title="No other documents in this folder to link with." />
          ) : (
            <div
              style={{
                maxHeight: 192,
                overflowY: 'auto',
                border: `1px solid ${colors.border.default}`,
                borderRadius: 4,
              }}
            >
              {availableDocuments.map((doc, idx) => {
                const isSelected = selectedTargetId === doc._id;
                return (
                  <button
                    key={doc._id}
                    onClick={() => setSelectedTargetId(doc._id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: isSelected ? `${colors.accent.blue}15` : 'transparent',
                      borderTop: idx === 0 ? 'none' : `1px solid ${colors.border.light}`,
                      borderLeft: 'none',
                      borderRight: 'none',
                      borderBottom: 'none',
                      transition: 'background 100ms linear',
                    }}
                  >
                    <div className="flex-shrink-0">{getFileIcon(doc.fileType)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate" style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                        {doc.documentCode || doc.fileName}
                      </div>
                      <div style={{ fontSize: 11, color: colors.text.muted }}>
                        {formatDate(doc.uploadedAt)}
                        {doc.version && (
                          <span style={{ marginLeft: 8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                            {doc.version}
                          </span>
                        )}
                      </div>
                    </div>
                    {doc.fileTypeDetected && (
                      <span className="flex-shrink-0">
                        <StatusPill label={doc.fileTypeDetected} tone={colors.text.muted} />
                      </span>
                    )}
                    {isSelected && (
                      <div
                        style={{ width: 8, height: 8, borderRadius: '50%', background: colors.accent.blue, flexShrink: 0 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        {/* Step 2: Choose relationship */}
        {selectedTarget && (
          <Field label="Relationship">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setRelationship('newer')} style={relCardStyle(relationship === 'newer')}>
                <ArrowUp className="w-4 h-4" style={{ color: colors.accent.blue }} />
                <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>Newer version</div>
                <div style={{ fontSize: 10, color: colors.text.muted, lineHeight: 1.3 }}>
                  This replaces the selected doc
                </div>
              </button>
              <button onClick={() => setRelationship('older')} style={relCardStyle(relationship === 'older')}>
                <ArrowDown className="w-4 h-4" style={{ color: colors.accent.orange }} />
                <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>Older version</div>
                <div style={{ fontSize: 10, color: colors.text.muted, lineHeight: 1.3 }}>
                  This is an earlier version
                </div>
              </button>
            </div>
          </Field>
        )}

        {/* Step 3: Version number */}
        {selectedTarget && (
          <Field label="Version number" hint="Major change (V1.0 → V2.0) or minor revision (V1.0 → V1.1)">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2" style={{ fontSize: 12, color: colors.text.muted }}>
                <StatusPill label={selectedTarget.version || 'V1.0'} tone={colors.text.muted} />
                <span style={{ color: colors.text.dim }}>&rarr;</span>
              </div>
              <Input
                type="text"
                value={versionNumber}
                onChange={(e) => setVersionNumber(e.target.value)}
                placeholder="e.g. V2.0"
                style={{ flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              />
            </div>
          </Field>
        )}

        {/* Step 4: Version note (optional) */}
        {selectedTarget && (
          <Field label="Change note (optional)">
            <Textarea
              value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
              placeholder="e.g. Updated exit yield to 5.25%, revised unit mix on Block C"
              rows={2}
              maxLength={500}
              style={{ resize: 'none' }}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}
