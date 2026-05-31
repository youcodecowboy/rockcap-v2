'use client';

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { getCategoryLucideIcon } from '@/components/intelligence/intelligenceUtils';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

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

function MonoLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: 500,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function AttentionDots({
  hasCriticalMissing,
  hasConflicts,
  recentlyUpdated,
}: Pick<CategorySummary, 'hasCriticalMissing' | 'hasConflicts' | 'recentlyUpdated'>) {
  const colors = useColors();
  const dot = (color: string, label: string) => (
    <span
      style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
      aria-label={label}
    />
  );
  return (
    <span className="flex items-center gap-0.5 flex-shrink-0">
      {hasCriticalMissing && dot(colors.accent.red, 'Critical missing fields')}
      {hasConflicts && dot(colors.accent.orange, 'Conflicts detected')}
      {recentlyUpdated && dot(colors.accent.green, 'Recently updated')}
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
  const colors = useColors();
  const [hover, setHover] = useState(false);
  const IconComponent = getCategoryLucideIcon(category.name);
  const isOther = category.name === 'Other';

  const textColor = isActive
    ? colors.accent.blue
    : isOther
    ? colors.text.dim
    : colors.text.secondary;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="w-full flex items-center gap-2 px-3 py-2 text-left"
      style={{
        borderRadius: 2,
        paddingLeft: indented ? 20 : undefined,
        borderLeft: `2px solid ${isActive ? colors.accent.blue : 'transparent'}`,
        background: isActive ? `${colors.accent.blue}15` : hover ? colors.bg.cardAlt : 'transparent',
        transition: 'background 100ms linear',
      }}
    >
      <IconComponent size={16} style={{ flexShrink: 0, color: textColor }} aria-hidden="true" />
      <span
        className="flex-1 min-w-0 truncate"
        style={{ fontSize: 13, fontWeight: 500, color: textColor }}
      >
        {category.name}
      </span>
      <AttentionDots
        hasCriticalMissing={category.hasCriticalMissing}
        hasConflicts={category.hasConflicts}
        recentlyUpdated={category.recentlyUpdated}
      />
      <span
        className="flex-shrink-0 tabular-nums"
        style={{ fontFamily: MONO, fontSize: 10, color: colors.text.dim }}
      >
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
  const colors = useColors();

  // Separate "Other" from the rest to pin it at the bottom
  const mainCategories = categories.filter((c) => c.name !== 'Other');
  const otherCategory = categories.find((c) => c.name === 'Other');
  const projectMainCategories = projectCategories.filter((c) => c.name !== 'Other');
  const projectOtherCategory = projectCategories.find((c) => c.name === 'Other');

  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col h-full"
      style={{ borderRight: `1px solid ${colors.border.default}`, background: colors.bg.card }}
    >
      {/* Client Header */}
      <div className="px-3 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: `1px solid ${colors.border.light}` }}>
        <MonoLabel style={{ color: colors.text.muted }}>Client</MonoLabel>
        <h2
          className="truncate mt-0.5"
          style={{ fontSize: 13, fontWeight: 600, color: colors.text.primary }}
          title={clientName}
        >
          {clientName}
        </h2>
        <div className="flex items-center gap-2 mt-0.5">
          <span style={{ fontSize: 11, color: colors.text.muted }}>{clientType}</span>
          {projectCount > 0 && (
            <>
              <span style={{ color: colors.border.mid }}>·</span>
              <span style={{ fontSize: 11, color: colors.text.muted }}>
                {projectCount} {projectCount === 1 ? 'project' : 'projects'}
              </span>
            </>
          )}
        </div>

        {/* Completeness bar */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontSize: 11, color: colors.text.muted }}>Overall completeness</span>
            <span
              className="tabular-nums"
              style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, color: colors.text.secondary }}
            >
              {Math.round(overallCompleteness)}%
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 2, background: colors.bg.cardAlt, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.max(0, Math.min(100, overallCompleteness))}%`,
                background: colors.accent.blue,
                transition: 'width 200ms linear',
              }}
            />
          </div>
        </div>
      </div>

      {/* Scrollable category list */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {/* Client categories */}
          <div className="px-3 py-1">
            <MonoLabel style={{ color: colors.text.dim }}>Client</MonoLabel>
          </div>
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
          <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${colors.border.light}` }}>
            <div className="px-3 mb-2">
              <div className="mb-1.5">
                <MonoLabel style={{ color: colors.text.dim }}>Project Intelligence</MonoLabel>
              </div>
              {projects && projects.length > 0 && onSelectProject && (
                <Select
                  value={activeProjectId ?? ''}
                  onChange={(e) => onSelectProject(e.target.value)}
                  style={{ padding: '5px 8px', fontSize: 11 }}
                >
                  <option value="" disabled>
                    Select project…
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
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
              <p className="px-3" style={{ fontSize: 11, fontStyle: 'italic', color: colors.text.dim }}>
                No project selected
              </p>
            )}
          </div>

          {/* "Other" pinned at bottom */}
          {(otherCategory || projectOtherCategory) && (
            <div className="mt-3 pt-2 px-1" style={{ borderTop: `1px solid ${colors.border.light}` }}>
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
      <div
        className="flex-shrink-0 px-3 py-2"
        style={{ borderTop: `1px solid ${colors.border.light}`, background: colors.bg.light }}
      >
        <div className="mb-1.5">
          <MonoLabel style={{ color: colors.text.dim }}>Legend</MonoLabel>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.accent.red, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: colors.text.muted }}>Critical missing</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.accent.orange, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: colors.text.muted }}>Conflicts</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.accent.green, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: colors.text.muted }}>Recently updated</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
