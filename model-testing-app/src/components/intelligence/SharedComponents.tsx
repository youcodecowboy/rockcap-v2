'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CompletenessIndicator } from './CompletenessIndicator';
import {
  Info,
  Trash2,
  Calendar,
  Clock,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

// ============================================================================
// FIELD COMPONENT
// ============================================================================

interface FieldProps {
  label: string;
  value: string | number | undefined;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'email' | 'tel' | 'url';
  placeholder?: string;
  multiline?: boolean;
  source?: string;
  disabled?: boolean;
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  multiline = false,
  source,
  disabled = false,
}: FieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {source && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Info className="w-3 h-3" />
            {source}
          </span>
        )}
      </div>
      {multiline ? (
        <Textarea
          value={value?.toString() || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="text-sm"
          rows={3}
          disabled={disabled}
        />
      ) : (
        <Input
          type={type}
          value={value?.toString() || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="text-sm"
          disabled={disabled}
        />
      )}
    </div>
  );
}

// ============================================================================
// KEY PERSON ROW COMPONENT
// ============================================================================

interface KeyPersonRowProps {
  person: {
    name: string;
    role?: string;
    email?: string;
    phone?: string;
    isDecisionMaker?: boolean;
    notes?: string;
  };
  onUpdate: (field: string, value: any) => void;
  onRemove: () => void;
}

export function KeyPersonRow({ person, onUpdate, onRemove }: KeyPersonRowProps) {
  return (
    <div className="p-3 bg-gray-50 rounded-lg space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex-1 grid grid-cols-2 gap-2">
          <Input
            value={person.name || ''}
            onChange={(e) => onUpdate('name', e.target.value)}
            placeholder="Name"
            className="text-sm"
          />
          <Input
            value={person.role || ''}
            onChange={(e) => onUpdate('role', e.target.value)}
            placeholder="Role"
            className="text-sm"
          />
          <Input
            value={person.email || ''}
            onChange={(e) => onUpdate('email', e.target.value)}
            placeholder="Email"
            type="email"
            className="text-sm"
          />
          <Input
            value={person.phone || ''}
            onChange={(e) => onUpdate('phone', e.target.value)}
            placeholder="Phone"
            type="tel"
            className="text-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="ml-2 text-red-500 hover:text-red-700"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={person.isDecisionMaker || false}
            onChange={(e) => onUpdate('isDecisionMaker', e.target.checked)}
            className="rounded border-gray-300"
          />
          Decision Maker
        </label>
        <Input
          value={person.notes || ''}
          onChange={(e) => onUpdate('notes', e.target.value)}
          placeholder="Notes"
          className="text-sm flex-1"
        />
      </div>
    </div>
  );
}

// ============================================================================
// DOCUMENT SUMMARY CARD
// ============================================================================

interface DocumentSummaryCardProps {
  doc: {
    _id: string;
    fileName: string;
    uploadedAt?: string;
    savedAt?: string;
    category?: string;
    documentCode?: string;
    summary?: string;
    extractedData?: Record<string, any>;
  };
}

