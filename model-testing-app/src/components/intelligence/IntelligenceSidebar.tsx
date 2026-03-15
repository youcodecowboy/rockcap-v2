'use client';

import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getCategoryLucideIcon } from '@/components/intelligence/intelligenceUtils';

export interface CategorySummary {
  name: string;
  icon?: string;
  filled: number;
  total: number;
  hasCriticalMissing: boolean;
  hasConflicts: boolean;
  recentlyUpdated: boolean;
}

interface IntelligenceSidebarProps {
  categories: CategorySummary[];
  projectCategories: CategorySummary[];
  activeCategory: string;
  onSelectCategory: (name: string) => void;
  clientName: string;
  clientType: string;
  projectCount: number;
  overallCompleteness: number;
  projects?: { id: string; name: string }[];
  activeProjectId?: string;
  onSelectProject?: (id: string) => void;
}

function AttentionDots({
  hasCriticalMissing,
  hasConflicts,
  recentlyUpdated,
}: Pick<CategorySummary, 'hasCriticalMissing' | 'hasConflicts' | 'recentlyUpdated'>) {
  return (
    <span className="flex items-center gap-0.5 flex-shrink-0">
      {hasCriticalMissing && (
        <span
          className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"
          aria-label="Critical missing fields"
        />
      )}
      {hasConflicts && (
        <span
          className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"
          aria-label="Conflicts detected"
        />
      )}
      {recentlyUpdated && (
        <span
          className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"
          aria-label="Recently updated"
        />
      )}
    </span>
  );
}

function CategoryRow({
  category,
  isActive,
  onSelect,
  indented = false,
}: {
  category: CategorySummary;
  isActive: boolean;
  onSelect: () => void;
  indented?: boolean;
}) {
  const IconComponent = getCategoryLucideIcon(category.name);
  const isOther = category.name === 'Other';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors rounded-sm',
        indented && 'pl-5',
        isActive
          ? 'bg-blue-50 border-l-2 border-l-blue-500 text-blue-900'
          : 'hover:bg-gray-50 text-gray-700 border-l-2 border-l-transparent',
        isOther && 'text-gray-500'
      )}
    >
      <IconComponent className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0 text-sm font-medium truncate">
        {category.name}
      </span>
      <AttentionDots
        hasCriticalMissing={category.hasCriticalMissing}
        hasConflicts={category.hasConflicts}
        recentlyUpdated={category.recentlyUpdated}
      />
      <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
        {category.filled}/{category.total}
      </span>
    </button>
  );
}

export function IntelligenceSidebar({
  categories,
  projectCategories,
  activeCategory,
  onSelectCategory,
  clientName,
  clientType,
  projectCount,
  overallCompleteness,
  projects,
  activeProjectId,
  onSelectProject,
}: IntelligenceSidebarProps) {
  // Separate "Other" from the rest to pin it at the bottom
  const mainCategories = categories.filter((c) => c.name !== 'Other');
  const otherCategory = categories.find((c) => c.name === 'Other');
  const projectMainCategories = projectCategories.filter((c) => c.name !== 'Other');
  const projectOtherCategory = projectCategories.find((c) => c.name === 'Other');

  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col h-full">
      {/* Client Header */}
      <div className="px-3 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Client</p>
        <h2
          className="text-sm font-semibold text-gray-900 truncate"
          title={clientName}
        >
          {clientName}
        </h2>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500">{clientType}</span>
          {projectCount > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-500">
                {projectCount} {projectCount === 1 ? 'project' : 'projects'}
              </span>
            </>
          )}
        </div>

        {/* Completeness bar */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Overall completeness</span>
            <span className="text-xs font-medium text-gray-700">
              {Math.round(overallCompleteness)}%
            </span>
          </div>
          <Progress value={overallCompleteness} className="h-1.5" />
        </div>
      </div>

      {/* Scrollable category list */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {/* Client categories */}
          <p className="px-3 py-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
            Client
          </p>
          <div className="space-y-0.5 px-1">
            {mainCategories.map((cat) => (
              <CategoryRow
                key={cat.name}
                category={cat}
                isActive={activeCategory === cat.name}
                onSelect={() => onSelectCategory(cat.name)}
              />
            ))}
          </div>

          {/* Project Intelligence section */}
          <div className="mt-3 border-t border-gray-100 pt-3">
            <div className="px-3 mb-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                Project Intelligence
              </p>
              {projects && projects.length > 0 && onSelectProject && (
                <Select
                  value={activeProjectId ?? ''}
                  onValueChange={onSelectProject}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full text-xs h-7"
                  >
                    <SelectValue placeholder="Select project…" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {projectCategories.length > 0 && (
              <div className="space-y-0.5 px-1">
                {projectMainCategories.map((cat) => (
                  <CategoryRow
                    key={`proj-${cat.name}`}
                    category={cat}
                    isActive={activeCategory === cat.name}
                    onSelect={() => onSelectCategory(cat.name)}
                    indented
                  />
                ))}
              </div>
            )}

            {projectCategories.length === 0 && (
              <p className="px-3 text-xs text-gray-400 italic">
                No project selected
              </p>
            )}
          </div>

          {/* "Other" pinned at bottom */}
          {(otherCategory || projectOtherCategory) && (
            <div className="mt-3 border-t border-gray-100 pt-2 px-1">
              {otherCategory && (
                <CategoryRow
                  category={otherCategory}
                  isActive={activeCategory === 'Other'}
                  onSelect={() => onSelectCategory('Other')}
                />
              )}
              {projectOtherCategory && (
                <CategoryRow
                  category={projectOtherCategory}
                  isActive={activeCategory === 'Other'}
                  onSelect={() => onSelectCategory('Other')}
                  indented
                />
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Legend */}
      <div className="flex-shrink-0 border-t border-gray-100 px-3 py-2 bg-gray-50">
        <p className="text-xs text-gray-400 mb-1.5 font-medium">Legend</p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
            <span className="text-xs text-gray-500">Critical missing</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <span className="text-xs text-gray-500">Conflicts</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-xs text-gray-500">Recently updated</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
