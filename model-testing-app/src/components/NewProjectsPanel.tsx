'use client';

import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FolderPlus, Loader2, Merge, X } from 'lucide-react';
import { generateShortcodeSuggestion } from '@/lib/shortcodeUtils';

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

  return (
    <Card className="border-purple-200 bg-purple-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FolderPlus className="w-5 h-5 text-purple-600" />
          <CardTitle className="text-base">New Projects Detected</CardTitle>
          <Badge variant="secondary" className="ml-auto">
            {enabledCount} of {projects.length} selected
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Merge toolbar — appears when 2+ rows are selected for merge */}
        {isMergeMode && (
          <div className="flex items-center gap-2 mb-3 p-2 bg-purple-100 border border-purple-300 rounded-md">
            <Merge className="w-4 h-4 text-purple-700" />
            <span className="text-sm text-purple-800 font-medium">
              {mergeSelection.size} selected for merge
            </span>
            <Button
              size="sm"
              variant="default"
              className="ml-auto bg-purple-600 hover:bg-purple-700"
              onClick={handleMergeSelected}
              disabled={mergeSelection.size < 2}
            >
              <Merge className="w-3 h-3 mr-1" />
              Merge into first
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMergeSelection(new Set())}
            >
              <X className="w-3 h-3 mr-1" />
              Cancel
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {/* Header row */}
          <div className="grid grid-cols-[32px_40px_1fr_160px_80px] gap-2 text-xs font-medium text-muted-foreground px-1">
            <div className="text-center text-[10px]">Merge</div>
            <div></div>
            <div>Project Name</div>
            <div>Shortcode</div>
            <div className="text-right">Files</div>
          </div>

          {/* Project rows */}
          {projects.map((project, index) => {
            const isDupe = project.enabled && duplicateShortcodes.has(project.projectShortcode.toUpperCase());
            const hasMergedNames = project.mergedSuggestedNames && project.mergedSuggestedNames.length > 1;
            const isSelected = mergeSelection.has(index);
            return (
              <div
                key={`${project.suggestedName}-${index}`}
                className={`grid grid-cols-[32px_40px_1fr_160px_80px] gap-2 items-center p-2 rounded-md ${
                  isSelected ? 'bg-purple-50 border border-purple-400' :
                  project.enabled ? 'bg-white border' : 'bg-gray-50 opacity-60'
                } ${isDupe && !isSelected ? 'border-red-300' : !isSelected ? 'border-gray-200' : ''}`}
              >
                {/* Merge select checkbox */}
                <div className="flex justify-center">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleMergeSelect(index)}
                    disabled={isCreating || !project.enabled}
                    className="border-purple-400 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                  />
                </div>
                {/* Enable/disable checkbox */}
                <Checkbox
                  checked={project.enabled}
                  onCheckedChange={(checked) => updateProject(index, { enabled: !!checked })}
                  disabled={isCreating}
                />
                <div>
                  <Input
                    value={project.name}
                    onChange={(e) => updateProject(index, { name: e.target.value })}
                    disabled={!project.enabled || isCreating}
                    className="h-8 text-sm"
                  />
                  {hasMergedNames && (
                    <p className="text-[10px] text-purple-500 mt-0.5 px-1 truncate">
                      Merged: {project.mergedSuggestedNames!.join(', ')}
                    </p>
                  )}
                </div>
                <div className="relative">
                  <Input
                    value={project.projectShortcode}
                    onChange={(e) => updateProject(index, { projectShortcode: e.target.value.toUpperCase().slice(0, 10) })}
                    disabled={!project.enabled || isCreating}
                    className={`h-8 text-sm font-mono ${isDupe ? 'border-red-400 text-red-700' : ''}`}
                    maxLength={10}
                  />
                  {isDupe && (
                    <span className="text-xs text-red-600 absolute -bottom-4 left-0">Duplicate</span>
                  )}
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  {project.fileCount}
                </div>
              </div>
            );
          })}
        </div>

        {hasDuplicates && (
          <p className="text-xs text-red-600 mt-3">
            Resolve duplicate shortcodes — merge entries, edit shortcodes, or uncheck duplicates.
          </p>
        )}

        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <p className="text-xs text-muted-foreground">
            Create projects now so you can link files to their checklists before filing.
          </p>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={hasDuplicates || enabledCount === 0 || isCreating}
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FolderPlus className="w-4 h-4 mr-2" />
            )}
            {isCreating ? 'Creating...' : `Create ${enabledCount} Project${enabledCount !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </CardContent>
    </Card>
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