export function DocumentSummaryCard({ doc }: DocumentSummaryCardProps) {
  return (
    <div className="p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{doc.fileName}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {new Date(doc.uploadedAt || doc.savedAt || '').toLocaleDateString()} • {doc.category || 'Uncategorized'}
          </p>
        </div>
        {doc.documentCode && (
          <Badge variant="outline" className="text-xs ml-2 shrink-0">
            {doc.documentCode}
          </Badge>
        )}
      </div>
      {doc.summary && (
        <p className="text-sm text-gray-600 mt-2 line-clamp-3">{doc.summary}</p>
      )}
      {doc.extractedData && Object.keys(doc.extractedData).length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500">Extracted Data Available</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MEETING SUMMARY CARD
// ============================================================================

interface MeetingSummaryCardProps {
  meeting: {
    _id: string;
    title?: string;
    emoji?: string;
    content: string | { content?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> };
    tags?: string[];
    aiSummary?: string;
    updatedAt?: string;
    createdAt?: string;
  };
  isLatest?: boolean;
}

export function MeetingSummaryCard({ meeting, isLatest = false }: MeetingSummaryCardProps) {
  const getSummaryText = () => {
    if (typeof meeting.content === 'string') {
      return meeting.content;
    }
    if (meeting.content?.content) {
      const textBlocks = meeting.content.content
        .filter((block: any) => block.type === 'paragraph' && block.content)
        .map((block: any) =>
          block.content
            .filter((node: any) => node.type === 'text')
            .map((node: any) => node.text)
            .join('')
        )
        .filter(Boolean);
      return textBlocks.join('\n\n');
    }
    return '';
  };

  const summaryText = getSummaryText();
  const date = new Date(meeting.updatedAt || meeting.createdAt || '');

  return (
    <div className={`relative pl-6 pb-6 ${!isLatest ? 'border-l-2 border-gray-200' : ''}`}>
      <div className={`absolute left-0 top-0 -translate-x-1/2 w-3 h-3 rounded-full border-2 ${
        isLatest
          ? 'bg-blue-600 border-blue-600'
          : 'bg-white border-gray-300'
      }`} />

      <div className={`p-4 rounded-lg border ${
        isLatest
          ? 'bg-blue-50 border-blue-200'
          : 'bg-white border-gray-200 hover:border-gray-300'
      } transition-colors`}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {meeting.emoji && <span className="text-lg">{meeting.emoji}</span>}
              <h4 className="font-medium text-gray-900 truncate">
                {meeting.title || 'Meeting Notes'}
              </h4>
              {isLatest && (
                <Badge className="bg-blue-600 text-white text-[10px]">Latest</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3" />
              <span>{date.toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              })}</span>
              <span>•</span>
              <Clock className="w-3 h-3" />
              <span>{date.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit'
              })}</span>
            </div>
          </div>
        </div>

        {meeting.tags && meeting.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {meeting.tags.map((tag: string, idx: number) => (
              <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {summaryText && (
          <div className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-6">
            {summaryText}
          </div>
        )}

        {meeting.aiSummary && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1 text-xs text-purple-600 mb-1">
              <Sparkles className="w-3 h-3" />
              <span className="font-medium">AI Summary</span>
            </div>
            <p className="text-sm text-gray-600">{meeting.aiSummary}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SIDEBAR NAVIGATION ITEM
// ============================================================================

interface SidebarItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
  badge?: string | number;
  isMinimized: boolean;
  completeness?: { filled: number; total: number };
  criticalMissing?: number;
}

export function SidebarItem({
  icon: Icon,
  label,
  isActive,
  onClick,
  badge,
  isMinimized,
  completeness,
  criticalMissing,
}: SidebarItemProps) {
  const isComplete = completeness && completeness.filled === completeness.total && completeness.total > 0;
  const hasCritical = criticalMissing && criticalMissing > 0;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors relative ${
        isActive
          ? 'bg-blue-50 text-blue-700 border border-blue-200'
          : 'hover:bg-gray-100 text-gray-700'
      } ${hasCritical && !isActive ? 'border-l-2 border-l-red-400' : ''}`}
      title={isMinimized ? label : undefined}
    >
      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} />
      {!isMinimized && (
        <>
          <span className="flex-1 text-left text-sm font-medium truncate">{label}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasCritical && (
              <Badge variant="destructive" className="text-[9px] px-1 py-0">
                {criticalMissing}
              </Badge>
            )}
            {completeness ? (
              <div className="flex items-center gap-1">
                {isComplete ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <CompletenessIndicator
                    filled={completeness.filled}
                    total={completeness.total}
                    size="sm"
                  />
                )}
              </div>
            ) : badge !== undefined ? (
              <Badge variant={isActive ? 'default' : 'secondary'} className="text-xs">
                {badge}
              </Badge>
            ) : null}
          </div>
        </>
      )}
      {isMinimized && (badge !== undefined || hasCritical) && (
        <span className={`absolute -top-1 -right-1 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center ${
          hasCritical ? 'bg-red-500' : 'bg-blue-600'
        }`}>
          {hasCritical ? criticalMissing : badge}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function formatCurrency(value: number | undefined): string {
  if (!value) return 'N/A';
  return `£${value.toLocaleString()}`;
}
