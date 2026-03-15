'use client';

import { useMemo } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  getCategoryForField,
  getCategoryLucideIcon,
  getConfidenceLabel,
} from './intelligenceUtils';

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
      <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-b border-blue-200">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0 border-blue-300 bg-white hover:bg-blue-100"
          onClick={onBack}
          title="Back to all intelligence"
        >
          <ArrowLeft className="w-4 h-4 text-blue-700" />
        </Button>
        <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <span className="text-sm font-medium text-blue-900 truncate flex-1 min-w-0">
          {documentName}
        </span>
        <span className="text-xs text-blue-600 flex-shrink-0 tabular-nums">
          {totalFields} {totalFields === 1 ? 'field' : 'fields'} extracted
          {activeCount < totalFields && ` (${activeCount} active)`}
        </span>
      </div>

      {/* Category sections */}
      <div className="p-4 space-y-6">
        {groupedByCategory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <FileText className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-sm">No intelligence extracted from this document</p>
          </div>
        ) : (
          groupedByCategory.map(([category, categoryItems], idx) => {
            const IconComponent = getCategoryLucideIcon(category);
            return (
              <div key={category}>
                {idx > 0 && <div className="border-t border-gray-100 -mx-4 mb-6" />}
                {/* Category header */}
                <div className="flex items-center gap-2 mb-3">
                  <IconComponent className="w-4 h-4 text-gray-600" />
                  <h3 className="text-sm font-semibold text-gray-900">{category}</h3>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {categoryItems.length} {categoryItems.length === 1 ? 'field' : 'fields'}
                  </span>
                </div>

                {/* Field cards */}
                <div className="space-y-2">
                  {categoryItems.map((item) => (
                    <div
                      key={item.fieldPath}
                      className={cn(
                        'rounded-lg border px-4 py-3 transition-colors',
                        item.status === 'active'
                          ? 'bg-green-50 border-green-200'
                          : 'bg-gray-50 border-gray-200 opacity-75'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            {item.label}
                          </span>
                          <p className={cn(
                            'mt-1 text-sm font-medium break-words',
                            item.status === 'active' ? 'text-gray-900' : 'text-gray-500'
                          )}>
                            {item.value}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-1.5 py-0',
                              item.status === 'active'
                                ? 'bg-green-100 text-green-800 border-green-300'
                                : 'bg-gray-100 text-gray-600 border-gray-300'
                            )}
                          >
                            {item.status === 'active' ? 'Active' : 'Superseded'}
                          </Badge>
                          <span className={cn(
                            'text-xs tabular-nums',
                            item.status === 'active' ? 'text-green-700' : 'text-gray-400'
                          )}>
                            {getConfidenceLabel(item.confidence)}
                          </span>
                        </div>
                      </div>

                      {/* Superseded note: what replaced it */}
                      {item.status === 'superseded' && item.replacedBy && (
                        <p className="mt-2 text-xs text-gray-400">
                          Replaced by <span className="font-medium text-gray-500">{item.replacedBy.value}</span>
                          {item.replacedBy.documentName && (
                            <> from <span className="text-gray-500">{item.replacedBy.documentName}</span></>
                          )}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
