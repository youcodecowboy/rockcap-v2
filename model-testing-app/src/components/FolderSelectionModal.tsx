'use client';

import { useState } from 'react';
import { Modal, Button } from '@/components/layouts';
import { FolderKanban, Building2 } from 'lucide-react';
import { Id } from '../../convex/_generated/dataModel';
import { useColors } from '@/lib/useColors';

interface FolderSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: Id<"clients"> | null;
  projects: Array<{ _id: Id<"projects">; name: string }>;
  currentProjectId: Id<"projects"> | null;
  currentIsBaseDocument: boolean;
  onSelect: (isBaseDocument: boolean, projectId: Id<"projects"> | null) => void;
}

export default function FolderSelectionModal({
  isOpen,
  onClose,
  clientId,
  projects,
  currentProjectId,
  currentIsBaseDocument,
  onSelect,
}: FolderSelectionModalProps) {
  const colors = useColors();
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null);

  const handleConfirm = () => {
    if (selectedDestination === 'base-documents') {
      onSelect(true, null);
    } else if (selectedDestination) {
      onSelect(false, selectedDestination as Id<"projects">);
    }
    onClose();
    setSelectedDestination(null);
  };

  const destinations = [
    { id: 'base-documents', name: 'Base Documents', icon: Building2 },
    ...projects.map(p => ({ id: p._id, name: p.name, icon: FolderKanban })),
  ];

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="File Elsewhere"
      width={448}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!selectedDestination}>
            Confirm
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
        Choose where to file this document
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
                background: isSelected ? `${colors.accent.blue}15` : colors.bg.card,
                border: `1px solid ${
                  isSelected ? colors.accent.blue : colors.border.default
                }`,
                opacity: isCurrentLocation ? 0.5 : 1,
                cursor: isCurrentLocation ? 'not-allowed' : 'pointer',
                transition: 'background 100ms linear, border-color 100ms linear',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Icon size={18} style={{ color: colors.text.muted, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: colors.text.primary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dest.name}
                  </div>
                  {isCurrentLocation && (
                    <div style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>
                      Current location
                    </div>
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
