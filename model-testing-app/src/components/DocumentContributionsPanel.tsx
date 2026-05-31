'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button, Modal, StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { FileText, Trash2, AlertTriangle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface DocumentContributionsPanelProps {
  projectId: Id<'projects'>;
  documentId: Id<'documents'>;
  documentName: string;
  onRevertComplete?: () => void;
}

export default function DocumentContributionsPanel({
  projectId,
  documentId,
  documentName,
  onRevertComplete,
}: DocumentContributionsPanelProps) {
  const colors = useColors();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [headerHover, setHeaderHover] = useState(false);

  // Query items from this document
  const itemsFromDocument = useQuery(
    api.projectDataLibrary.getItemsFromDocument,
    { projectId, documentId }
  );

  // Mutation to revert
  const revertDocumentAddition = useMutation(api.projectDataLibrary.revertDocumentAddition);

  const handleRevert = async () => {
    setIsReverting(true);
    try {
      const result = await revertDocumentAddition({
        projectId,
        documentId,
        createBackupSnapshot: true,
      });
      console.log('[DocumentContributions] Reverted:', result);
      setShowConfirm(false);
      onRevertComplete?.();
    } catch (error) {
      console.error('[DocumentContributions] Revert failed:', error);
    } finally {
      setIsReverting(false);
    }
  };

  if (!itemsFromDocument || itemsFromDocument.length === 0) {
    return null;
  }

  // Group items by category
  const itemsByCategory: Record<string, typeof itemsFromDocument> = {};
  itemsFromDocument.forEach(item => {
    if (!itemsByCategory[item.category]) {
      itemsByCategory[item.category] = [];
    }
    itemsByCategory[item.category].push(item);
  });

  return (
    <div style={{ background: colors.bg.card, border: `1px solid ${colors.border.default}`, borderRadius: 4, overflow: 'hidden' }}>
      {/* Header */}
      <div
        className="w-full px-4 py-3 flex items-center justify-between"
        style={{ background: headerHover ? colors.bg.cardAlt : colors.bg.light, transition: 'background 100ms linear' }}
        onMouseEnter={() => setHeaderHover(true)}
        onMouseLeave={() => setHeaderHover(false)}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 flex-1 text-left"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          {isExpanded ? (
            <ChevronDown size={16} style={{ color: colors.text.muted }} />
          ) : (
            <ChevronRight size={16} style={{ color: colors.text.muted }} />
          )}
          <FileText size={16} style={{ color: colors.accent.blue }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{documentName}</span>
          <StatusPill label={`${itemsFromDocument.length} items contributed`} tone={colors.text.muted} />
        </button>
        <Button
          variant="danger"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setShowConfirm(true);
          }}
        >
          <Trash2 size={14} />
          Remove All
        </Button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4" style={{ borderTop: `1px solid ${colors.border.default}` }}>
          <div className="space-y-4">
            {Object.entries(itemsByCategory)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, items]) => (
                <div key={category}>
                  <h4 className="mb-2" style={{ fontSize: 13, fontWeight: 500, color: colors.text.secondary }}>{category}</h4>
                  <div style={{ background: colors.bg.light, borderRadius: 4, overflow: 'hidden' }}>
                    {items.map((item, idx) => (
                      <div
                        key={item._id}
                        className="px-3 py-2 flex items-center justify-between"
                        style={{ borderTop: idx === 0 ? 'none' : `1px solid ${colors.border.light}` }}
                      >
                        <div>
                          <span style={{ fontFamily: MONO, fontSize: 11, color: colors.text.dim, marginRight: 8 }}>
                            {item.itemCode}
                          </span>
                          <span style={{ fontSize: 13, color: colors.text.primary }}>{item.originalName}</span>
                          {item.hasMultipleSources && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: colors.accent.orange }}>
                              (has {item.valueHistory.length} versions)
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.secondary }}>
                          {item.currentDataType === 'currency' && typeof item.currentValue === 'number'
                            ? new Intl.NumberFormat('en-GB', {
                                style: 'currency',
                                currency: 'GBP',
                                maximumFractionDigits: 0
                              }).format(item.currentValue)
                            : item.currentValue}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Remove Document Data"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowConfirm(false)} disabled={isReverting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleRevert} disabled={isReverting}>
              {isReverting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 size={16} />
                  Remove Data
                </>
              )}
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3 mb-4" style={{ color: colors.accent.red }}>
          <AlertTriangle size={24} />
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Remove Document Data</h3>
        </div>

        <p className="mb-4" style={{ fontSize: 13, color: colors.text.secondary }}>
          This will remove all <strong>{itemsFromDocument.length} items</strong> that came from{' '}
          <strong>{documentName}</strong> from the project data library.
        </p>

        <div
          className="p-3 mb-1"
          style={{ background: `${colors.accent.orange}10`, border: `1px solid ${colors.accent.orange}40`, borderRadius: 4 }}
        >
          <div className="flex items-start gap-2" style={{ color: colors.accent.orange, fontSize: 13 }}>
            <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <p style={{ fontWeight: 500 }}>What will happen:</p>
              <ul className="list-disc list-inside mt-1" style={{ fontSize: 11 }}>
                <li>Items only from this document will be deleted</li>
                <li>Items with multiple sources will revert to the previous value</li>
                <li>A backup snapshot will be created automatically</li>
              </ul>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
