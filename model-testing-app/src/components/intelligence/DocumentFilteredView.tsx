'use client';

import { useMemo } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { IconButton, StatusPill, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  getCategoryForField,
  getCategoryLucideIcon,
  getConfidenceLabel,
} from './intelligenceUtils';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export interface DocumentFilterItem {
  fieldPath: string;
  label: string;
  value: string;
  confidence: number;
  category: string;
  status: 'active' | 'superseded';
  replacedBy?: { value: string; documentName: string };
}

interface DocumentFilteredViewProps {
  documentName: string;
  items: DocumentFilterItem[];
  onBack: () => void;
}

export function DocumentFilteredView({ documentName, items, onBack }: DocumentFilteredViewProps) {
  const colors = useColors();

  // Group items by category
  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, DocumentFilterItem[]>();
    for (const item of items) {
      const category = item.category || getCategoryForField(item.fieldPath);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(item);
    }

    // Sort: categories with active items first, then alphabetical. "Other" last.
    return Array.from(groups.entries()).sort(([a, aItems], [b, bItems]) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      const aActive = aItems.some(i => i.status === 'active');
      const bActive = bItems.some(i => i.status === 'active');
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return a.localeCompare(b);
    });
  }, [items]);

  const totalFields = items.length;
  const activeCount = items.filter(i => i.status === 'active').length;

  return (
    <div className="flex-1 overflow-auto">
      {/* Banner */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{
          background: `${colors.accent.blue}15`,
          borderBottom: `1px solid ${colors.accent.blue}40`,
        }}
      >
        <IconButton label="Back to all intelligence" onClick={onBack}>
          <ArrowLeft size={16} />
        </IconButton>
        <FileText size={16} style={{ color: colors.accent.blue, flexShrink: 0 }} />
        <span className="truncate flex-1 min-w-0" style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
          {documentName}
        </span>
        <span
          className="flex-shrink-0 tabular-nums"
          style={{ fontFamily: MONO, fontSize: 11, color: colors.text.muted }}
        >
          {totalFields} {totalFields === 1 ? 'field' : 'fields'} extracted
          {activeCount < totalFields && ` (${activeCount} active)`}
        </span>
      </div>

      {/* Category sections */}
      <div className="p-4 space-y-6">
        {groupedByCategory.length === 0 ? (
          <EmptyState icon={<FileText size={28} />} title="No intelligence extracted from this document" />
        ) : (
          groupedByCategory.map(([category, categoryItems], idx) => {
            const IconComponent = getCategoryLucideIcon(category);
            return (
              <div key={category}>
                {idx > 0 && (
                  <div className="-mx-4 mb-6" style={{ borderTop: `1px solid ${colors.border.light}` }} />
                )}
                {/* Category header */}
                <div className="flex items-center gap-2 mb-3">
                  <IconComponent size={16} style={{ color: colors.text.secondary }} />
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: colors.text.primary }}>{category}</h3>
                  <span className="tabular-nums" style={{ fontFamily: MONO, fontSize: 11, color: colors.text.dim }}>
                    {categoryItems.length} {categoryItems.length === 1 ? 'field' : 'fields'}
                  </span>
                </div>

                {/* Field cards */}
                <div className="space-y-2">
                  {categoryItems.map((item) => {
                    const active = item.status === 'active';
                    const tone = active ? colors.accent.green : colors.border.mid;
                    return (
                      <div
                        key={item.fieldPath}
                        className="px-4 py-3"
                        style={{
                          borderRadius: 4,
                          border: `1px solid ${active ? `${colors.accent.green}40` : colors.border.default}`,
                          background: active ? `${colors.accent.green}10` : colors.bg.cardAlt,
                          opacity: active ? 1 : 0.75,
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span
                              style={{
                                fontFamily: MONO,
                                fontSize: 9,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                fontWeight: 500,
                                color: colors.text.muted,
                              }}
                            >
                              {item.label}
                            </span>
                            <p
                              className="mt-1 break-words"
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: active ? colors.text.primary : colors.text.muted,
                              }}
                            >
                              {item.value}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                            <StatusPill label={active ? 'Active' : 'Superseded'} tone={tone} />
                            <span
                              className="tabular-nums"
                              style={{ fontFamily: MONO, fontSize: 11, color: active ? colors.accent.green : colors.text.dim }}
                            >
                              {getConfidenceLabel(item.confidence)}
                            </span>
                          </div>
                        </div>

                        {/* Superseded note: what replaced it */}
                        {item.status === 'superseded' && item.replacedBy && (
                          <p className="mt-2" style={{ fontSize: 11, color: colors.text.dim }}>
                            Replaced by{' '}
                            <span style={{ fontWeight: 500, color: colors.text.muted }}>{item.replacedBy.value}</span>
                            {item.replacedBy.documentName && (
                              <> from <span style={{ color: colors.text.muted }}>{item.replacedBy.documentName}</span></>
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
