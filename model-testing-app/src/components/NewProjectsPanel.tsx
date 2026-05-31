'use client';

import { useMemo, useState } from 'react';
import { Input, Panel, Button } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { FolderPlus, Loader2, Merge, X } from 'lucide-react';
import { generateShortcodeSuggestion } from '@/lib/shortcodeUtils';

function TokenCheckbox({ checked, onChange, disabled, accent }: { checked: boolean; onChange: () => void; disabled?: boolean; accent: string }) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      style={{
        width: 16,
        height: 16,
        borderRadius: 3,
        flexShrink: 0,
        border: `1px solid ${checked ? accent : '#9ca3af'}`,
        background: checked ? accent : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
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

export interface NewProjectEntry {
  suggestedName: string;   // Original name from V4 analysis
  name: string;            // Editable name
  projectShortcode: string; // Editable shortcode
  enabled: boolean;        // Whether to create this project
  fileCount: number;       // Number of items assigned
  mergedSuggestedNames?: string[]; // All original suggested names (when entries are merged)
}

interface NewProjectsPanelProps {
  projects: NewProjectEntry[];
  onChange: (projects: NewProjectEntry[]) => void;
  onCreateProjects: (projects: NewProjectEntry[]) => Promise<void>;
  isCreating?: boolean;
  createdCount?: number;  // How many projects were already created
}

export default function NewProjectsPanel({ projects, onChange, onCreateProjects, isCreating, createdCount }: NewProjectsPanelProps) {
  const colors = useColors();
  const [mergeSelection, setMergeSelection] = useState<Set<number>>(new Set());
  const isMergeMode = mergeSelection.size > 0;

  // Check for duplicate shortcodes (case-insensitive) among enabled projects
  const duplicateShortcodes = useMemo(() => {
    const enabled = projects.filter(p => p.enabled);
    const seen = new Map<string, number>();
    const dupes = new Set<string>();
    for (const p of enabled) {
      const key = p.projectShortcode.toUpperCase();
      seen.set(key, (seen.get(key) || 0) + 1);
      if ((seen.get(key) || 0) > 1) dupes.add(key);
    }
    return dupes;
  }, [projects]);

  const hasDuplicates = duplicateShortcodes.size > 0;
  const enabledCount = projects.filter(p => p.enabled).length;

  const updateProject = (index: number, updates: Partial<NewProjectEntry>) => {
    const updated = projects.map((p, i) => {
      if (i !== index) return p;
      const merged = { ...p, ...updates };
      // Auto-regenerate shortcode when name changes (only if user hasn't manually edited it)
      if (updates.name !== undefined && !updates.projectShortcode) {
        const oldAutoShortcode = generateShortcodeSuggestion(p.name);
        if (p.projectShortcode === oldAutoShortcode) {
          merged.projectShortcode = generateShortcodeSuggestion(updates.name);
        }
      }
      return merged;
    });
    onChange(updated);
  };

  const toggleMergeSelect = (index: number) => {
    setMergeSelection(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleMergeSelected = () => {
    if (mergeSelection.size < 2) return;
    const indices = Array.from(mergeSelection).sort((a, b) => a - b);
    const targetIdx = indices[0]; // Keep the first selected entry
    const target = projects[targetIdx];

    // Collect all suggested names and sum file counts from all selected
    let totalFiles = 0;
    const allNames: string[] = [];
    for (const idx of indices) {
      const p = projects[idx];
      totalFiles += p.fileCount;
      const names = p.mergedSuggestedNames || [p.suggestedName];
      for (const n of names) {
        if (!allNames.includes(n)) allNames.push(n);
      }
    }

    // Remove all selected except the target, update the target
    const removeSet = new Set(indices.slice(1));
    const updated = projects
      .filter((_, i) => !removeSet.has(i))
      .map((p) => {
        // Find the target by suggestedName since indices shift after filter
        if (p.suggestedName !== target.suggestedName) return p;
        return {
          ...p,
          fileCount: totalFiles,
          mergedSuggestedNames: allNames,
        };
      });

    onChange(updated);
    setMergeSelection(new Set());
  };

  const handleCreate = async () => {
    const enabled = projects.filter(p => p.enabled && p.name.trim() && p.projectShortcode.trim());
    if (enabled.length === 0) return;
    await onCreateProjects(enabled);
  };

  if (projects.length === 0) return null;

  const purple = colors.accent.purple;
  const headerLabel: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500 };

  return (
    <Panel
      accent={purple}
      title="New Projects Detected"
      actions={
        <span style={{ fontSize: 11, color: colors.text.muted }}>
          {enabledCount} of {projects.length} selected
        </span>
      }
    >
      {/* Merge toolbar — appears when 2+ rows are selected for merge */}
      {isMergeMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: 8, background: `${purple}15`, border: `1px solid ${purple}40`, borderRadius: 4 }}>
          <Merge size={16} style={{ color: purple }} />
          <span style={{ fontSize: 12, color: purple, fontWeight: 500 }}>
            {mergeSelection.size} selected for merge
          </span>
          <Button size="sm" variant="primary" accent={purple} onClick={handleMergeSelected} disabled={mergeSelection.size < 2} style={{ marginLeft: 'auto' }}>
            <Merge size={12} />
            Merge into first
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMergeSelection(new Set())}>
            <X size={12} />
            Cancel
          </Button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '32px 40px 1fr 160px 80px', gap: 8, padding: '0 4px', ...headerLabel }}>
          <div style={{ textAlign: 'center' }}>Merge</div>
          <div></div>
          <div>Project Name</div>
          <div>Shortcode</div>
          <div style={{ textAlign: 'right' }}>Files</div>
        </div>

        {/* Project rows */}
        {projects.map((project, index) => {
          const isDupe = project.enabled && duplicateShortcodes.has(project.projectShortcode.toUpperCase());
          const hasMergedNames = project.mergedSuggestedNames && project.mergedSuggestedNames.length > 1;
          const isSelected = mergeSelection.has(index);
          const borderColor = isSelected ? purple : isDupe ? colors.accent.red : colors.border.default;
          return (
            <div
              key={`${project.suggestedName}-${index}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 40px 1fr 160px 80px',
                gap: 8,
                alignItems: 'center',
                padding: 8,
                borderRadius: 4,
                background: isSelected ? `${purple}15` : project.enabled ? colors.bg.card : colors.bg.light,
                border: `1px solid ${borderColor}`,
                opacity: project.enabled ? 1 : 0.6,
              }}
            >
              {/* Merge select checkbox */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <TokenCheckbox checked={isSelected} onChange={() => toggleMergeSelect(index)} disabled={isCreating || !project.enabled} accent={purple} />
              </div>
              {/* Enable/disable checkbox */}
              <TokenCheckbox checked={project.enabled} onChange={() => updateProject(index, { enabled: !project.enabled })} disabled={isCreating} accent={colors.accent.blue} />
              <div>
                <Input
                  value={project.name}
                  onChange={(e) => updateProject(index, { name: e.target.value })}
                  disabled={!project.enabled || isCreating}
                  style={{ padding: '5px 8px', fontSize: 12 }}
                />
                {hasMergedNames && (
                  <p style={{ fontSize: 10, color: purple, marginTop: 2, padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Merged: {project.mergedSuggestedNames!.join(', ')}
                  </p>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <Input
                  value={project.projectShortcode}
                  onChange={(e) => updateProject(index, { projectShortcode: e.target.value.toUpperCase().slice(0, 10) })}
                  disabled={!project.enabled || isCreating}
                  style={{ padding: '5px 8px', fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', ...(isDupe ? { borderColor: colors.accent.red, color: colors.accent.red } : {}) }}
                  maxLength={10}
                />
                {isDupe && (
                  <span style={{ fontSize: 10, color: colors.accent.red, position: 'absolute', bottom: -16, left: 0 }}>Duplicate</span>
                )}
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: colors.text.muted }}>
                {project.fileCount}
              </div>
            </div>
          );
        })}
      </div>

      {hasDuplicates && (
        <p style={{ fontSize: 11, color: colors.accent.red, marginTop: 12 }}>
          Resolve duplicate shortcodes — merge entries, edit shortcodes, or uncheck duplicates.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: `1px solid ${colors.border.default}` }}>
        <p style={{ fontSize: 11, color: colors.text.muted }}>
          Create projects now so you can link files to their checklists before filing.
        </p>
        <Button size="sm" variant="primary" accent={purple} onClick={handleCreate} disabled={hasDuplicates || enabledCount === 0 || isCreating}>
          {isCreating ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
          {isCreating ? 'Creating...' : `Create ${enabledCount} Project${enabledCount !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </Panel>
  );
}

/**
 * Build the initial NewProjectEntry array from batch items and existing projects.
 * Call this once when the review page loads (or when items/projects change).
 */
export function buildNewProjectEntries(
  items: Array<{ suggestedProjectName?: string; itemProjectId?: string }>,
  existingProjectNames: string[],
): NewProjectEntry[] {
  const existingNamesLower = new Set(existingProjectNames.map(n => n.toLowerCase()));

  // Group items by suggestedProjectName (case-insensitive dedup)
  const projectMap = new Map<string, { name: string; count: number }>();
  for (const item of items) {
    if (!item.suggestedProjectName) continue;
    if (item.itemProjectId) continue; // Already assigned to existing project
    const key = item.suggestedProjectName.toLowerCase();
    if (existingNamesLower.has(key)) continue; // Matches existing project
    if (!projectMap.has(key)) {
      projectMap.set(key, { name: item.suggestedProjectName, count: 0 });
    }
    projectMap.get(key)!.count++;
  }

  return Array.from(projectMap.values()).map(({ name, count }) => ({
    suggestedName: name,
    name,
    projectShortcode: generateShortcodeSuggestion(name),
    enabled: true,
    fileCount: count,
  }));
}
