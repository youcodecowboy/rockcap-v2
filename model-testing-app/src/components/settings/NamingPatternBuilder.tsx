'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  BUILT_IN_TOKENS,
  type DocumentNamingConfig,
  assembleDocumentCode,
  getBuiltInTokenValues,
} from '@/lib/namingConfig';

interface NamingPatternBuilderProps {
  config: DocumentNamingConfig;
  onChange: (config: DocumentNamingConfig) => void;
  sampleClientCode?: string;
  sampleProjectCode?: string;
  sampleCategory?: string;
  disabled?: boolean;
}

export default function NamingPatternBuilder({
  config,
  onChange,
  sampleClientCode = "ACME",
  sampleProjectCode = "PARK28",
  sampleCategory = "Appraisals",
  disabled = false,
}: NamingPatternBuilderProps) {
  const allAvailableTokens = [
    ...BUILT_IN_TOKENS.map((t) => ({ id: t, label: t, isBuiltIn: true })),
    ...config.customTokens.map((t) => ({ id: t.id.toUpperCase(), label: t.label, isBuiltIn: false })),
  ];

  const unusedTokens = allAvailableTokens.filter(
    (t) => !config.pattern.includes(t.id)
  );

  const handleAddToken = (tokenId: string) => {
    onChange({ ...config, pattern: [...config.pattern, tokenId] });
  };

  const handleRemoveToken = (index: number) => {
    const newPattern = [...config.pattern];
    newPattern.splice(index, 1);
    onChange({ ...config, pattern: newPattern });
  };

  const handleMoveToken = (index: number, direction: -1 | 1) => {
    const newPattern = [...config.pattern];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newPattern.length) return;
    [newPattern[index], newPattern[newIndex]] = [newPattern[newIndex], newPattern[index]];
    onChange({ ...config, pattern: newPattern });
  };

  const handleSeparatorChange = (sep: string) => {
    onChange({ ...config, separator: sep });
  };

  // Generate preview
  const sampleTokenValues: Record<string, string> = {
    ...getBuiltInTokenValues(sampleClientCode, sampleCategory, sampleProjectCode),
  };
  for (const ct of config.customTokens) {
    sampleTokenValues[ct.id] = "ABC123";
  }
  const previewCode = assembleDocumentCode(config, sampleTokenValues);

  return (
    <div className="space-y-4">
      {/* Pattern chips */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">Naming Pattern</label>
        <div className="flex flex-wrap items-center gap-1.5 p-3 bg-gray-50 rounded-lg border min-h-[44px]">
          {config.pattern.map((token, index) => (
            <div key={`${token}-${index}`} className="flex items-center gap-0.5">
              {index > 0 && (
                <span className="text-gray-400 text-xs font-mono mx-0.5">{config.separator}</span>
              )}
              <Badge
                variant="secondary"
                className={`text-xs font-mono gap-1 ${
                  (BUILT_IN_TOKENS as readonly string[]).includes(token)
                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                    : 'bg-purple-100 text-purple-700 border-purple-200'
                } ${disabled ? 'opacity-60' : ''}`}
              >
                {!disabled && index > 0 && (
                  <button onClick={() => handleMoveToken(index, -1)} className="hover:text-blue-900">
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                )}
                {token}
                {!disabled && index < config.pattern.length - 1 && (
                  <button onClick={() => handleMoveToken(index, 1)} className="hover:text-blue-900">
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
                {!disabled && (
                  <button onClick={() => handleRemoveToken(index)} className="hover:text-red-600 ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Badge>
            </div>
          ))}

          {/* Add token dropdown */}
          {!disabled && unusedTokens.length > 0 && (
            <Select onValueChange={handleAddToken}>
              <SelectTrigger className="w-auto h-7 text-xs border-dashed gap-1 px-2">
                <Plus className="w-3 h-3" />
                <SelectValue placeholder="Add token" />
              </SelectTrigger>
              <SelectContent>
                {unusedTokens.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.label} {!t.isBuiltIn && <span className="text-purple-500">(custom)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Separator */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Separator</label>
        <Select value={config.separator} onValueChange={handleSeparatorChange} disabled={disabled}>
          <SelectTrigger className="w-20 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="-">- (dash)</SelectItem>
            <SelectItem value="_">_ (underscore)</SelectItem>
            <SelectItem value=".">. (dot)</SelectItem>
            <SelectItem value=" ">(space)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-lg border p-3">
        <p className="text-xs text-gray-500 mb-1">Preview</p>
        <p className="text-sm font-mono font-medium text-gray-900">
          {previewCode || <span className="text-gray-400 italic">No tokens selected</span>}
        </p>
      </div>
    </div>
  );
}
