'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button, Modal } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { FolderKanban, FileText } from 'lucide-react';
import { useQuery } from 'convex/react';

interface MoveDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: Id<"documents">;
  currentClientId: Id<"clients">;
  currentProjectId?: Id<"projects"> | 'base-documents';
  currentIsBaseDocument?: boolean;
  onMoveComplete?: () => void;
}

export default function MoveDocumentModal({
  isOpen,
  onClose,
  documentId,
  currentClientId,
  currentProjectId,
  currentIsBaseDocument,
  onMoveComplete,
}: MoveDocumentModalProps) {
  const colors = useColors();
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
  const moveDocument = useMutation(api.documents.moveDocument);
  
  // Get all projects for this client
  const projects = useQuery(api.projects.getByClient, { clientId: currentClientId }) || [];
  
  const destinations = [
    { id: 'base-documents', name: 'Base Documents', icon: FileText },
    ...projects.map(p => ({ id: p._id, name: p.name, icon: FolderKanban })),
  ];

  const handleMove = async () => {
    if (!selectedDestination) return;

    try {
      const isBaseDocument = selectedDestination === 'base-documents';
      const projectId = isBaseDocument ? undefined : selectedDestination as Id<"projects">;
      const project = projects.find(p => p._id === projectId);
      const projectName = project?.name;

      await moveDocument({
        documentId,
        targetClientId: currentClientId,
        targetProjectId: projectId,
        targetProjectName: projectName,
        isBaseDocument,
      });

      if (onMoveComplete) {
        onMoveComplete();
      }
      onClose();
      setSelectedDestination(null);
    } catch (error) {
      console.error('Failed to move document:', error);
      alert(error instanceof Error ? error.message : 'Failed to move document');
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Move Document"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleMove} disabled={!selectedDestination}>
            Move Document
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 12 }}>
        Select a destination for this document. Documents can only be moved within the same client.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {destinations.map((dest) => {
          const Icon = dest.icon;
          const isCurrentLocation =
            (dest.id === 'base-documents' && currentIsBaseDocument) ||
            (dest.id === currentProjectId && !currentIsBaseDocument);
          const isSelected = selectedDestination === dest.id;

          return (
            <button
              key={dest.id}
              onClick={() => !isCurrentLocation && setSelectedDestination(dest.id)}
              disabled={isCurrentLocation}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: 12,
                borderRadius: 4,
                border: `1px solid ${isSelected ? colors.accent.blue : colors.border.default}`,
                background: isSelected ? `${colors.accent.blue}15` : colors.bg.card,
                opacity: isCurrentLocation ? 0.5 : 1,
                cursor: isCurrentLocation ? 'not-allowed' : 'pointer',
                transition: 'border-color 100ms linear, background 100ms linear',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Icon size={18} style={{ color: colors.text.muted }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{dest.name}</div>
                  {isCurrentLocation && (
                    <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>Current location</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

