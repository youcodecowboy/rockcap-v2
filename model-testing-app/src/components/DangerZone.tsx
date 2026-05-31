'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Modal } from '@/components/layouts';
import { useColors } from '@/lib/useColors';

interface DangerZoneProps {
  entityType: 'client' | 'project';
  entityName: string;
  cascadeCount?: number;
  onConfirmTrash: () => Promise<void>;
}

export default function DangerZone({
  entityType,
  entityName,
  cascadeCount,
  onConfirmTrash,
}: DangerZoneProps) {
  const colors = useColors();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);

  const handleTrash = async () => {
    setIsTrashing(true);
    try {
      await onConfirmTrash();
      setShowConfirm(false);
    } catch (error) {
      console.error('Trash failed:', error);
    } finally {
      setIsTrashing(false);
    }
  };

  return (
    <>
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${colors.border.default}` }}>
        <div
          style={{
            borderRadius: 4,
            border: `1px solid ${colors.accent.red}40`,
            background: `${colors.accent.red}10`,
            padding: 16,
          }}
        >
          <h3
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 9,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 500,
              color: colors.accent.red,
              marginBottom: 6,
            }}
          >
            Danger Zone
          </h3>
          <p style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
            Move this {entityType} to trash. It can be restored from the Deleted filter
            in the {entityType === 'client' ? 'clients sidebar' : 'projects tab'}.
          </p>
          {entityType === 'client' && cascadeCount !== undefined && cascadeCount > 0 && (
            <p style={{ fontSize: 11, color: colors.accent.orange, marginBottom: 12 }}>
              This will also move {cascadeCount} active project{cascadeCount !== 1 ? 's' : ''} to trash.
            </p>
          )}
          <Button variant="danger" size="sm" onClick={() => setShowConfirm(true)}>
            <Trash2 size={14} />
            Move to Trash
          </Button>
        </div>
      </div>

      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title={`Move ${entityName} to trash?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleTrash} disabled={isTrashing}>
              {isTrashing ? 'Moving...' : 'Move to Trash'}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 12, color: colors.text.secondary }}>
          {entityType === 'client' && cascadeCount ? (
            <>This will move the client and {cascadeCount} active project{cascadeCount !== 1 ? 's' : ''} to trash. You can restore them later.</>
          ) : (
            <>This will move the {entityType} to trash. You can restore it later.</>
          )}
        </p>
      </Modal>
    </>
  );
}
