'use client';

import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Modal, Button, StatusPill, SkeletonText } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { FileText, Download } from 'lucide-react';

interface FileTypeDefinitionViewProps {
  definitionId: Id<'fileTypeDefinitions'>;
  onClose: () => void;
}

export default function FileTypeDefinitionView({
  definitionId,
  onClose,
}: FileTypeDefinitionViewProps) {
  const colors = useColors();
  const definition = useQuery(api.fileTypeDefinitions.getById, { id: definitionId });
  const fileUrl = useQuery(
    api.fileTypeDefinitions.getFileUrl,
    definition?.exampleFileStorageId ? { storageId: definition.exampleFileStorageId } : 'skip'
  );

  const handleDownloadExample = () => {
    if (!definition?.exampleFileStorageId || !definition?.exampleFileName) return;
    const params = new URLSearchParams({
      storageId: definition.exampleFileStorageId,
      filename: definition.exampleFileName,
    });
    window.open(`/api/convex-file?${params.toString()}`, '_blank');
  };

  if (!definition) {
    return (
      <Modal open={true} onClose={onClose} title="Loading File Type Definition" width={760}>
        <SkeletonText lines={6} />
      </Modal>
    );
  }

  const sectionHeading = { fontSize: 13, fontWeight: 600, color: colors.text.secondary, marginBottom: 8 };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={definition.fileType}
      width={840}
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {definition.isSystemDefault && (
          <StatusPill label="System Default" tone={colors.accent.blue} />
        )}
        <span style={{ fontSize: 13, color: colors.text.secondary }}>
          Category: {definition.category}
          {definition.parentType && ` • Subtype of: ${definition.parentType}`}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Description */}
        <div>
          <h3 style={sectionHeading}>Description</h3>
          <p style={{ fontSize: 13, color: colors.text.primary, whiteSpace: 'pre-wrap' }}>{definition.description}</p>
          <p style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>
            {definition.description.trim().split(/\s+/).length} words
          </p>
        </div>

        {/* Keywords */}
        <div>
          <h3 style={sectionHeading}>Keywords ({definition.keywords.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {definition.keywords.map((keyword, index) => (
              <StatusPill key={index} label={keyword} tone={colors.text.muted} />
            ))}
          </div>
        </div>

        {/* Identification Rules */}
        <div>
          <h3 style={sectionHeading}>Identification Rules ({definition.identificationRules.length})</h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
            {definition.identificationRules.map((rule, index) => (
              <li key={index} style={{ fontSize: 13, color: colors.text.primary, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ color: colors.text.dim, marginTop: 1 }}>•</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Category Rules */}
        {definition.categoryRules && (
          <div>
            <h3 style={sectionHeading}>Category Rules</h3>
            <p style={{ fontSize: 13, color: colors.text.primary }}>{definition.categoryRules}</p>
          </div>
        )}

        {/* Example File */}
        {definition.exampleFileStorageId && (
          <div>
            <h3 style={sectionHeading}>Example File</h3>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 12,
                background: colors.bg.cardAlt,
                border: `1px solid ${colors.border.default}`,
                borderRadius: 4,
              }}
            >
              <FileText style={{ width: 20, height: 20, color: colors.text.muted }} />
              <span style={{ fontSize: 13, color: colors.text.primary, flex: 1 }}>
                {definition.exampleFileName || 'Example file'}
              </span>
              <Button variant="secondary" size="sm" onClick={handleDownloadExample}>
                <Download style={{ width: 14, height: 14 }} />
                Download
              </Button>
            </div>
          </div>
        )}

        {/* Metadata */}
        <div style={{ paddingTop: 16, borderTop: `1px solid ${colors.border.default}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
            <div>
              <span style={{ color: colors.text.muted }}>Created:</span>{' '}
              <span style={{ color: colors.text.primary }}>
                {new Date(definition.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span style={{ color: colors.text.muted }}>Last Updated:</span>{' '}
              <span style={{ color: colors.text.primary }}>
                {new Date(definition.updatedAt).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span style={{ color: colors.text.muted }}>Status:</span>{' '}
              <span style={{ fontWeight: 500, color: definition.isActive ? colors.accent.green : colors.text.muted }}>
                {definition.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
