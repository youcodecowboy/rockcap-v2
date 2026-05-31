'use client';

import { useState } from 'react';
import { Panel, Button, Input, Modal } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { GitBranch, Merge, Trash2 } from 'lucide-react';
import type { VersionCandidateGroup } from '@/lib/versionDetection';
import type { Id } from '../../convex/_generated/dataModel';

function TokenCheckbox({ checked, onChange, accent }: { checked: boolean; onChange: () => void; accent: string }) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => { e.preventDefault(); onChange(); }}
      style={{
        width: 16, height: 16, borderRadius: 3, flexShrink: 0,
        border: `1px solid ${checked ? accent : '#9ca3af'}`,
        background: checked ? accent : 'transparent',
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.5L5 9L9.5 3.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

interface VersionCandidatesPanelProps {
  groups: VersionCandidateGroup[];
  onApplyVersions: (versions: Array<{ itemId: Id<"bulkUploadItems">; version: string; isBase: boolean }>) => Promise<void>;
  onDeleteItems: (itemIds: Id<"bulkUploadItems">[]) => Promise<void>;
}

export default function VersionCandidatesPanel({ groups, onApplyVersions, onDeleteItems }: VersionCandidatesPanelProps) {
  const colors = useColors();
  // Track selected items per group: groupIndex -> Set of item _ids
  const [selections, setSelections] = useState<Map<number, Set<string>>>(new Map());
  const [versionModalGroup, setVersionModalGroup] = useState<number | null>(null);
  const [mergeModalGroup, setMergeModalGroup] = useState<number | null>(null);
  const [versionInputs, setVersionInputs] = useState<Map<string, string>>(new Map());
  const [keepItemId, setKeepItemId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const toggleItem = (groupIdx: number, itemId: string) => {
    setSelections(prev => {
      const next = new Map(prev);
      const groupSet = new Set(next.get(groupIdx) || []);
      if (groupSet.has(itemId)) {
        groupSet.delete(itemId);
      } else {
        groupSet.add(itemId);
      }
      next.set(groupIdx, groupSet);
      return next;
    });
  };

  const getSelectedCount = (groupIdx: number) => selections.get(groupIdx)?.size || 0;

  // Auto-suggest version order for modal
  const openVersionModal = (groupIdx: number) => {
    const group = groups[groupIdx];
    const selected = selections.get(groupIdx) || new Set();
    const selectedItems = group.items.filter(i => selected.has(i._id));

    // Sort by date if available, otherwise by version, otherwise by filename
    const sorted = [...selectedItems].sort((a, b) => {
      if (a.extractedDate && b.extractedDate) return a.extractedDate.localeCompare(b.extractedDate);
      if (a.extractedVersion && b.extractedVersion) return a.extractedVersion.localeCompare(b.extractedVersion);
      return a.fileName.localeCompare(b.fileName);
    });

    const inputs = new Map<string, string>();
    sorted.forEach((item, idx) => {
      inputs.set(item._id, `V${idx + 1}.0`);
    });
    setVersionInputs(inputs);
    setVersionModalGroup(groupIdx);
  };

  const openMergeModal = (groupIdx: number) => {
    const group = groups[groupIdx];
    const selected = selections.get(groupIdx) || new Set();
    const selectedItems = group.items.filter(i => selected.has(i._id));
    // Default to keeping the last item (newest by sort order)
    setKeepItemId(selectedItems[selectedItems.length - 1]?._id || null);
    setMergeModalGroup(groupIdx);
  };

  const handleApplyVersions = async () => {
    if (versionModalGroup === null) return;
    setIsApplying(true);
    try {
      const entries = Array.from(versionInputs.entries()).map(([itemId, version]) => ({
        itemId: itemId as Id<"bulkUploadItems">,
        version,
        isBase: version === 'V1.0',
      }));
      await onApplyVersions(entries);
      // Clear selection for this group
      setSelections(prev => {
        const next = new Map(prev);
        next.delete(versionModalGroup);
        return next;
      });
      setVersionModalGroup(null);
    } finally {
      setIsApplying(false);
    }
  };

  const handleMerge = async () => {
    if (mergeModalGroup === null || !keepItemId) return;
    setIsApplying(true);
    try {
      const group = groups[mergeModalGroup];
      const selected = selections.get(mergeModalGroup) || new Set();
      const toDelete = group.items
        .filter(i => selected.has(i._id) && i._id !== keepItemId)
        .map(i => i._id as Id<"bulkUploadItems">);
      await onDeleteItems(toDelete);
      setSelections(prev => {
        const next = new Map(prev);
        next.delete(mergeModalGroup);
        return next;
      });
      setMergeModalGroup(null);
    } finally {
      setIsApplying(false);
    }
  };

  if (groups.length === 0) return null;

  const amber = colors.accent.orange;
  const metaPill = (label: string) => (
    <span style={{ display: 'inline-block', flexShrink: 0, padding: '1px 6px', borderRadius: 2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 9, background: colors.bg.cardAlt, color: colors.text.muted, border: `1px solid ${colors.border.default}` }}>
      {label}
    </span>
  );

  return (
    <>
      <Panel
        accent={amber}
        title="Version Candidates Detected"
        actions={<span style={{ fontSize: 11, color: colors.text.muted }}>{groups.length} group{groups.length !== 1 ? 's' : ''}</span>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map((group, groupIdx) => {
            const selectedCount = getSelectedCount(groupIdx);
            return (
              <div key={`${group.normalizedName}-${groupIdx}`} style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, padding: 12, background: colors.bg.card }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: amber, marginBottom: 8, textTransform: 'capitalize' }}>
                  {group.normalizedName}
                  <span style={{ fontSize: 10, fontWeight: 400, color: colors.text.muted, marginLeft: 8 }}>
                    ({group.items.length} files)
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {group.items.map(item => (
                    <div
                      key={item._id}
                      onClick={() => toggleItem(groupIdx, item._id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 4, cursor: 'pointer' }}
                    >
                      <TokenCheckbox
                        checked={selections.get(groupIdx)?.has(item._id) || false}
                        onChange={() => toggleItem(groupIdx, item._id)}
                        accent={colors.accent.blue}
                      />
                      <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: colors.text.secondary }} title={item.fileName}>
                        {item.fileName}
                      </span>
                      {item.extractedDate && metaPill(item.extractedDate)}
                      {item.extractedVersion && metaPill(item.extractedVersion)}
                    </div>
                  ))}
                </div>
                {selectedCount >= 2 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border.default}` }}>
                    <Button size="sm" variant="primary" onClick={() => openVersionModal(groupIdx)}>
                      <GitBranch size={12} />
                      Version
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => openMergeModal(groupIdx)}>
                      <Merge size={12} />
                      Merge
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Version Assignment Modal */}
      <Modal
        open={versionModalGroup !== null}
        onClose={() => setVersionModalGroup(null)}
        title="Assign Version Numbers"
        footer={
          <>
            <Button variant="ghost" onClick={() => setVersionModalGroup(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleApplyVersions} disabled={isApplying}>
              {isApplying ? 'Applying...' : 'Apply Versions'}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 12 }}>
          Set the version for each file. V1.0 is treated as the base version.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {versionModalGroup !== null && groups[versionModalGroup] &&
            groups[versionModalGroup].items
              .filter(i => selections.get(versionModalGroup!)?.has(i._id))
              .map(item => (
                <div key={item._id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: colors.text.secondary }} title={item.fileName}>
                    {item.fileName}
                  </span>
                  <Input
                    value={versionInputs.get(item._id) || ''}
                    onChange={(e) => {
                      setVersionInputs(prev => {
                        const next = new Map(prev);
                        next.set(item._id, e.target.value);
                        return next;
                      });
                    }}
                    style={{ width: 80, padding: '4px 6px', fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', textAlign: 'center' }}
                  />
                </div>
              ))
          }
        </div>
      </Modal>

      {/* Merge Confirmation Modal */}
      <Modal
        open={mergeModalGroup !== null}
        onClose={() => setMergeModalGroup(null)}
        title="Merge Files"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMergeModalGroup(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleMerge} disabled={isApplying}>
              <Trash2 size={12} />
              Merge — Delete {mergeModalGroup !== null ? (getSelectedCount(mergeModalGroup) - 1) : 0} copies
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 12 }}>
          Choose which file to keep. The others will be deleted permanently.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {mergeModalGroup !== null && groups[mergeModalGroup] &&
            groups[mergeModalGroup].items
              .filter(i => selections.get(mergeModalGroup!)?.has(i._id))
              .map(item => {
                const isKeep = keepItemId === item._id;
                return (
                  <div
                    key={item._id}
                    onClick={() => setKeepItemId(item._id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 4, cursor: 'pointer' }}
                  >
                    <span
                      role="radio"
                      aria-checked={isKeep}
                      style={{
                        width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                        border: `1px solid ${isKeep ? colors.accent.green : '#9ca3af'}`,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isKeep && <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors.accent.green }} />}
                    </span>
                    <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: colors.text.secondary }}>{item.fileName}</span>
                    {isKeep && (
                      <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 9, textTransform: 'uppercase', background: `${colors.accent.green}20`, color: colors.accent.green, border: `1px solid ${colors.accent.green}40` }}>
                        Keep
                      </span>
                    )}
                  </div>
                );
              })
          }
        </div>
      </Modal>
    </>
  );
}
