'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileQuestion,
  Check,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface MissingField {
  key: string;
  label: string;
  description?: string;
  priority?: 'critical' | 'important' | 'optional';
  expectedSource?: string;
  multiline?: boolean;
  type?: 'text' | 'email' | 'tel' | 'url' | 'number';
}

interface MissingDataListProps {
  fields: MissingField[];
  onAddField?: (key: string, value: string) => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  maxVisible?: number;
  className?: string;
  title?: string;
}

export function MissingDataList({
  fields,
  onAddField,
  collapsible = true,
  defaultExpanded = true,
  maxVisible = 5,
  className,
  title = 'Still Needed',
}: MissingDataListProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAll, setShowAll] = useState(false);

  if (fields.length === 0) {
    return null;
  }

  const criticalFields = fields.filter((f) => f.priority === 'critical');
  const otherFields = fields.filter((f) => f.priority !== 'critical');
  const sortedFields = [...criticalFields, ...otherFields];
  const visibleFields = showAll ? sortedFields : sortedFields.slice(0, maxVisible);
  const hiddenCount = sortedFields.length - maxVisible;

  const handleStartEdit = (key: string) => {
    setEditingKey(key);
    setEditValue('');
  };

  const handleSave = (key: string) => {
    if (onAddField && editValue.trim()) {
      onAddField(key, editValue.trim());
    }
    setEditingKey(null);
    setEditValue('');
  };

  const handleCancel = () => {
    setEditingKey(null);
    setEditValue('');
  };

  const getPriorityBadge = (priority?: string) => {
    switch (priority) {
      case 'critical':
        return (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            Critical
          </Badge>
        );
      case 'important':
        return (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50">
            Important
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className={cn('rounded-lg border border-gray-200 bg-gray-50/50', className)}>
      <button
        onClick={() => collapsible && setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center justify-between p-3',
          collapsible && 'hover:bg-gray-100 transition-colors cursor-pointer',
          !collapsible && 'cursor-default'
        )}
        disabled={!collapsible}
      >
        <div className="flex items-center gap-2">
          <FileQuestion className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">{title}</span>
          <Badge variant="secondary" className="text-xs">
            {fields.length}
          </Badge>
          {criticalFields.length > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {criticalFields.length} critical
            </Badge>
          )}
        </div>
        {collapsible && (
          isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200">
          <ul className="divide-y divide-gray-100">
            {visibleFields.map((field) => (
              <li key={field.key} className="p-3">
                {editingKey === field.key ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">
                        {field.label}
                      </label>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancel}
                          className="h-7 w-7 p-0 text-gray-500"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSave(field.key)}
                          className="h-7 w-7 p-0 text-green-600"
                          disabled={!editValue.trim()}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {field.multiline ? (
                      <Textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder={`Enter ${field.label.toLowerCase()}...`}
                        className="text-sm"
                        rows={3}
                        autoFocus
                      />
                    ) : (
                      <Input
                        type={field.type || 'text'}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder={`Enter ${field.label.toLowerCase()}...`}
                        className="text-sm"
                        autoFocus
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">{field.label}</span>
                        {getPriorityBadge(field.priority)}
                      </div>
                      {field.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{field.description}</p>
                      )}
                      {field.expectedSource && (
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Usually found in: {field.expectedSource}
                        </p>
                      )}
                    </div>
                    {onAddField && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStartEdit(field.key)}
                        className="h-7 text-xs shrink-0"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {hiddenCount > 0 && !showAll && (
            <div className="p-2 border-t border-gray-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(true)}
                className="w-full text-xs text-gray-500 hover:text-gray-700"
              >
                Show {hiddenCount} more fields
              </Button>
            </div>
          )}

          {showAll && hiddenCount > 0 && (
            <div className="p-2 border-t border-gray-100">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(false)}
                className="w-full text-xs text-gray-500 hover:text-gray-700"
              >
                Show less
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Compact inline version for smaller spaces
interface MissingDataCompactProps {
  count: number;
  criticalCount?: number;
  onClick?: () => void;
  className?: string;
}

export function MissingDataCompact({
  count,
  criticalCount = 0,
  onClick,
  className,
}: MissingDataCompactProps) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors',
        className
      )}
    >
      <FileQuestion className="w-3.5 h-3.5" />
      <span>{count} missing</span>
      {criticalCount > 0 && (
        <Badge variant="destructive" className="text-[9px] px-1 py-0">
          {criticalCount} critical
        </Badge>
      )}
    </button>
  );
}
