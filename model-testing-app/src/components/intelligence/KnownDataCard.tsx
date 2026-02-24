'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  FileText,
  User,
  Clock,
  Edit2,
  Check,
  X,
  ExternalLink,
  Sparkles,
  Copy,
  CheckCircle,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface SourceInfo {
  sourceType: 'document' | 'manual' | 'ai' | 'hubspot';
  sourceName?: string;
  sourceId?: string;
  extractedAt?: string;
  confidence?: number;
}

interface KnownDataCardProps {
  label: string;
  value: string | number | undefined;
  source?: SourceInfo;
  editable?: boolean;
  onEdit?: (newValue: string) => void;
  multiline?: boolean;
  type?: 'text' | 'email' | 'tel' | 'url' | 'number';
  className?: string;
  secondaryValue?: string;
  isCritical?: boolean;
}

const sourceIcons = {
  document: FileText,
  manual: User,
  ai: Sparkles,
  hubspot: ExternalLink,
};

const sourceLabels = {
  document: 'From document',
  manual: 'Manually entered',
  ai: 'AI extracted',
  hubspot: 'From HubSpot',
};

export function KnownDataCard({
  label,
  value,
  source,
  editable = true,
  onEdit,
  multiline = false,
  type = 'text',
  className,
  secondaryValue,
  isCritical = false,
}: KnownDataCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value?.toString() || '');
  const [copied, setCopied] = useState(false);

  const handleSave = () => {
    if (onEdit) {
      onEdit(editValue);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value?.toString() || '');
    setIsEditing(false);
  };

  const handleCopy = async () => {
    if (value) {
      await navigator.clipboard.writeText(value.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const SourceIcon = source ? sourceIcons[source.sourceType] : null;

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return diffMins <= 1 ? 'just now' : `${diffMins} mins ago`;
      }
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    }
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (isEditing) {
    return (
      <div className={cn('p-3 bg-blue-50 border border-blue-200 rounded-lg', className)}>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">{label}</label>
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
              onClick={handleSave}
              className="h-7 w-7 p-0 text-green-600"
            >
              <Check className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {multiline ? (
          <Textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="text-sm"
            rows={3}
            autoFocus
          />
        ) : (
          <Input
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="text-sm"
            autoFocus
          />
        )}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div
        className={cn(
          'group p-3 bg-white border rounded-lg hover:border-gray-300 transition-colors',
          isCritical && 'border-l-4 border-l-green-500',
          className
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {label}
              </span>
              {isCritical && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-700 bg-green-50">
                  Critical
                </Badge>
              )}
            </div>
            <div className="mt-1">
              <p className="text-sm font-medium text-gray-900 break-words">
                {value || <span className="text-gray-400 italic">Not set</span>}
              </p>
              {secondaryValue && (
                <p className="text-xs text-gray-500 mt-0.5">{secondaryValue}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {value && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopy}
                    className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                  >
                    {copied ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy</TooltipContent>
              </Tooltip>
            )}
            {editable && onEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsEditing(true)}
                    className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {source && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              {SourceIcon && <SourceIcon className="w-3 h-3" />}
              <span>{sourceLabels[source.sourceType]}</span>
              {source.sourceName && (
                <>
                  <span>•</span>
                  <span className="text-gray-500 truncate max-w-[150px]">
                    {source.sourceName}
                  </span>
                </>
              )}
              {source.extractedAt && (
                <>
                  <span>•</span>
                  <Clock className="w-3 h-3" />
                  <span>{formatDate(source.extractedAt)}</span>
                </>
              )}
              {source.confidence && source.confidence < 1 && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1">
                  {Math.round(source.confidence * 100)}% confident
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// Compact version for inline display
interface KnownDataInlineProps {
  label: string;
  value: string | number | undefined;
  className?: string;
}

export function KnownDataInline({ label, value, className }: KnownDataInlineProps) {
  if (!value) return null;

  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <span className="text-xs text-gray-500">{label}:</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}
